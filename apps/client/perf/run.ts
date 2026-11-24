// The perf harness. `bun perf/run.ts --label <name>` from apps/client:
//   builds (prod + React Scan), starts an isolated API + previews (stack.ts), resets the seed data
//   (seed.ts), runs every scenario --runs times on the prod build (timings) and once on the scan
//   build (render counts), benches each API route the app read, sizes the bundle, and writes
//   perf/results/<label>.json + .md. Options: --runs N (5) --cpu N (CDP CPU throttle, 1)
//   --skip-build --skip-api --only a,b --compare <label>.
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { build, client, queries, start, API, PROD, SCAN } from "./stack";
import { seed, signIn } from "./seed";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => { const at = argv.indexOf(`--${name}`); return at < 0 ? fallback : argv[at + 1]; };
const label = flag("label", "adhoc")!, runs = Number(flag("runs", "5")), cpu = Number(flag("cpu", "1"));
const only = flag("only")?.split(","), compare = flag("compare");
const results = `${client}perf/results`;
mkdirSync(results, { recursive: true });
const probe = readFileSync(`${client}perf/probe.js`, "utf8");

type Sample = { ms: number; dom?: number; inp?: number; tbt?: number; [extra: string]: unknown };
type Renders = { total: number; unnecessary: number; top: { name: string; renders: number; unnecessary: number }[] };
const timings: Record<string, Sample[]> = {};
const renders: Record<string, Renders> = {};
const record = (name: string, sample: Sample) => (timings[name] ??= []).push(sample);

declare global { interface Window { __perf: any; __scan?: { reset(): void; report(): { name: string; renders: number; unnecessary: number; time: number }[] } } }

// ---------------------------------------------------------------- page helpers
const rows = "main .task-row";
const onToday = `location.pathname === "/today" && document.querySelector("main h1")?.textContent === "Today" && document.querySelectorAll(${JSON.stringify(rows)}).length > 50`;

async function page(context: BrowserContext) {
  const page = await context.newPage();
  if (cpu > 1) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: cpu });
  return page;
}

/** Runs `action` and resolves input → first frame after `cond` holds, with Event Timing / long-task stats and (scan build) renders. */
async function measure(page: Page, action: () => Promise<unknown>, cond: string, scan?: string): Promise<Sample> {
  const since: number = await page.evaluate(() => { window.__scan?.reset(); return window.__perf.now(); });
  const result = page.evaluate(([cond, since]) => window.__perf.until(cond, { since }), [cond, since] as const);
  await action();
  const sample = await result;
  const stats = await page.evaluate(since => window.__perf.stats(since), since);
  if (scan) {
    const report = await page.evaluate(() => window.__scan?.report() ?? []);
    const prior = renders[scan];
    const total = report.reduce((sum, row) => sum + row.renders, 0), unnecessary = report.reduce((sum, row) => sum + row.unnecessary, 0);
    // Keep the worst (largest) render pass per scenario.
    if (!prior || total > prior.total) renders[scan] = { total, unnecessary, top: report.slice(0, 10).map(({ name, renders, unnecessary }) => ({ name, renders, unnecessary })) };
  }
  return { ...sample, ...stats };
}

const closeSheet = async (page: Page) => { await page.click(".task-sheet button[aria-label=Close]"); await page.waitForSelector(".task-sheet", { state: "detached" }); };
const seedRow = (page: Page, group: string, n: number) => page.locator(`${rows}:has(.task-title:text-matches("^Perf seed ${group} ${String(n).padStart(3, "0")}"))`).first();

// ---------------------------------------------------------------- scenarios
type Scenario = (ctx: { browser: Browser; state: string; base: string; run: number; scan: boolean }) => Promise<void>;
const name = (scan: boolean, id: string) => scan ? id : undefined;

const scenarios: Record<string, Scenario> = {
  async load({ browser, state, base, scan }) {
    // Cold: fresh context (empty HTTP cache, signed-in cookie). Warm: reload in the same context.
    const context = await browser.newContext({ storageState: JSON.parse(state), viewport: { width: 1440, height: 900 } });
    await context.addInitScript(probe);
    const p = await page(context);
    for (const kind of ["cold", "warm"] as const) {
      // Warm: the user comes back a few seconds later (the cache is persisted on a 1 s throttle).
      if (kind === "cold") await p.goto(`${base}/today`); else { await p.waitForTimeout(3000); await p.reload(); }
      const ready = await p.evaluate(cond => window.__perf.until(cond, { input: false }), onToday);
      const load = await p.evaluate(() => window.__perf.load());
      if (!scan) record(`load:${kind}`, { ms: ready.ms, dom: ready.dom, ...load, api: undefined, apiChain: load.api.map((r: { path: string; start: number; end: number }) => `${r.path} ${r.start}→${r.end}`).join(", ") });
    }
    await context.close();
  },

  async tabs({ browser, state, base, scan }) {
    const context = await browser.newContext({ storageState: JSON.parse(state), viewport: { width: 1440, height: 900 } });
    await context.addInitScript(probe);
    const p = await page(context);
    await p.goto(`${base}/today`); await p.evaluate(cond => window.__perf.until(cond, { input: false }), onToday);
    // As in `interactions`: the rest of the startup reads land first, so a switch measures the switch.
    await p.waitForTimeout(1000);
    const tab = (path: string, title: string, min: number) => `location.pathname === "${path}" && document.querySelector("main h1")?.textContent?.startsWith("${title}") && document.querySelectorAll("main [data-task-id]").length > ${min}`;
    const seen = new Set<string>();
    for (let i = 0; i < 2; i++) for (const [path, title, min] of [["/inbox", "Inbox", 10], ["/today", "Today", 50], ["/upcoming", "Upcoming", 10]] as const) {
      const id = `tab:${title.toLowerCase()}${seen.has(path) ? "" : " (first)"}`; seen.add(path);
      const sample = await measure(p, () => p.click(`aside a[href="${path}"]`), tab(path, title, min), name(scan, id));
      if (!scan) record(id, sample);
    }
    await context.close();
  },

  async interactions({ browser, state, base, run, scan }) {
    const context = await browser.newContext({ storageState: JSON.parse(state), viewport: { width: 1440, height: 900 } });
    await context.addInitScript(probe);
    const p = await page(context);
    await p.goto(`${base}/today`); await p.evaluate(cond => window.__perf.until(cond, { input: false }), onToday);
    await p.waitForTimeout(500);
    const n = 1 + run * 7 + (scan ? 100 : 0);

    // Open a task sheet from its row title.
    let row = seedRow(p, "today", n);
    let id = await row.getAttribute("data-task-id");
    let sample = await measure(p, () => row.locator(".task-title").click(), `document.querySelector(".task-sheet [aria-label='Task name']")`, name(scan, "sheet:open"));
    if (!scan) record("sheet:open", sample);

    // Type in the sheet title, then Enter saves: input → the list row shows the new title.
    const title = p.locator(".task-sheet [aria-label='Task name']");
    const current = await title.inputValue();
    const next = current.endsWith(" e") ? current.slice(0, -2) : `${current} e`;
    await title.click(); await p.keyboard.press("End");
    sample = await measure(p, () => current.endsWith(" e") ? p.keyboard.press("Backspace").then(() => p.keyboard.press("Backspace")) : p.keyboard.type(" e"),
      `document.querySelector(".task-sheet [aria-label='Task name']").value === ${JSON.stringify(next)}`, name(scan, "sheet:type"));
    if (!scan) record("sheet:type", sample);
    sample = await measure(p, () => p.keyboard.press("Enter"), `document.querySelector('main [data-task-id="${id}"] .task-title')?.textContent === ${JSON.stringify(next)}`, name(scan, "edit:title"));
    if (!scan) record("edit:title", sample);
    await p.waitForTimeout(300);
    await closeSheet(p);

    // Complete: input → the row checks or leaves; then the server's answer.
    row = seedRow(p, "today", n + 1);
    id = await row.getAttribute("data-task-id");
    const confirmed = p.waitForResponse(response => response.url().includes(`/tasks/${id}/complete`));
    sample = await measure(p, () => row.locator("[role=checkbox]").click(),
      `!document.querySelector('main [data-task-id="${id}"]') || document.querySelector('main [data-task-id="${id}"] [role=checkbox]')?.getAttribute("aria-checked") === "true"`, name(scan, "complete"));
    await confirmed;
    const server = await p.evaluate(id => { const entry = performance.getEntriesByType("resource").filter(e => e.name.includes(`/tasks/${id}/complete`)).at(-1) as PerformanceResourceTiming; return [entry.responseEnd - entry.startTime, entry.requestStart - entry.startTime]; }, id);
    // `queued`: waiting for a connection. The preview server is HTTP/1.1 (6 per host) and the open
    // sheet's reads can hold them all; production (Cloudflare, HTTP/2) and the apps (HTTP/2) don't queue.
    if (!scan) record("complete", { ...sample, server: server[0], queued: server[1] });

    // Today's composer: open, type 40 characters, Enter adds the row.
    const text = `Perf composer ${label} ${run} ${"x".repeat(20)}`.slice(0, 40);
    sample = await measure(p, () => p.locator("main button.composer").click(), `document.activeElement?.getAttribute("aria-label") === "Task name"`, name(scan, "composer:open"));
    if (!scan) record("composer:open", sample);
    sample = await measure(p, () => p.keyboard.type(text), `document.activeElement?.value === ${JSON.stringify(text)}`, name(scan, "composer:type40"));
    if (!scan) record("composer:type40", { ...sample, perKey: sample.ms / text.length });
    sample = await measure(p, () => p.keyboard.press("Enter"), `[...document.querySelectorAll("main .task-title")].some(t => t.textContent === ${JSON.stringify(text.trim())})`, name(scan, "composer:add")); // titles are saved trimmed
    if (!scan) record("composer:add", sample);
    await p.keyboard.press("Escape");

    // Scroll the long Today list.
    await p.mouse.click(5, 5);
    const scroll = await p.evaluate(() => window.__perf.scroll("main .task-row"));
    if (!scan) record("scroll:today", { ms: scroll.p95, ...scroll });

    // Quick add on the Inbox: open the dialog, type, Enter → the optimistic row; server answer → "Added".
    await p.click(`aside a[href="/inbox"]`);
    await p.waitForFunction(() => document.querySelector("main h1")?.textContent?.startsWith("Inbox"));
    sample = await measure(p, () => p.click("aside button.add-task"), `document.querySelector('[role=dialog][aria-label="Add task"] input[aria-label="Task name"]')`, name(scan, "quickadd:open"));
    if (!scan) record("quickadd:open", sample);
    const quick = `Perf quick ${label} ${run}`;
    await p.keyboard.type(quick);
    sample = await measure(p, () => p.keyboard.press("Enter"), `[...document.querySelectorAll("main .task-title")].some(t => t.textContent === ${JSON.stringify(quick)})`, name(scan, "quickadd:add"));
    const saved = await p.evaluate(() => window.__perf.until(`document.querySelector('[role=dialog][aria-label="Add task"] [role=status]')?.textContent?.startsWith("Added")`, { input: false, since: 0 }));
    if (!scan) record("quickadd:add", { ...sample, savedAt: saved.at - sample.inputAt! as number });
    await context.close();
  },

  async upcoming({ browser, state, base, scan }) {
    if (scan) return;
    const context = await browser.newContext({ storageState: JSON.parse(state), viewport: { width: 1440, height: 900 } });
    await context.addInitScript(probe);
    const p = await page(context);
    for (const kind of ["cold", "warm"] as const) {
      if (kind === "cold") await p.goto(`${base}/upcoming`); else { await p.waitForTimeout(3000); await p.reload(); }
      const ready = await p.evaluate(() => window.__perf.until(`location.pathname === "/upcoming" && document.querySelectorAll("main [data-task-id]").length > 10`, { input: false }));
      const load = await p.evaluate(() => window.__perf.load());
      record(`upcoming:${kind}`, { ms: ready.ms, domNodes: load.domNodes, apiCount: load.apiCount });
    }
    const scroll = await p.evaluate(() => window.__perf.scroll("main [data-task-id]"));
    record("scroll:upcoming", { ms: scroll.p95, ...scroll });
    await context.close();
  },

  async sync({ browser, state, base, run, scan }) {
    if (scan) return;
    // Two devices: A completes a task, B (already on Today) shows it gone/checked. Absolute clocks, same machine.
    const open = async () => {
      const context = await browser.newContext({ storageState: JSON.parse(state), viewport: { width: 1440, height: 900 } });
      await context.addInitScript(probe);
      const p = await page(context);
      await p.goto(`${base}/today`); await p.evaluate(cond => window.__perf.until(cond, { input: false }), onToday);
      return { context, p };
    };
    const a = await open(), b = await open();
    await b.p.waitForTimeout(1500); // let B's live stream connect
    const row = seedRow(a.p, "today", 60 + run);
    const id = await row.getAttribute("data-task-id");
    const seen = b.p.evaluate(id => window.__perf.until(`!document.querySelector('main [data-task-id="${id}"]') || document.querySelector('main [data-task-id="${id}"] [role=checkbox]')?.getAttribute("aria-checked") === "true"`, { input: false, timeout: 90_000 }), id);
    const since = await a.p.evaluate(() => window.__perf.now());
    const local = a.p.evaluate(([id, since]) => window.__perf.until(`!document.querySelector('main [data-task-id="${id}"]') || document.querySelector('main [data-task-id="${id}"] [role=checkbox]')?.getAttribute("aria-checked") === "true"`, { since }), [id, since] as const);
    await row.locator("[role=checkbox]").click();
    const [mine, theirs] = await Promise.all([local, seen]);
    record("sync:other-device", { ms: theirs.at - mine.inputAt });
    await a.context.close(); await b.context.close();
  },
};

// ---------------------------------------------------------------- API routes and bundle
const queryCount = queries;
async function benchApi(paths: string[], cookie: string) {
  const out: Record<string, { queries: number; p50: number; p95: number; kb: number; gzipKB: number; brotliKB: number; encoding: string }> = {};
  for (const path of paths) {
    const times: number[] = []; let body = new Uint8Array(); let encoding = "";
    for (let i = 0; i < 12; i++) {
      const started = performance.now();
      const response = await fetch(`${API}${path}`, { headers: { cookie, "accept-encoding": "gzip, br" }, signal: AbortSignal.timeout(10_000) });
      body = new Uint8Array(await response.arrayBuffer()); encoding = response.headers.get("content-encoding") ?? "none";
      if (i > 1) times.push(performance.now() - started); // first two warm the connection and the branch's compute
    }
    // DB queries one request makes (stack.ts runs the API with DB_QUERY_LOG=1).
    const before = queryCount();
    await (await fetch(`${API}${path}`, { headers: { cookie } })).arrayBuffer();
    await Bun.sleep(150);
    const queries = queryCount() - before;
    times.sort((a, b) => a - b);
    out[path] = { queries, p50: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], kb: body.length / 1024, gzipKB: gzipSync(body).length / 1024, brotliKB: brotliCompressSync(body).length / 1024, encoding };
  }
  return out;
}

/** The writes the scenarios make, one at a time: time and DB queries each (the live publish after it included). */
async function benchWrites(api: import("playwright").APIRequestContext) {
  const out: Record<string, { queries: number; p50: number; p95: number }> = {};
  const time = async (label: string, write: () => Promise<{ ok(): boolean; status(): number }>) => {
    const before = queryCount(), started = performance.now();
    const response = await write();
    const ms = performance.now() - started;
    if (!response.ok()) console.warn(`write bench ${label}: HTTP ${response.status()}`);
    await Bun.sleep(1500); // the after-response publish verifies the session again
    const row = out[label] ??= { queries: 0, p50: 0, p95: 0, samples: [] as number[] } as any;
    (row as any).samples.push(ms); row.queries = queryCount() - before;
  };
  for (let i = 0; i < 5; i++) {
    const id = crypto.randomUUID();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    await time("POST /api/v1/tasks", () => api.post("/api/v1/tasks", { data: { id, title: `Perf quick bench ${i}`, dueDate: today.toISOString() } }));
    const task = (await (await api.get(`/api/v1/tasks/${id}`)).json()).task;
    await time("PATCH /api/v1/tasks/:id", () => api.patch(`/api/v1/tasks/${id}`, { data: { updatedAt: task.updatedAt, title: `Perf quick bench ${i} e`, description: "", priority: 4, deadline: null, dueDate: task.dueDate, dueDateEnd: null, recurrence: null } }));
    await time("POST /api/v1/tasks/:id/complete", () => api.post(`/api/v1/tasks/${id}/complete`, { data: { occurrence: task.dueDate, operationId: crypto.randomUUID() } }));
    await time("DELETE /api/v1/tasks/:id", () => api.delete(`/api/v1/tasks/${id}`));
  }
  for (const row of Object.values(out) as any[]) { const s = row.samples.sort((a: number, b: number) => a - b); row.p50 = s[Math.floor(s.length / 2)]; row.p95 = s.at(-1); delete row.samples; }
  return out;
}

function bundle() {
  const dir = `${client}perf/.build/prod`;
  const html = readFileSync(`${dir}/index.html`, "utf8");
  const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map(m => m[1]);
  const size = (file: string) => { const bytes = readFileSync(`${dir}${file}`); return { kb: bytes.length / 1024, gzipKB: gzipSync(bytes).length / 1024 }; };
  const assets = readdirSync(`${dir}/assets`).filter(f => /\.(js|css)$/.test(f)).map(f => ({ file: `/assets/${f}`, ...size(`/assets/${f}`) }));
  const sum = (list: { kb: number; gzipKB: number }[]) => ({ kb: list.reduce((s, a) => s + a.kb, 0), gzipKB: list.reduce((s, a) => s + a.gzipKB, 0) });
  return {
    initialJS: sum(initial.filter(f => f.endsWith(".js")).map(size)), initialCSS: sum(initial.filter(f => f.endsWith(".css")).map(size)),
    totalJS: sum(assets.filter(a => a.file.endsWith(".js"))), chunks: assets.filter(a => a.file.endsWith(".js")).length,
    largest: assets.sort((a, b) => b.kb - a.kb).slice(0, 6).map(a => `${a.file.replace("/assets/", "")} ${a.kb.toFixed(0)}KB (${a.gzipKB.toFixed(0)} gz)`),
  };
}

// ---------------------------------------------------------------- report
const pct = (values: number[], p: number) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]; };
const fmt = (n: number | undefined) => n === undefined || Number.isNaN(n) ? "–" : n >= 100 ? n.toFixed(0) : n.toFixed(1);

function summarize() {
  return Object.fromEntries(Object.entries(timings).map(([id, samples]) => {
    const pick = (key: string) => samples.map(s => s[key]).filter((v): v is number => typeof v === "number");
    const extra: Record<string, number> = {};
    for (const key of ["dom", "inp", "tbt", "server", "queued", "savedAt", "perKey", "fcp", "lcp", "ttfb", "jsKB", "apiCount", "domNodes", "janky", "max"]) { const v = pick(key); if (v.length) extra[key] = pct(v, 0.5); }
    return [id, { p50: pct(pick("ms"), 0.5), p95: pct(pick("ms"), 0.95), n: samples.length, ...extra, ...(samples[0].apiChain ? { apiChain: samples[0].apiChain } : {}) }];
  }));
}

function markdown(report: any, base?: any) {
  const lines = [`# Perf run: ${report.meta.label}`, "", `${report.meta.date} · git ${report.meta.git} · runs ${report.meta.runs} · CPU ×${report.meta.cpu} · ${report.meta.tasks} tasks`, "",
    "## Scenarios (ms, input → first frame after the change; loads from navigation start)", "",
    `| scenario | p50 | p95 | ${base ? "base p50 | Δ | " : ""}INP | TBT | extra |`, `|---|---|---|${base ? "---|---|" : ""}---|---|---|`];
  for (const [id, s] of Object.entries<any>(report.summary)) {
    const b = base?.summary?.[id];
    const extras = Object.entries(s).filter(([k]) => !["p50", "p95", "n", "inp", "tbt", "dom", "apiChain"].includes(k)).map(([k, v]) => `${k} ${fmt(v as number)}`).join(", ");
    lines.push(`| ${id} | ${fmt(s.p50)} | ${fmt(s.p95)} | ${base ? `${fmt(b?.p50)} | ${b ? `${((s.p50 / b.p50 - 1) * 100).toFixed(0)}%` : "–"} | ` : ""}${fmt(s.inp)} | ${fmt(s.tbt)} | ${extras} |`);
  }
  const chain = report.summary["load:cold"]?.apiChain;
  if (chain) lines.push("", `Cold load API waterfall (start→end ms): ${chain}`);
  lines.push("", "## React renders per interaction (React Scan, scan build, worst pass)", "", "| scenario | renders | unnecessary | top components |", "|---|---|---|---|");
  for (const [id, r] of Object.entries<Renders>(report.renders)) lines.push(`| ${id} | ${r.total} | ${r.unnecessary} | ${r.top.slice(0, 6).map(t => `${t.name} ${t.renders}`).join(", ")} |`);
  lines.push("", "## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)", "", "| route | queries | p50 | p95 | KB | gzip | br | served |", "|---|---|---|---|---|---|---|---|");
  for (const [path, r] of Object.entries<any>(report.api)) lines.push(`| ${path} | ${r.queries ?? "–"} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.kb)} | ${fmt(r.gzipKB)} | ${fmt(r.brotliKB)} | ${r.encoding} |`);
  const bu = report.bundle;
  lines.push("", "## Bundle (prod build)", "", `Initial JS ${fmt(bu.initialJS.kb)} KB (${fmt(bu.initialJS.gzipKB)} gz) · initial CSS ${fmt(bu.initialCSS.kb)} KB (${fmt(bu.initialCSS.gzipKB)} gz) · all JS ${fmt(bu.totalJS.kb)} KB in ${bu.chunks} chunks`, "", ...bu.largest.map((l: string) => `- ${l}`), "");
  return lines.join("\n");
}

// ---------------------------------------------------------------- main
if (!argv.includes("--skip-build")) { console.log("building…"); await build(); }
const stop = await start();
try {
  const api = await signIn(PROD);
  console.log("seed:", await seed(api));
  const state = JSON.stringify(await api.storageState());
  const cookie = (await api.storageState()).cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const browser = await chromium.launch();
  const apiPaths = new Set<string>();
  const selected = Object.entries(scenarios).filter(([id]) => !only || only.includes(id));
  for (let run = 0; run < runs; run++) for (const [id, scenario] of selected) {
    process.stdout.write(`run ${run + 1}/${runs} ${id}… `);
    await scenario({ browser, state, base: PROD, run, scan: false });
    console.log("ok");
  }
  for (const [id, scenario] of selected) {
    process.stdout.write(`scan ${id}… `);
    await scenario({ browser, state, base: SCAN, run: 0, scan: true });
    console.log("ok");
  }
  // The reads a cold Today load makes, benched directly against the API.
  const context = await browser.newContext({ storageState: JSON.parse(state) });
  const p = await context.newPage();
  p.on("request", r => { const url = new URL(r.url()); if (r.method() === "GET" && url.pathname.startsWith("/api/") && !url.pathname.endsWith("/stream")) apiPaths.add(url.pathname + url.search); });
  await p.addInitScript(probe);
  for (const path of ["/today", "/inbox", "/upcoming"]) { await p.goto(`${PROD}${path}`); await p.waitForTimeout(2500); }
  await context.close();
  await browser.close();
  const report = {
    meta: { label, date: new Date().toISOString(), git: (await Bun.$`git rev-parse --short HEAD`.cwd(client).text()).trim() + "+wip", runs, cpu, tasks: (await (await api.get("/api/v1/today")).json()).tasks.length },
    summary: summarize(), renders, api: argv.includes("--skip-api") ? {} : { ...await benchApi([...apiPaths].sort(), cookie), ...await benchWrites(api) }, bundle: bundle(), samples: timings,
  };
  console.log("cleanup:", await seed(api));
  writeFileSync(`${results}/${label}.json`, JSON.stringify(report, null, 2));
  const base = compare && existsSync(`${results}/${compare}.json`) ? JSON.parse(readFileSync(`${results}/${compare}.json`, "utf8")) : undefined;
  writeFileSync(`${results}/${label}.md`, markdown(report, base));
  console.log(markdown(report, base));
} finally { stop(); }
