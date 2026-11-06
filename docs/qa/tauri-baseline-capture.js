// Load this file with Playwright's browser_run_code_unsafe filename parameter.
// Run tauri-baseline-serve.sh first. Output is intentionally outside the repo;
// review captures before copying them over the committed baseline.
async (page) => {
  const output = "/tmp/todalo-tauri-baseline";
  const context = await page.context().browser().newContext({
    viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1,
    timezoneId: "Europe/Zurich", locale: "en-GB", colorScheme: "light", reducedMotion: "reduce",
  });
  const capture = await context.newPage();
  const errors = [];
  capture.on("pageerror", error => errors.push(error.message));
  await capture.clock.install({ time: new Date("2026-10-04T10:00:00.000Z") });
  await capture.goto("http://127.0.0.1:3101/tauri-baseline");
  await capture.getByRole("heading", { name: "Today", exact: true }).waitFor();
  await capture.getByRole("heading", { name: "4 Oct · Today · Sunday", exact: true }).waitFor();
  await capture.evaluate(() => document.fonts.ready);
  await capture.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const evidence = { browser: await context.browser().version(), errors, captures: [] };
  for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    await capture.setViewportSize({ width, height });
    await capture.mouse.move(width - 1, height - 1);
    await capture.screenshot({ path: `${output}/today-${name}.png`, animations: "disabled" });
    evidence.captures.push({ name, width, height,
      tasks: await capture.locator("[data-task-id]").count(),
      horizontalOverflow: await capture.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    });
  }
  await context.close();
  return evidence;
}
