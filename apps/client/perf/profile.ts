// CPU profile of one interaction on the unminified build (SCAN, React Scan off via ?noscan):
//   bun perf/profile.ts complete|sheet|tab-inbox|tab-upcoming|quickadd|type [--skip-build]
// Prints the top functions by self time and by total (inclusive) time.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { build, client, start, SCAN } from "./stack";
import { seed, signIn } from "./seed";

const scenario = process.argv[2] ?? "complete";
if (!process.argv.includes("--skip-build")) await build();
const stop = await start();
try {
  const api = await signIn(SCAN);
  await seed(api);
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: await api.storageState(), viewport: { width: 1440, height: 900 } });
  await context.addInitScript(readFileSync(`${client}perf/probe.js`, "utf8"));
  const page = await context.newPage();
  await page.goto(`${SCAN}/today?noscan`);
  await page.waitForFunction(() => document.querySelectorAll("main .task-row").length > 50);
  await page.waitForTimeout(1500);
  const actions: Record<string, () => Promise<unknown>> = {
    complete: () => page.locator("main .task-row [role=checkbox]").nth(5).click(),
    sheet: () => page.locator("main .task-row .task-title").nth(5).click(),
    "tab-inbox": () => page.click(`aside a[href="/inbox"]`),
    "tab-upcoming": () => page.click(`aside a[href="/upcoming"]`),
    quickadd: () => page.click("aside button.add-task"),
    type: () => page.keyboard.type("Buy milk tomorrow at 5pm #errand p2"),
  };
  // The composer is open and focused before profiling starts, so only the keystrokes are recorded.
  if (scenario === "type") { await page.locator("main button.composer").click(); await page.waitForTimeout(300); }
  const cdp = await context.newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
  await cdp.send("Profiler.start");
  await actions[scenario]();
  await page.waitForTimeout(600);
  const { profile } = await cdp.send("Profiler.stop") as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }[]; samples: number[]; timeDeltas: number[] } };
  const byId = new Map(profile.nodes.map(node => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const label = (id: number) => { const { functionName, url, lineNumber } = byId.get(id)!.callFrame; return `${functionName || "(anonymous)"} ${url.split("/").pop()}:${lineNumber + 1}`; };
  const self = new Map<string, number>(), total = new Map<string, number>();
  profile.samples.forEach((id, i) => {
    const ms = (profile.timeDeltas[i] ?? 0) / 1000;
    const name = label(id);
    if (/^\((idle|program|garbage collector)\)/.test(name)) { self.set(name, (self.get(name) ?? 0) + ms); return; }
    self.set(name, (self.get(name) ?? 0) + ms);
    const seen = new Set<string>();
    for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) { const n = label(at); if (!seen.has(n)) { seen.add(n); total.set(n, (total.get(n) ?? 0) + ms); } }
  });
  const top = (map: Map<string, number>, n: number) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(1).padStart(7)} ms  ${k}`).join("\n");
  console.log(`# ${scenario}: self time\n${top(self, 25)}\n\n# inclusive time\n${top(total, 30)}`);
  await browser.close();
} finally { stop(); }
