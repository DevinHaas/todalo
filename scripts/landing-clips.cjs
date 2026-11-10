// The feature clips (landing page §2.3), acted out in the real client.
// Crops are CSS px of the viewport, all 6:5 so the cards share one aspect. A
// narrow window (880 px with the sidebar) keeps the page column ~600 px wide,
// so a 600×500 crop records at exactly 2x and text reads near 1:1 on the card.
const { glide, type, wait, record, goto } = require("./landing-capture.cjs");

const NARROW = { width: 880, height: 600 };
const COLUMN = { x: 268, y: 48, w: 600, h: 500 };
const row = (page, title) => page.locator("[data-season-goal]").filter({ hasText: title });
/** Scrolls the page under the pointer like a trackpad would. */
async function scroll(page, dy, steps = 14) {
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await wait(page, 16); }
}

module.exports = {
  "season-setup": {
    state: "setup",
    // The setup's column, sidebar collapsed; the Coach's suggestions are stubbed (fixed, no model).
    viewport: { width: 960, height: 900 },
    async run(page) {
      const suggested = { goals: [
        { title: "Run a half marathon", tier: "primary", target: "21 km under 2 hours in March", color: "green", icon: "footprints", question: "How much are you running at the moment?" },
        { title: "Finish the essay collection", tier: "primary", target: "First draft of all ten essays", color: "violet", icon: "pen-tool", question: "Where are the essays today?" },
        { title: "Read 6 books", tier: "primary", target: "Six books, one every two weeks", color: "orange", icon: "book-open", question: "How much do you read now?" },
        { title: "Learn Spanish basics", tier: "secondary", target: "Hold a five-minute conversation", color: "teal", icon: "brain", question: "How much Spanish do you know?" },
      ] };
      await page.route(/\/api\/v1\/coach\/season-setup/, async route => { await wait(page, 1500); await route.fulfill({ json: suggested }); });
      await goto(page, "/season");
      await page.getByRole("button", { name: "Toggle sidebar" }).first().click();
      await wait(page, 700);
      const box = await page.locator("[data-season-setup]").boundingBox();
      const crop = { x: Math.round(box.x + box.width / 2 - 360), y: Math.round(box.y + 6), w: 720, h: 600 };
      const next = () => glide(page, page.locator("[data-season-action=setup-next]"), { click: true, steps: 22 });
      await page.mouse.move(crop.x + 520, crop.y + 420);
      await record(page, "season-setup", crop, async () => {
        await wait(page, 600);
        await glide(page, page.getByLabel("What this season is about"), { click: true, steps: 20 });
        await type(page, "Get fit for a half marathon in March, and finish my essay collection.", 20);
        await wait(page, 400);
        await next();
        await wait(page, 700);
        await glide(page, page.getByRole("button", { name: "Next Monday" }), { click: true, steps: 22 });
        await wait(page, 600);
        await next();
        await page.locator("[data-setup-goal]").first().waitFor();
        await wait(page, 1400);
        // Pick the focus: Spanish waits for another season, reading gives way when a week runs short.
        await glide(page, page.getByRole("switch", { name: /Learn Spanish/ }), { click: true, steps: 22 });
        await wait(page, 500);
        await glide(page, page.getByRole("group", { name: "Tier of Read 6 books" }).getByText("Secondary"), { click: true, steps: 22 });
        await wait(page, 900);
        await next();
        await wait(page, 600);
        await glide(page, page.locator("[data-setup-start] textarea").first(), { click: true, steps: 20 });
        await type(page, "I run 5 km twice a week, but my long runs stop at 8 km.", 20);
        await wait(page, 500);
        await next();
        await wait(page, 1500);
        // Ends on the review with the pointer on Start season (the Season page is wider than this crop).
        await glide(page, page.locator("[data-season-action=start]"), { steps: 22 });
        await wait(page, 2000);
      });
    },
  },

  "assign-goals": {
    state: "assign",
    viewport: { width: 880, height: 548 },
    async run(page) {
      await goto(page, "/season");
      await page.mouse.move(560, 420);
      await record(page, "assign-goals", COLUMN, async (cut) => {
        await wait(page, 900);
        await scroll(page, 330, 20);
        await wait(page, 300);
        for (const title of ["Read 6 books", "Repaint the hallway"]) {
          const tier = row(page, title).getByRole("radio", { name: "Secondary" }).or(row(page, title).getByRole("button", { name: "Secondary" }));
          await glide(page, tier, { click: true });
          await wait(page, 250);
          // The toggles stay disabled until the write lands.
          await cut(() => page.waitForFunction(() => !document.querySelector("[data-season-goal] [disabled], [data-season-goal] [data-disabled]")));
          await wait(page, 700);
        }
        await page.mouse.move(560, 300, { steps: 25 });
        await wait(page, 2200);
      });
    },
  },

  "coach-plan": {
    state: "coach",
    // The week calendar with the Coach bar (the command bar) under it, sidebar collapsed.
    viewport: { width: 900, height: 820 },
    async run(page) {
      // The draft is seeded (seed-landing-demo.ts "coach"): hidden until the message is sent, then handed back as the
      // Coach's reply, so the clip needs no model and every take is the same.
      const ASK = "Plan my week around my goals. Mornings for deep work.";
      const REPLY = "I gave your sharpest mornings to the essays and the onboarding work, and fit the tempo run in before the hallway on Saturday.";
      let sent = null;
      await page.route(/\/api\/v1\/coach\/drafts\?/, route => !sent && route.request().method() === "GET" ? route.fulfill({ json: { drafts: [] } }) : route.fallback());
      await page.route(/\/api\/v1\/coach\/chat/, async route => {
        const method = route.request().method();
        if (method === "GET") return route.fulfill({ json: { messages: sent ?? [], documents: [] } });
        if (method !== "POST") return route.fallback();
        await wait(page, 1400);
        const { drafts } = await (await page.request.get(route.request().url().replace("/chat", "/drafts"))).json();
        const draft = drafts.find(item => item.kind === "chat") ?? null;
        const at = new Date().toISOString();
        sent = [{ id: "ask", role: "user", content: ASK, draftId: null, createdAt: at }, { id: "reply", role: "assistant", content: REPLY, draftId: draft?.id ?? null, createdAt: at }];
        await route.fulfill({ json: { messages: sent, documents: [], draft } });
      });
      await goto(page, "/upcoming");
      await page.evaluate(() => localStorage.setItem("todalo.display", JSON.stringify({ "/upcoming": { layout: "calendar", calendarRange: "week" } })));
      await goto(page, "/upcoming");
      await page.getByRole("button", { name: "Toggle sidebar" }).first().click();
      // The whole week, so the Plan sidebar closes too.
      const plan = page.locator("[data-schedule-action=plan]");
      if ((await plan.getAttribute("aria-pressed")) === "true") await plan.click();
      await wait(page, 900);
      // Half past six at the top of the grid (the day headers sit inside the scroller).
      const thu = await page.getByText("Thu 12", { exact: true }).boundingBox();
      await page.evaluate((top) => {
        const grid = document.querySelector(".schedule");
        const seven = [...document.querySelectorAll(".hour-line span")].find(el => el.textContent === "07:00");
        grid.scrollTop += seven.getBoundingClientRect().top - top;
      }, thu.y + 76);
      await wait(page, 600);
      await page.mouse.move(520, 520);
      const hour = async (text) => (await page.locator(".hour-line span", { hasText: text }).first().boundingBox()).y;
      await record(page, "coach-plan", { x: 0, y: 56, w: 900, h: 750 }, async () => {
        await wait(page, 700);
        // Open the Coach bar and ask.
        await glide(page, page.locator("[data-liquid-blob]"), { click: true });
        await wait(page, 700);
        await type(page, ASK, 26);
        await wait(page, 300);
        await page.keyboard.press("Enter");
        await page.locator("[data-coach-draft] [data-draft-counts]").first().waitFor();
        await wait(page, 1600);
        // Keep what fits: open the changes, drop the lunch chapter, take the rest.
        await glide(page, page.locator("[data-coach-bar-action=review]"), { click: true, steps: 24 });
        await page.locator("[data-change-group-toggle]").first().waitFor();
        if (!(await page.getByRole("button", { name: /^Decline: .*Piranesi/ }).count())) await page.locator("[data-change-group-toggle]").first().click();
        await wait(page, 600);
        await glide(page, page.getByRole("button", { name: /^Decline: .*Piranesi/ }), { click: true, steps: 24 });
        await page.getByRole("button", { name: /^Decline: .*Piranesi/ }).waitFor({ state: "detached" });
        await wait(page, 700);
        await glide(page, page.getByRole("button", { name: "Accept all changes" }), { click: true, steps: 24 });
        await page.locator("[data-draft-block]").first().waitFor({ state: "detached" });
        await wait(page, 900);
        // Then adjust by hand: the tempo run to Thursday morning...
        const run = page.locator(".timed-block", { hasText: "Tempo run" });
        const from = await glide(page, run, { steps: 26 });
        const up = (await hour("07:00")) - (await hour("08:00"));
        await page.mouse.down();
        await wait(page, 150);
        await page.mouse.move(from.x - 20, from.y + 6, { steps: 8 });
        await page.mouse.move(thu.x + thu.width / 2, from.y + up, { steps: 50 });
        await wait(page, 300);
        await page.mouse.up();
        await wait(page, 800);
        // ...and the essay outline half an hour longer.
        const handle = page.locator(".timed-block", { hasText: "Outline essay five" }).locator("[data-resize]");
        const edge = await glide(page, handle, { steps: 24 });
        await page.mouse.down();
        await page.mouse.move(edge.x, edge.y + Math.abs(up) / 2, { steps: 24 });
        await wait(page, 200);
        await page.mouse.up();
        await wait(page, 600);
        await page.mouse.move(edge.x + 160, edge.y - 120, { steps: 30 });
        await wait(page, 2200);
      });
    },
  },

  review: {
    state: "midseason",
    // 900 px wide with the sidebar collapsed: the whole trajectory graph and the review panel fit side by side.
    viewport: { width: 900, height: 820 },
    async run(page) {
      await goto(page, "/season");
      await page.getByText("Weekly review", { exact: true }).first().click();
      await page.getByText("How much did the week").first().waitFor();
      await page.getByRole("button", { name: "Toggle sidebar" }).first().click();
      await page.mouse.move(330, 515);
      await wait(page, 900);
      await record(page, "review", { x: 0, y: 56, w: 900, h: 750 }, async () => {
        await wait(page, 700);
        await glide(page, page.getByText("Solid", { exact: true }), { click: true });
        await wait(page, 300);
        await glide(page, page.getByRole("textbox").last(), { click: true, steps: 18 });
        await type(page, "Long run felt easy. Keep the Tuesday intervals.", 38);
        await wait(page, 400);
        await glide(page, page.locator("[data-ritual-action=next]"), { click: true, steps: 20 });
        await page.getByText("Finish the essay collection").last().waitFor();
        await wait(page, 700);
        await glide(page, page.getByText("A massive amount", { exact: true }), { click: true });
        await page.mouse.move(330, 515, { steps: 30 });
        await wait(page, 2000);
      });
    },
  },
  ramble: {
    state: "day1",
    // Ramble's voice socket is mocked: each staged task arrives as the speech produces it, and the save is stubbed.
    viewport: { width: 900, height: 820 },
    async run(page) {
      const todo = (id, title, dueDate, startTime, endTime, priority = 4) => ({
        id, title, parentId: null, dueDate, startTime, endTime, recurrence: null, projectId: null,
        description: null, priority, deadline: null, labelIds: [],
      });
      const spoken = [
        todo("t1", "Outline the essay", "2026-11-12", "10:30", "12:00", 2),
        todo("t2", "Prototype the onboarding", "2026-11-13", "09:00", "11:00"),
        todo("t3", "Tempo run", "2026-11-14", "08:00", "08:50"),
        todo("t4", "Book the physio", "2026-11-16", null, null),
      ];
      const session = (todos) => ({
        type: "state",
        provisionalIds: [],
        state: { mode: "top-level", parentId: null, todos, undoStack: [], readyToCommit: false, nextId: todos.length + 1,
          referenceDate: "2026-11-09T08:40:00", projectId: null, defaultDueDate: null, smartRecognition: true },
      });
      await page.routeWebSocket(/\/api\/ramble\/ws/, ws => {
        ws.onMessage(() => {});
        setTimeout(() => ws.send(JSON.stringify({ type: "ready" })), 300);
        spoken.forEach((_, index) => setTimeout(() => ws.send(JSON.stringify(session(spoken.slice(0, index + 1)))), 1500 + index * 1000));
      });
      await page.route(/\/api\/v1\/ramble\/commit/, route => route.fulfill({ json: { count: spoken.length } }));
      await goto(page, "/ramble");
      await page.getByText("Listening", { exact: true }).first().waitFor();
      const sidebar = page.getByRole("button", { name: "Toggle sidebar" }).first();
      if (await sidebar.count()) await sidebar.click();
      // The device picker names the headless fake microphone; hide it, the layout stays.
      await page.addStyleTag({ content: "select[aria-label=\"Choose microphone\"] { visibility: hidden; }" });
      await page.mouse.move(430, 560);
      await wait(page, 900);
      await record(page, "ramble", { x: 0, y: 56, w: 900, h: 750 }, async () => {
        await wait(page, 4800);
        // Ends on the staged cards with the pointer on Add: the save is not shown (the socket mock replays on reconnect).
        await glide(page, page.locator(".ramble-add"), { steps: 22 });
        await wait(page, 1500);
      });
    },
  },
};
