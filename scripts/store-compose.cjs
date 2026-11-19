// Frames the raw captures (scripts/store-capture.cjs) into Mac App Store screenshots:
// 2880×1800 JPEGs (Apple's largest Mac size; it scales down for the others) in docs/app-store/screenshots/.
// Brand: warm paper background, Sanela Black/Thin headline pair as on the landing page, brand red accent.
// Run:  NODE_PATH=/tmp/landing-capture/node_modules node scripts/store-compose.cjs
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "docs/app-store/raw");
const OUT = path.join(ROOT, "docs/app-store/screenshots");
const url = (p) => `file://${path.join(ROOT, p)}`;
const GEIST = fs.readdirSync(path.join(ROOT, "node_modules/.bun")).find(d => d.startsWith("@fontsource-variable+geist@"));

// Order is the App Store order: the first three carry the listing.
const SLIDES = [
  { raw: "coach", bold: "Plan your season.", thin: "Let the rest flow.", sub: "Ask the Coach and it drafts your week around your goals. Keep what fits." },
  { raw: "setup", bold: "Start a season.", thin: "Pick what matters.", sub: "Say what the next weeks are about. The Coach turns it into a few measurable goals." },
  { raw: "ramble", bold: "Say it.", thin: "Todalo files it.", sub: "Talk through everything on your mind. Each thing becomes a task with its date and time." },
  { raw: "calendar", bold: "Every goal", thin: "gets its time.", sub: "Time-block the week in a calendar that syncs with Google Calendar." },
  { raw: "review", bold: "Review,", thin: "then steer.", sub: "Rate every goal each week. Your ratings shape what the Coach suggests next." },
  { raw: "season", bold: "See where", thin: "you're headed.", sub: "One trajectory for the whole season, so you know what is on track and what needs a nudge." },
];

const html = (s) => `<!doctype html><html><head><style>
@font-face { font-family: Sanela; font-weight: 900; src: url(${url("apps/web/app/fonts/sanela/SANELA-Black.woff2")}); }
@font-face { font-family: Sanela; font-weight: 100; src: url(${url("apps/web/app/fonts/sanela/SANELA-Thin.woff2")}); }
@font-face { font-family: Geist; font-weight: 100 900; src: url(${url(`node_modules/.bun/${GEIST}/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2`)}); }
* { margin: 0; box-sizing: border-box; }
body { width: 2880px; height: 1800px; overflow: hidden; background: #f6f5f2; color: #111110; font-family: Geist, sans-serif; position: relative; }
/* A soft brand-red glow behind the window, like the landing CTA. */
body::before { content: ""; position: absolute; left: 50%; top: 900px; width: 2600px; height: 1400px; transform: translateX(-50%);
  background: radial-gradient(closest-side, #dc4c3e22, #dc4c3e00); }
header { position: absolute; top: 92px; left: 0; right: 0; text-align: center; }
h1 { font-family: Sanela; font-size: 120px; line-height: .86; letter-spacing: -.01em; }
h1 b { font-weight: 900; display: block; } h1 i { font-style: normal; font-weight: 100; display: block; }
p { margin: 36px auto 0; max-width: 1700px; font-size: 42px; line-height: 1.35; color: #5d5b56; font-weight: 400; }
.window { position: absolute; left: 50%; top: 500px; width: 1920px; transform: translateX(-50%); border-radius: 22px; overflow: hidden;
  box-shadow: 0 0 0 1.5px #0000001f, 0 40px 120px -20px #2a1a1440, 0 12px 40px #0000001a; background: #fff; }
.window img { display: block; width: 100%; }
.lights { position: absolute; top: 31px; left: 27px; display: flex; gap: 14px; }
.lights span { width: 19px; height: 19px; border-radius: 50%; box-shadow: inset 0 0 0 1px #0000001f; }
</style></head><body>
<header><h1><b>${s.bold}</b><i>${s.thin}</i></h1><p>${s.sub}</p></header>
<div class="window"><img src="${url(`docs/app-store/raw/${s.raw}.png`)}"><div class="lights"><span style="background:#ff5f57"></span><span style="background:#febc2e"></span><span style="background:#28c840"></span></div></div>
</body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2880, height: 1800 }, deviceScaleFactor: 1 });
  for (const [i, s] of SLIDES.entries()) {
    if (!fs.existsSync(path.join(RAW, `${s.raw}.png`))) throw new Error(`Missing raw/${s.raw}.png, run store-capture first`);
    // A file page, so the file:// fonts and images load.
    const tmp = path.join(require("node:os").tmpdir(), "store-slide.html");
    fs.writeFileSync(tmp, html(s));
    await page.goto(`file://${tmp}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(OUT, `${String(i + 1).padStart(2, "0")}-${s.raw}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 92 });
    console.log(path.relative(ROOT, file));
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
