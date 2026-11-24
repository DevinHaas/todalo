// Loaded before src/main.tsx in PERF_REACT_SCAN=1 builds only (vite.config.ts), so React Scan's
// devtools hook is in place when react-dom initialises. The harness reads window.__scan.
import { scan } from "react-scan";

type Tally = { renders: number; unnecessary: number; time: number; why: Record<string, number> };
const kinds = ["props", "state", "state", "context"]; // React Scan's ChangeReason order
const tallies = new Map<string, Tally>();

// `?noscan`: the same unminified build without React Scan (perf/profile.ts reads readable names from it).
scan({
  enabled: !location.search.includes("noscan"), dangerouslyForceRunInProduction: true, showToolbar: false, log: false, trackUnnecessaryRenders: true,
  onRender(fiber, renders) {
    const type = (fiber as { type?: { displayName?: string; name?: string } | string }).type;
    const name = renders[0]?.componentName ?? (typeof type === "string" ? type : type?.displayName ?? type?.name) ?? "anonymous";
    const tally = tallies.get(name) ?? { renders: 0, unnecessary: 0, time: 0, why: {} };
    tally.renders += 1;
    // Why it rendered: the changed props, state or context (a mount has none).
    const changes = renders.flatMap(render => render.changes ?? []);
    for (const change of changes.length ? changes : [{ type: -1, name: "mount/parent" }]) {
      const key = `${kinds[(change as { type: number }).type] ?? "other"}:${(change as { name?: string }).name ?? "?"}`;
      tally.why[key] = (tally.why[key] ?? 0) + 1;
    }
    if (renders.some(render => render.unnecessary)) tally.unnecessary += 1;
    tally.time += renders.reduce((sum, render) => sum + (render.time ?? 0), 0);
    tallies.set(name, tally);
  },
});

Object.assign(window, {
  __scan: {
    reset: () => tallies.clear(),
    report: () => [...tallies].map(([name, tally]) => ({ name, ...tally })).sort((a, b) => b.renders - a.renders),
  },
});
