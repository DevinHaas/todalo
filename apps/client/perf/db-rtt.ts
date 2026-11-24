// Read-only probe: how far a database is from where this runs. Run it on the API's host (Hetzner)
// against the current and a candidate database before moving (perf/COLOCATION.md):
//   DB_URLS="<current url> <candidate url>" bun apps/client/perf/db-rtt.ts
// Prints per URL: `select 1` round trip (p50/p95 over 15) and a ~100 KB answer after 5 s idle
// (where TCP slow start shows). Nothing is written.
import { neon } from "@neondatabase/serverless";

const urls = (process.env.DB_URLS ?? process.env.DATABASE_URL ?? "").split(/\s+/).filter(Boolean);
if (!urls.length) throw new Error("Set DB_URLS (space-separated) or DATABASE_URL");
const pct = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];

for (const url of urls) {
  const sql = neon(url);
  await sql`select 1`; // connection set-up is not the round trip
  const small: number[] = [];
  for (let i = 0; i < 15; i++) { const t = performance.now(); await sql`select 1`; small.push(performance.now() - t); }
  const large: number[] = [];
  for (let i = 0; i < 3; i++) {
    await Bun.sleep(5000);
    const t = performance.now();
    await sql`select repeat('x', 250) as filler from generate_series(1, 400)`;
    large.push(performance.now() - t);
  }
  console.log(`${new URL(url).hostname}\n  select 1: p50 ${pct(small, 0.5).toFixed(0)} ms, p95 ${pct(small, 0.95).toFixed(0)} ms\n  ~100 KB after 5 s idle: ${large.map(ms => ms.toFixed(0)).join(", ")} ms`);
}
