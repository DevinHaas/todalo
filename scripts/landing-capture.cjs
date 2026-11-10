// Screen captures of the real client for the landing page's features section.
// Records the Vite client (apps/client) through a CDP screencast at 2x, then
// crops, encodes H.264 and writes a poster into apps/web/public/landing/features/.
//
// Setup (see docs/landing/landing-page-brief.md §2.3):
//   API on :3002 with AUTH_TRUSTED_ORIGINS/RAMBLE_ALLOWED_ORIGINS=http://localhost:5173,
//   client: CLIENT_API_PROXY_TARGET=http://127.0.0.1:3002 bun run dev (apps/client),
//   playwright installed outside the repo: NODE_PATH=/tmp/landing-capture/node_modules.
// Run:  NODE_PATH=/tmp/landing-capture/node_modules node scripts/landing-capture.cjs <clip|shot:path> [...]
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const BASE = "http://localhost:5173";
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "apps/web/public/landing/features");
const SHOTS = path.join(ROOT, ".playwright-mcp");
const CHROME = process.env.CHROME_PATH ?? `${os.homedir()}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const LOGIN = { email: "demo@todalo.dev", password: "demo-season-2026" };
// The captures' "now": Monday morning of the seeded week.
const NOW = new Date("2026-11-09T08:40:00+01:00");
const VIEWPORT = { width: 1280, height: 800 };
const SCALE = 2;

// A visible macOS-style pointer; headless Chromium draws none.
const CURSOR = `
addEventListener("DOMContentLoaded", () => {
  const c = document.createElement("div");
  c.id = "__cursor";
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M4 2.5v15.2l4.1-3.9 2.6 6 2.6-1.1-2.6-5.9h5.7z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: "fixed", left: "0", top: "0", width: "22px", height: "22px", margin: "-3px 0 0 -4px", zIndex: 2147483647, pointerEvents: "none", transition: "transform 120ms ease", opacity: "0" });
  document.documentElement.appendChild(c);
  addEventListener("mousemove", e => { c.style.opacity = "1"; c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
  addEventListener("mousedown", () => { c.style.transform = "scale(0.86)"; }, true);
  addEventListener("mouseup", () => { c.style.transform = ""; }, true);
});`;

async function open({ viewport = VIEWPORT } = {}) {
  // Fake camera and microphone: the ramble clip listens on a silent device, its speech is mocked.
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const context = await browser.newContext({ viewport, deviceScaleFactor: SCALE, timezoneId: "Europe/Zurich", locale: "en-GB", colorScheme: "light" });
  await context.addInitScript(CURSOR);
  await context.grantPermissions(["microphone"], { origin: BASE });
  const page = await context.newPage();
  await page.clock.setSystemTime(NOW);
  const res = await page.request.post(`${BASE}/api/auth/sign-in/email`, { data: LOGIN, headers: { Origin: BASE } });
  if (!res.ok()) throw new Error(`Sign-in failed: ${res.status()} ${await res.text()}`);
  return { browser, context, page };
}

/** Moves the visible pointer smoothly to an element (or point) and optionally clicks. */
async function glide(page, target, { click = false, steps = 28, offset } = {}) {
  let x, y;
  if (typeof target === "string" || target?.boundingBox) {
    const box = await (typeof target === "string" ? page.locator(target).first() : target).boundingBox();
    if (!box) throw new Error(`No box for ${target}`);
    x = box.x + (offset?.x ?? box.width / 2); y = box.y + (offset?.y ?? box.height / 2);
  } else ({ x, y } = target);
  await page.mouse.move(x, y, { steps });
  if (click) { await page.waitForTimeout(120); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up(); }
  return { x, y };
}
const type = (page, text, delay = 55) => page.keyboard.type(text, { delay });
const wait = (page, ms) => page.waitForTimeout(ms);

/** Records `act` as frames, cropped to `crop` ({x,y,w,h} in CSS px), and encodes `name`.mp4 + .webp. */
// ponytail: a screenshot loop, not Page.startScreencast: headless screencast frames are always 1x.
async function record(page, name, crop, act, { width = 1200 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `clip-${name}-`));
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let recording = true;
  const loop = (async () => {
    while (recording) {
      // Clips are document coordinates: follow the page's scroll so the crop stays on screen.
      const { cssVisualViewport: v } = await cdp.send("Page.getLayoutMetrics");
      const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true, clip: { x: crop.x + v.pageX, y: crop.y + v.pageY, width: crop.w, height: crop.h, scale: 1 } });
      const file = path.join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      frames.push({ file, t: Date.now() / 1000 });
    }
  })();
  await wait(page, 200);
  // cut(fn): time spent in fn (waiting on the remote dev database) is left out of the clip.
  const cuts = [];
  const cut = async (fn) => { const start = Date.now() / 1000; await fn(); cuts.push([start, Date.now() / 1000]); };
  const t0 = Date.now() / 1000;
  try { await act(cut); } finally { recording = false; await loop.catch(() => {}); }
  const t1 = Date.now() / 1000;
  const inCut = (t) => cuts.some(([a, b]) => t > a && t < b);
  const cutBetween = (a, b) => cuts.reduce((sum, [x, y]) => sum + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
  // Each frame lasts until the next, minus any cut between them; drop the warm-up.
  const kept = frames.filter((f, i) => f.t >= t0 || frames[i + 1]?.t > t0).filter(f => f.t <= t1 + 0.05 && !inCut(f.t));
  const span = (a, b) => b - a - cutBetween(a, b);
  const list = kept.map((f, i) => `file '${f.file}'\nduration ${Math.max(span(Math.max(f.t, t0), kept[i + 1]?.t ?? t1), 0.001).toFixed(4)}`).join("\n") + `\nfile '${kept.at(-1).file}'\n`;
  fs.writeFileSync(path.join(dir, "list.txt"), list);
  const length = span(t0, t1);
  const c = `scale=${width}:-2:flags=lanczos,fps=30,format=yuv420p,settb=AVTB`;
  fs.mkdirSync(OUT, { recursive: true });
  const mp4 = path.join(OUT, `${name}.mp4`), poster = path.join(OUT, `${name}.webp`);
  // The end crossfades back into the first frame, so the loop has no jump.
  execFileSync("ffmpeg", ["-y", "-v", "error",
    "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
    "-loop", "1", "-t", "1", "-i", kept[0].file,
    "-filter_complex", `[0:v]${c}[m];[1:v]${c}[f];[m][f]xfade=transition=fade:duration=0.6:offset=${(length - 0.6).toFixed(2)},format=yuv420p[v]`,
    "-map", "[v]", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "26", "-movflags", "+faststart", "-an", mp4]);
  const png = path.join(dir, "poster.png");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", kept[0].file, "-vf", `scale=${width}:-2:flags=lanczos`, "-frames:v", "1", png]);
  execFileSync("cwebp", ["-quiet", "-q", "82", png, "-o", poster]);
  fs.rmSync(dir, { recursive: true, force: true });
  const kb = (file) => Math.round(fs.statSync(file).size / 1024);
  console.log(`${name}: ${length.toFixed(1)}s, ${kept.length} frames (${(kept.length / length).toFixed(0)} fps), ${kb(mp4)} KB mp4, ${kb(poster)} KB poster`);
}

/** Seeds one demo state (scripts/seed-landing-demo.ts). */
function seed(state) {
  execFileSync("bun", ["--env-file=.env", "scripts/seed-landing-demo.ts", state], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
}

async function goto(page, url) {
  await page.goto(`${BASE}${url}`);
  await page.waitForLoadState("networkidle");
  await wait(page, 600);
}

const clips = {};

async function main() {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("shot:")) {
      // shot:<state>:<url>[:name] — a screenshot for planning crops.
      const [, state, url, name = "shot"] = arg.split(":");
      if (state) seed(state);
      const { browser, page } = await open();
      await goto(page, url);
      await page.screenshot({ path: path.join(SHOTS, `landing-${name}.png`) });
      console.log(`shot ${name}`);
      await browser.close();
      continue;
    }
    const clip = clips[arg];
    if (!clip) throw new Error(`Unknown clip ${arg}`);
    seed(clip.state);
    const { browser, page } = await open({ viewport: clip.viewport });
    try { await clip.run(page); }
    catch (error) { await page.screenshot({ path: path.join(SHOTS, `landing-fail-${arg}.png`) }).catch(() => {}); throw error; }
    finally { await browser.close(); }
  }
}

module.exports = { clips, glide, type, wait, record, goto, open, seed, SHOTS };
if (require.main === module) {
  try { Object.assign(clips, require("./landing-clips.cjs")); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }
  main().catch(e => { console.error(e); process.exit(1); });
}
