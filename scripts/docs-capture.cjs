const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { ACCOUNT, TASKS, localOrigin, assertAccount, assertFixtures, readSnapshot, seedDemo } = require("./help-center-demo.cjs");

const OUTPUT = path.resolve(__dirname, "../apps/docs/public/screenshots");
const VIEWPORT = { width: 1280, height: 800 };
const NOW = new Date("2026-11-09T08:40:00+01:00");
const SHOTS = [
  {
    name: "inbox-list",
    route: "/inbox",
    steps: async page => {
      for (const task of TASKS.filter(task => !task.project)) {
        await page.getByText(task.title, { exact: true }).waitFor({ state: "visible" });
      }
    },
    crop: page => page.locator("main .collection"),
  },
  {
    name: "quick-add",
    route: "/inbox",
    steps: async page => {
      await page.getByLabel("Sidebar", { exact: true }).getByRole("button", { name: "Add task", exact: true }).click();
      await page.getByRole("dialog", { name: "Add task", exact: true }).getByRole("textbox", { name: "Task name", exact: true }).fill("Pick up seedlings");
    },
    crop: page => page.getByRole("dialog", { name: "Add task", exact: true }),
  },
  {
    // Bring your tasks from Todoist. The chooser needs a live Todoist connection, so the
    // status read is answered with a synthetic preview; nothing is connected or imported.
    name: "import-chooser",
    route: "/inbox",
    steps: async page => {
      await page.route(url => url.pathname === "/api/v1/imports/todoist", route => route.request().method() === "GET"
        ? route.fulfill({ json: { status: "connected", preview: {
          projects: [
            { id: "p-inbox", name: "Inbox", inbox: true, tasks: 12, imported: 0 },
            { id: "p-home", name: "Home", inbox: false, tasks: 18, imported: 0 },
            { id: "p-garden", name: "Garden", inbox: false, tasks: 9, imported: 0 },
          ],
          counts: { sections: 6, subtasks: 14, labels: 5, recurring: 7, comments: 11 },
        } } })
        : route.abort());
      await page.goto(`${page.url().replace(/\/inbox$/, "")}/settings/integrations`, { waitUntil: "domcontentloaded" });
      await page.getByText("Also import", { exact: true }).waitFor({ state: "visible" });
    },
    crop: page => page.locator("form.import-card"),
  },
  {
    // Introduction to filters: the Add filter dialog with a query and its live preview.
    name: "filter-dialog",
    route: "/inbox",
    steps: async page => {
      await page.getByLabel("Sidebar", { exact: true }).getByRole("link", { name: "Filters & Labels", exact: true }).click();
      await page.getByRole("button", { name: "Add filter", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Add filter", exact: true });
      await dialog.getByRole("textbox", { name: "Query", exact: true }).fill("p2 | p3");
      await dialog.getByText(TASKS.find(task => task.priority === 2).title, { exact: true }).waitFor({ state: "visible" });
      await dialog.getByRole("region", { name: "Preview", exact: true }).scrollIntoViewIfNeeded();
    },
    crop: page => page.getByRole("dialog", { name: "Add filter", exact: true }),
  },
];

function options(args) {
  const result = { base: "http://localhost:5173", seed: false, seedOnly: false, names: [] };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--seed") result.seed = true;
    else if (argument === "--seed-only") { result.seed = true; result.seedOnly = true; }
    else if (argument === "--base-url") {
      if (!args[index + 1]) throw new Error("--base-url needs a loopback origin.");
      result.base = args[++index];
    } else if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`);
    else result.names.push(argument);
  }
  result.base = localOrigin(result.base);
  for (const name of result.names) {
    if (!SHOTS.some(shot => shot.name === name)) throw new Error(`Unknown shot: ${name}. Use --list.`);
  }
  return result;
}

function apiClient(request, base) {
  return async (method, route, data, allowFailure = false) => {
    let response;
    try {
      response = await request.fetch(`${base}${route}`, {
        method, data, headers: { Origin: base }, maxRedirects: 0, timeout: 30000,
      });
    } catch {
      throw new Error("Cannot reach the local client API. Start the client proxy and development API first.");
    }
    if (allowFailure) return response;
    if (!response.ok()) throw new Error(`${method} ${route} failed (HTTP ${response.status()}). Check the local API configuration; no captures were published.`);
    return response.json();
  };
}

async function authenticate(api, seed) {
  let response = await api("POST", "/api/auth/sign-in/email", { email: ACCOUNT.email, password: ACCOUNT.password }, true);
  if (!response.ok() && seed && response.status() === 401) {
    await api("POST", "/api/auth/sign-up/email", ACCOUNT);
    response = await api("POST", "/api/auth/sign-in/email", { email: ACCOUNT.email, password: ACCOUNT.password }, true);
  }
  if (!response.ok()) {
    throw new Error(`Demo sign-in failed (HTTP ${response.status()}). Use --seed for a new fixture account; check local auth/database configuration otherwise.`);
  }
  assertAccount(await api("GET", "/api/v1/account"));
}

async function capture(browser, storageState, settings, staging) {
  const dimensions = new Map();
  const shots = SHOTS.filter(shot => !settings.names.length || settings.names.includes(shot.name));
  for (const theme of ["light", "dark"]) {
    for (const shot of shots) {
      const context = await browser.newContext({
        viewport: VIEWPORT, deviceScaleFactor: 2, locale: "en-GB", timezoneId: "Europe/Zurich",
        colorScheme: theme, reducedMotion: "reduce", storageState, serviceWorkers: "block",
      });
      try {
        await context.route("**/*", route => {
          const url = new URL(route.request().url());
          return url.origin === settings.base ? route.continue() : route.abort();
        });
        await context.addInitScript(value => localStorage.setItem("todalo-theme", value), theme);
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        await page.clock.setSystemTime(NOW);
        await page.goto(`${settings.base}${shot.route}`, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: "Inbox", exact: true }).waitFor({ state: "visible" });
        await page.getByText(TASKS[0].title, { exact: true }).waitFor({ state: "visible" });
        await page.waitForFunction(dark => document.documentElement.classList.contains("dark") === dark, theme === "dark");
        await shot.steps(page);
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(0, 0);
        const crop = shot.crop(page);
        await crop.waitFor({ state: "visible" });
        const box = await crop.boundingBox();
        if (!box || box.width >= VIEWPORT.width || box.height >= VIEWPORT.height) {
          throw new Error("The crop must be a visible UI fragment, not a full window.");
        }
        const image = await crop.screenshot({ animations: "disabled", caret: "hide", scale: "device" });
        const size = `${image.readUInt32BE(16)} × ${image.readUInt32BE(20)}`;
        if (dimensions.has(shot.name) && dimensions.get(shot.name) !== size) {
          throw new Error("Light and dark screenshot dimensions differ.");
        }
        dimensions.set(shot.name, size);
        await fs.writeFile(path.join(staging, `${shot.name}.${theme}.png`), image);
        console.log(`Captured ${shot.name}.${theme}.png (${size})`);
      } catch (error) {
        throw new Error(`Capture stopped at ${shot.name}/${theme}; staged images were not published. ${error.message}`);
      } finally {
        await context.close();
      }
    }
  }
  return dimensions;
}

async function main(args) {
  if (args.includes("--help")) {
    console.log("Usage: node scripts/docs-capture.cjs [--base-url http://localhost:5173] [--seed | --seed-only] [shot ...]\n\nDefault: capture all shots in light and dark; no seed writes.\n--seed: create missing synthetic fixtures only, then capture.\n--seed-only: create missing fixtures without launching Chromium.\n--list: list shot names. See docs/help-center-screenshots.md.");
    return;
  }
  if (args.includes("--list")) {
    console.log(SHOTS.map(shot => `${shot.name}\t${shot.route}\tlight + dark`).join("\n"));
    return;
  }
  const settings = options(args);
  let playwright;
  try { playwright = require("playwright"); }
  catch { throw new Error("Playwright is missing. Reuse the landing-capture NODE_PATH; see docs/help-center-screenshots.md."); }
  const request = await playwright.request.newContext();
  let browser;
  let staging;
  const lock = path.join(os.tmpdir(), `todalo-docs-capture-${new URL(settings.base).port || "default"}.lock`);
  let lockHandle;
  try {
    try { lockHandle = await fs.open(lock, "wx"); }
    catch { throw new Error(`Another capture may be running. If not, remove the stale lock: ${lock}`); }
    const api = apiClient(request, settings.base);
    await authenticate(api, settings.seed);
    if (settings.seed) await seedDemo(api);
    assertFixtures(await readSnapshot(api));
    if (settings.seedOnly) { console.log("Synthetic screenshot fixtures verified; no existing data was reset."); return; }
    browser = await playwright.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    staging = await fs.mkdtemp(path.join(os.tmpdir(), "todalo-docs-capture-"));
    const dimensions = await capture(browser, await request.storageState(), settings, staging);
    assertFixtures(await readSnapshot(api));
    await fs.mkdir(OUTPUT, { recursive: true });
    for (const filename of await fs.readdir(staging)) {
      await fs.copyFile(path.join(staging, filename), path.join(OUTPUT, filename));
    }
    for (const [name, size] of dimensions) console.log(`Published /screenshots/${name}.{light,dark}.png (${size})`);
  } finally {
    await browser?.close();
    await request.dispose();
    if (staging) await fs.rm(staging, { recursive: true, force: true });
    if (lockHandle) { await lockHandle.close(); await fs.unlink(lock); }
  }
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { SHOTS, options, apiClient, authenticate };
