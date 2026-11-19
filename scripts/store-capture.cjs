// Full-window captures of the real client for the Mac App Store screenshots (docs/app-store).
// Same setup as scripts/landing-capture.cjs (API on :3002, client on :5173, playwright via NODE_PATH),
// ideally against a Neon branch: DEMO_ENV_FILE=<env with the branch DATABASE_URL>.
// Run:  NODE_PATH=/tmp/landing-capture/node_modules node scripts/store-capture.cjs [shot ...]
// Writes 2560×1600 PNGs (1280×800 @2x) to docs/app-store/raw/; scripts/store-compose.cjs frames them.
const path = require("node:path");
const fs = require("node:fs");
const { open, goto, seed, wait, type } = require("./landing-capture.cjs");

const OUT = path.resolve(__dirname, "../docs/app-store/raw");
const VIEWPORT = { width: 1280, height: 800 };

/** Native-window look: overlay title bar (room for the traffic lights), no pointer. */
async function native(page) {
  await page.evaluate(() => document.documentElement.setAttribute("data-titlebar", "overlay"));
  await page.addStyleTag({ content: "#__cursor { display: none !important; }" });
  await wait(page, 400);
}
const snap = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => console.log(`shot ${name}`));

async function weekCalendar(page) {
  await goto(page, "/upcoming");
  await page.evaluate(() => localStorage.setItem("todalo.display", JSON.stringify({ "/upcoming": { layout: "calendar", calendarRange: "week" } })));
  await goto(page, "/upcoming");
  await native(page);
  const plan = page.locator("[data-schedule-action=plan]");
  if ((await plan.count()) && (await plan.getAttribute("aria-pressed")) === "true") await plan.click();
  await wait(page, 600);
  await page.evaluate(() => {
    const grid = document.querySelector(".schedule");
    const seven = [...document.querySelectorAll(".hour-line span")].find(el => el.textContent === "07:00");
    if (grid && seven) grid.scrollTop += seven.getBoundingClientRect().top - grid.getBoundingClientRect().top - 90;
  });
  await wait(page, 500);
}

const shots = {
  // Coach drafts the week (stubbed reply, seeded draft), then the accepted week.
  async coach(page) {
    const ASK = "Plan my week around my goals. Mornings for deep work.";
    const REPLY = "I gave your sharpest mornings to the essays and the onboarding work, and fit the tempo run in before the hallway on Saturday.";
    let sent = null;
    await page.route(/\/api\/v1\/coach\/drafts\?/, route => !sent && route.request().method() === "GET" ? route.fulfill({ json: { drafts: [] } }) : route.fallback());
    await page.route(/\/api\/v1\/coach\/chat/, async route => {
      const method = route.request().method();
      if (method === "GET") return route.fulfill({ json: { messages: sent ?? [], documents: [] } });
      if (method !== "POST") return route.fallback();
      const { drafts } = await (await page.request.get(route.request().url().replace("/chat", "/drafts"))).json();
      const draft = drafts.find(item => item.kind === "chat") ?? null;
      const at = new Date().toISOString();
      sent = [{ id: "ask", role: "user", content: ASK, draftId: null, createdAt: at }, { id: "reply", role: "assistant", content: REPLY, draftId: draft?.id ?? null, createdAt: at }];
      await route.fulfill({ json: { messages: sent, documents: [], draft } });
    });
    await weekCalendar(page);
    await page.locator("[data-liquid-blob]").click();
    await wait(page, 600);
    await type(page, ASK, 5);
    await page.keyboard.press("Enter");
    await page.locator("[data-coach-draft] [data-draft-counts]").first().waitFor();
    await wait(page, 1500);
    await snap(page, "coach");
    await page.locator("[data-coach-bar-action=review]").click();
    await page.getByRole("button", { name: "Accept all changes" }).click();
    await page.locator("[data-draft-block]").first().waitFor({ state: "detached" });
    await page.locator("[data-liquid-blob]").click();
    // ponytail: headless sync can sit on "Syncing…" after the accept; the still shows the settled label.
    await wait(page, 2000);
    await page.evaluate(() => document.querySelectorAll("[data-sync-now]").forEach(el => { el.textContent = "Synced"; }));
    await wait(page, 1200);
    await snap(page, "calendar");
  },
  async season(page) {
    await goto(page, "/season");
    await native(page);
    // The capacity estimate needs a live model; leave it out of the still.
    await page.evaluate(() => {
      const h = [...document.querySelectorAll("h2, h3")].find(el => el.textContent.trim() === "Capacity");
      h?.closest("section")?.remove();
    });
    await wait(page, 400);
    await snap(page, "season");
  },
  async review(page) {
    await goto(page, "/season");
    await native(page);
    await page.getByText("Weekly review", { exact: true }).first().click();
    await page.getByText("How much did the week").first().waitFor();
    await page.getByText("Solid", { exact: true }).click();
    await page.getByRole("textbox").last().click();
    await type(page, "Long run felt easy. Keep the Tuesday intervals.", 5);
    await page.mouse.click(5, 790);
    await wait(page, 600);
    await snap(page, "review");
  },
  async ramble(page) {
    const todo = (id, title, dueDate, startTime, endTime, priority = 4) => ({ id, title, parentId: null, dueDate, startTime, endTime, recurrence: null, projectId: null, description: null, priority, deadline: null, labelIds: [] });
    const todos = [
      todo("t1", "Outline the essay", "2026-11-12", "10:30", "12:00", 2),
      todo("t2", "Prototype the onboarding", "2026-11-13", "09:00", "11:00"),
      todo("t3", "Tempo run", "2026-11-14", "08:00", "08:50"),
      todo("t4", "Book the physio", "2026-11-16", null, null),
    ];
    const state = { type: "state", provisionalIds: [], state: { mode: "top-level", parentId: null, todos, undoStack: [], readyToCommit: false, nextId: 5, referenceDate: "2026-11-09T08:40:00", projectId: null, defaultDueDate: null, smartRecognition: true } };
    await page.routeWebSocket(/\/api\/ramble\/ws/, ws => {
      ws.onMessage(() => {});
      setTimeout(() => ws.send(JSON.stringify({ type: "ready" })), 200);
      setTimeout(() => ws.send(JSON.stringify(state)), 600);
    });
    await goto(page, "/ramble");
    await page.getByText("Listening", { exact: true }).first().waitFor();
    await native(page);
    await page.addStyleTag({ content: "select[aria-label=\"Choose microphone\"] { visibility: hidden; }" });
    await wait(page, 1500);
    await snap(page, "ramble");
  },
  async setup(page) {
    const suggested = { goals: [
      { title: "Run a half marathon", tier: "primary", target: "21 km under 2 hours in March", color: "green", icon: "footprints", question: "How much are you running at the moment?" },
      { title: "Finish the essay collection", tier: "primary", target: "First draft of all ten essays", color: "violet", icon: "pen-tool", question: "Where are the essays today?" },
      { title: "Read 6 books", tier: "primary", target: "Six books, one every two weeks", color: "orange", icon: "book-open", question: "How much do you read now?" },
      { title: "Learn Spanish basics", tier: "secondary", target: "Hold a five-minute conversation", color: "teal", icon: "brain", question: "How much Spanish do you know?" },
    ] };
    await page.route(/\/api\/v1\/coach\/season-setup/, route => route.fulfill({ json: suggested }));
    await goto(page, "/season");
    await native(page);
    const next = () => page.locator("[data-season-action=setup-next]").click();
    await page.getByLabel("What this season is about").click();
    await type(page, "Get fit for a half marathon in March, and finish my essay collection.", 5);
    await next(); await wait(page, 500);
    await page.getByRole("button", { name: "Next Monday" }).click();
    await next();
    await page.locator("[data-setup-goal]").first().waitFor();
    await page.getByRole("switch", { name: /Learn Spanish/ }).click();
    await page.getByRole("group", { name: "Tier of Read 6 books" }).getByText("Secondary").click();
    await wait(page, 800);
    await snap(page, "setup");
  },
};
const STATE = { coach: "coach", season: "midseason", review: "midseason", ramble: "day1", setup: "setup" };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(shots)) {
    seed(STATE[name]);
    const { browser, page } = await open({ viewport: VIEWPORT });
    try { await shots[name](page); }
    catch (error) { await page.screenshot({ path: path.join(OUT, `fail-${name}.png`) }).catch(() => {}); throw error; }
    finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exit(1); });
