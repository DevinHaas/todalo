// Native IPC round trip, run inside the Tauri app (vite.config.ts injects it with PERF_IPC_BENCH=1;
// perf/README.md). `feedback` does no I/O on desktop (haptics are a no-op there), so its time is the
// webview → Rust → webview hop; an oversized invalid argument measures moving a /today-sized
// payload across it. Results go to the bench dev server's /__ipcbench, which prints them.
import { invoke, isTauri } from "@tauri-apps/api/core";

const time = async (runs: number, args: Record<string, unknown>) => {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    try { await invoke("feedback", args); } catch { /* the oversized payload is refused: still a round trip */ }
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return { p50: times[Math.floor(runs / 2)], p95: times[Math.floor(runs * 0.95)] };
};

if (isTauri()) setTimeout(async () => {
  const small = await time(300, { event: "press" });
  const large = await time(40, { event: "x".repeat(170 * 1024) });
  const started = performance.now();
  await Promise.all(Array.from({ length: 15 }, () => invoke("feedback", { event: "press" }).catch(() => undefined)));
  const parallel15 = performance.now() - started;
  await fetch("/__ipcbench", { method: "POST", body: JSON.stringify({ small, large, parallel15 }) });
}, 4000);
