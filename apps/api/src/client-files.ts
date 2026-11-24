// The browser build of apps/client (app.todalo.app), served next to the API (index.ts).
import { resolve, sep } from "node:path";

const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * A file from the client build, or index.html for an app route; null for a missing hashed asset
 * (a stale tab after a deploy: 404, not HTML posing as JS). Hashed assets come as the build's
 * brotli-11 copy (vite.config.ts) when the client takes br: Cloudflare asks for `gzip, br`, keeps
 * the copy, and converts it for gzip-only browsers (~20% smaller than its own compression).
 */
export async function clientFile(dist: string, path: string, acceptEncoding: string | null): Promise<Response | null> {
  const target = resolve(dist, `.${path}`); // the URL already dropped any ../ segments
  const file = Bun.file(target);
  if (target.startsWith(dist + sep) && await file.exists()) {
    if (!path.startsWith("/assets/")) return new Response(file, { headers: { "cache-control": "no-cache" } });
    const headers = { "cache-control": IMMUTABLE, vary: "accept-encoding", "content-type": file.type };
    const brotli = Bun.file(`${target}.br`);
    if (/\bbr\b/.test(acceptEncoding ?? "") && await brotli.exists()) {
      return new Response(brotli, { headers: { ...headers, "content-encoding": "br" } });
    }
    return new Response(file, { headers });
  }
  const index = Bun.file(`${dist}/index.html`);
  if (path.startsWith("/assets/") || !await index.exists()) return null;
  return new Response(index, { headers: { "cache-control": "no-cache" } });
}
