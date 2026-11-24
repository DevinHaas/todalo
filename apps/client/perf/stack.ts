// Starts an isolated stack for the perf harness: the API on the perf Neon branch (perf/.env.perf,
// never the root .env database) and two `vite preview` servers over production builds:
// PROD (minified, what users get) and SCAN (unminified, React Scan loaded first, for render counts).
import { spawn, type Subprocess } from "bun";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

export const client = new URL("..", import.meta.url).pathname;
export const root = new URL("../../..", import.meta.url).pathname;
export const API_PORT = 3101, PROD_PORT = 4173, SCAN_PORT = 4174;
export const PROD = `http://127.0.0.1:${PROD_PORT}`, SCAN = `http://127.0.0.1:${SCAN_PORT}`, API = `http://127.0.0.1:${API_PORT}`;

function perfDatabase() {
  const file = `${client}perf/.env.perf`;
  const url = process.env.PERF_DATABASE_URL ?? (existsSync(file) ? readFileSync(file, "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1] : undefined);
  if (!url) throw new Error("Set PERF_DATABASE_URL or write DATABASE_URL=<neon test branch> to apps/client/perf/.env.perf");
  const main = readFileSync(`${root}.env`, "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1];
  if (main && new URL(main).hostname === new URL(url).hostname) throw new Error("perf database is the root .env database; use a Neon test branch");
  return url.trim();
}

async function run(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const proc = spawn(cmd, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = [await new Response(proc.stdout).text(), await new Response(proc.stderr).text(), await proc.exited];
  if (code !== 0) throw new Error(`${cmd.join(" ")} failed\n${out}\n${err}`);
  return out;
}

/** Production build (ANALYZE=1: bundle treemap at perf/results/bundle.html) and the React Scan build. */
export async function build() {
  await run(["bun", "x", "vite", "build", "--outDir", "perf/.build/prod", "--emptyOutDir"], client, { ANALYZE: "1" });
  await run(["bun", "x", "vite", "build", "--outDir", "perf/.build/scan", "--emptyOutDir"], client, { PERF_REACT_SCAN: "1" });
}

async function ready(url: string, proc: Subprocess, timeout = 60_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (proc.exitCode !== null) throw new Error(`${url}: server exited (${proc.exitCode})`);
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await Bun.sleep(250);
  }
  throw new Error(`${url} did not come up`);
}

let queryLines = 0;
/** DB queries the perf API has made so far. */
export const queries = () => queryLines;

export async function start() {
  const origins = `${PROD},${SCAN}`;
  const api = spawn(["bun", `--env-file=${root}.env`, "src/index.ts"], {
    cwd: `${root}apps/api`, stdout: "pipe", stderr: Bun.file(`${client}perf/.build/api.err.log`),
    env: { ...process.env, DB_QUERY_LOG: "1", DATABASE_URL: perfDatabase(), RAMBLE_PORT: String(API_PORT), AUTH_TRUSTED_ORIGINS: origins, RAMBLE_ALLOWED_ORIGINS: origins },
  });
  const preview = (dir: string, port: number) => spawn(["bun", "x", "vite", "preview", "--outDir", dir, "--port", String(port), "--strictPort"], {
    cwd: client, stdout: "ignore", stderr: "inherit", env: { ...process.env, CLIENT_API_PROXY_TARGET: API },
  });
  // DB_QUERY_LOG: each "[db]" line is one query (queries() counts them; the log keeps them).
  writeFileSync(`${client}perf/.build/api.log`, "");
  void (async () => {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of api.stdout) {
      const lines = (rest + decoder.decode(chunk)).split("\n");
      rest = lines.pop()!;
      queryLines += lines.filter(line => line.startsWith("[db] ")).length;
      appendFileSync(`${client}perf/.build/api.log`, lines.join("\n") + "\n");
    }
  })();
  const servers = [api, preview("perf/.build/prod", PROD_PORT), preview("perf/.build/scan", SCAN_PORT)];
  const stop = () => { for (const server of servers) server.kill(); };
  try {
    await ready(`${API}/api/ramble/health`, api);
    await ready(PROD, servers[1]); await ready(SCAN, servers[2]);
  } catch (error) { stop(); throw error; }
  return stop;
}
