// Dev-only stage for the landing page's Ramble clip (ramble-stage.html, dev server only), recorded by
// scripts/landing-clips.cjs. Ramble acted out with the app's own classes (ramble-screen.tsx, plus the task
// rows' checkbox and pills), seen much closer than a screen capture and with only three tasks. The spoken
// words show in the empty state's quote style, so the clip reads without sound. `?loop` replays it.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUp, CalendarDays, Check, Flag, Hash, Inbox, LoaderCircle, Mic, Repeat2, X } from "lucide-react";
import "@fontsource-variable/geist";
import "./ui/styles.css";

type Task = { said: string; title: string; priority: 1 | 4; meta: ReactNode; project?: string };
const TASKS: Task[] = [
  {
    said: "Outline the essay tomorrow from half ten to twelve, it’s urgent", title: "Outline the essay", priority: 1, project: "Writing",
    meta: <><span className="pill due"><CalendarDays />Tomorrow 10:30-12:00</span><span className="pill priority"><Flag data-priority={1} />P1</span></>,
  },
  { said: "Call the physio today", title: "Call the physio", priority: 4, meta: <span className="pill due today"><CalendarDays />Today</span> },
  {
    said: "And a tempo run every Saturday at eight", title: "Tempo run", priority: 4, project: "Running",
    meta: <><span className="pill due"><CalendarDays />Saturday 08:00</span><span className="pill repeat"><Repeat2 />Every week</span></>,
  },
];

type Scene = {
  hint: boolean; // the empty state's "Try saying"
  line: number | null; // the task being spoken
  words: number; // how much of it is said
  cards: { task: number; ready: boolean }[];
  status: "listening" | "understanding" | "adding" | "added";
  press: boolean;
};
const START: Scene = { hint: true, line: null, words: 0, cards: [], status: "listening", press: false };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One take. Resolves with the poster moment (seconds in): all three tasks staged, just before Add. */
async function play(set: (next: (scene: Scene) => Scene) => void, speaking: { current: boolean }) {
  const start = performance.now();
  set(() => START);
  await sleep(1000);
  set((scene) => ({ ...scene, hint: false }));
  await sleep(300);
  for (const [index, task] of TASKS.entries()) {
    const words = task.said.split(" ");
    set((scene) => ({ ...scene, line: index, words: 0 }));
    speaking.current = true;
    for (let said = 1; said <= words.length; said++) {
      set((scene) => ({ ...scene, words: said }));
      await sleep(100 + words[said - 1].length * 26);
    }
    speaking.current = false;
    await sleep(220);
    // A local guess first (dimmed, as provisional cards are), then the model's task with its details.
    set((scene) => ({ ...scene, line: null, cards: [...scene.cards, { task: index, ready: false }], status: "understanding" }));
    await sleep(650);
    set((scene) => ({ ...scene, cards: scene.cards.map((card) => (card.task === index ? { ...card, ready: true } : card)), status: "listening" }));
    await sleep(380);
  }
  await sleep(700);
  const poster = (performance.now() - start) / 1000;
  await sleep(300);
  set((scene) => ({ ...scene, press: true }));
  await sleep(180);
  set((scene) => ({ ...scene, press: false, status: "adding" }));
  await sleep(600);
  set((scene) => ({ ...scene, status: "added" }));
  await sleep(1100);
  // Clear, so the loop fades from an empty panel back into the first frame.
  set(() => ({ ...START, hint: false }));
  await sleep(500);
  return poster;
}

/** RambleWave's scrolling loudness history, fed by the script instead of a microphone. */
function Wave({ speaking }: { speaking: { current: boolean } }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bars = Array.from(ref.current?.children ?? []) as HTMLElement[];
    const history: number[] = Array(bars.length).fill(0);
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let level = 0;
    let last = 0;
    let frame = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < 50) return;
      last = now;
      level += ((speaking.current ? 0.3 + random() * 0.7 : random() * 0.05) - level) * 0.75;
      history.shift();
      history.push(level);
      bars.forEach((bar, index) => { bar.style.transform = `scaleY(${0.15 + history[index] * 0.85})`; });
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [speaking]);
  return <div ref={ref} className="ramble-wave" data-active="true" aria-hidden="true">
    {Array.from({ length: 24 }, (_, index) => <span key={index} />)}
  </div>;
}

function Stage() {
  const [scene, setScene] = useState(START);
  const speaking = useRef(false);
  useEffect(() => {
    Object.assign(window, { rambleStage: { play: () => play(setScene, speaking) } });
    if (!new URLSearchParams(location.search).has("loop")) return;
    let on = true;
    void (async () => { while (on) await play(setScene, speaking); })();
    return () => { on = false; };
  }, []);

  const count = scene.cards.length;
  const status = { listening: "Listening", understanding: "Understanding tasks…", adding: "Adding tasks…", added: "Tasks added" }[scene.status];
  const said = scene.line === null ? null : TASKS[scene.line].said.split(" ");
  return <div className="stage" data-status={scene.status}>
    <section className="ramble-capture stage-panel" aria-label="Ramble">
      <header>
        <h1>Ramble</h1>
        <div className="ramble-controls">
          <Wave speaking={speaking} />
          <span className="icon-button"><Mic /></span>
        </div>
      </header>
      <div className="ramble-staged">
        <ul>
          {scene.cards.map(({ task: index, ready }, order) => {
            const task = TASKS[index];
            return <li key={index} className={`ramble-card${ready ? "" : " provisional"}`} style={{ "--i": order } as CSSProperties}>
              <div className="ramble-card-title">
                <span className="checkbox" data-priority={task.priority} />
                <div><p>{task.title}</p></div>
                <span className="icon-button"><X /></span>
              </div>
              <div className="task-meta">
                {ready
                  ? <>{task.meta}<span className="pill project">{task.project ? <Hash /> : <Inbox />}{task.project ?? "Inbox"}</span></>
                  : <span className="stage-skeleton" />}
              </div>
            </li>;
          })}
        </ul>
        <div className="ramble-empty stage-said">
          {!count && <p data-shown={scene.hint}>Try saying</p>}
          {said
            ? <p>{said.map((word, index) => <span key={index} data-shown={index < scene.words}>{index === 0 && "“"}{word}{index === said.length - 1 && "”"} </span>)}</p>
            : !count && <p data-shown={scene.hint}>“Buy groceries tomorrow at 17:00”</p>}
        </div>
        <div className="ramble-empty stage-done" data-shown={scene.status === "added"}><Check /><p>{TASKS.length} tasks added</p></div>
      </div>
      <footer className="ramble-footer">
        <p>{status}{count > 0 && ` · ${count} ${count === 1 ? "task" : "tasks"}`}</p>
        <div>
          <span className="icon-button"><X /></span>
          <span className="icon-button ramble-add" data-press={scene.press}>
            {scene.status === "adding" ? <LoaderCircle className="spin" /> : scene.status === "added" ? <Check /> : <ArrowUp />}
          </span>
        </div>
      </footer>
    </section>
  </div>;
}

// Stage-only layout: 600×500 CSS px (the landing card's 6:5) at 1.42× zoom, the panel floating on a warm ground.
const css = `
html, body { margin: 0; background: #f5f1ee; overflow: hidden; }
.stage { position: relative; width: 422.54px; height: 352.11px; zoom: 1.42; overflow: hidden;
  background: radial-gradient(90% 70% at 50% 108%, color-mix(in oklch, var(--brand) 22%, transparent), transparent 70%), linear-gradient(#f7f4f2, #f1ebe7); }
.stage-panel { position: absolute; inset: 12px; max-width: none; margin: 0; display: flex; flex-direction: column; padding: 12px 14px 10px;
  border-radius: 16px; background: var(--background); box-shadow: 0 0 0 1px rgb(0 0 0 / .05), 0 20px 44px -20px rgb(80 30 20 / .35); }
.stage .ramble-staged { flex: 1; display: flex; flex-direction: column; min-height: 0; max-height: none; margin: .625rem 0 .5rem; overflow: visible; }
.stage .ramble-card { padding: .5rem .75rem; animation: stage-in .4s cubic-bezier(.2,.7,.2,1) both; transition: opacity .3s, transform .45s cubic-bezier(.4,0,.2,1); }
.stage .ramble-card-title { align-items: center; } .stage .ramble-card .checkbox { margin-top: 0; }
.stage .ramble-card-title .icon-button { margin: -.25rem -.375rem -.25rem 0; }
.stage .ramble-card .task-meta { margin: .25rem 0 0 1.75rem; gap: .625rem; min-height: 1.25rem; }
.stage .ramble-card .task-meta > * { animation: stage-in .35s ease-out both; }
.stage .ramble-card .task-meta > :nth-child(2) { animation-delay: 60ms; } .stage .ramble-card .task-meta > :nth-child(3) { animation-delay: 120ms; }
.stage .ramble-card .pill svg { width: .875rem; height: .875rem; }
.stage .ramble-card-title .icon-button { color: var(--muted-foreground); }
.stage[data-status="added"] .ramble-card { opacity: 0; transform: translateY(-12px); transition-delay: calc(var(--i) * 70ms); }
.stage-skeleton { display: block; width: 58%; height: .625rem; margin: .3125rem 0; border-radius: 999px;
  background: linear-gradient(90deg, #ececec 30%, #f8f8f8 50%, #ececec 70%) 0 0 / 250% 100%; animation: stage-shimmer 1.1s linear infinite; }
.stage-said { flex: 1; min-height: 0; }
.stage .ramble-staged { position: relative; }
.stage-done { position: absolute; inset: 0; min-height: 0; opacity: 0; transform: translateY(8px); transition: opacity .35s, transform .45s; }
.stage-done[data-shown="true"] { opacity: 1; transform: none; transition-delay: .2s; }
.stage .stage-done svg { width: 2.25rem; height: 2.25rem; padding: .375rem; border-radius: 999px; background: var(--color-brand-tint); }
.stage-done p { font-size: 1.125rem; font-weight: 500; }
.stage-said p { transition: opacity .3s; }
.stage-said p[data-shown="false"], .stage-said span[data-shown="false"] { opacity: 0; }
.stage-said span { transition: opacity .18s; }
.stage .ramble-add { transition: transform .15s, background .15s; }
.stage .ramble-add[data-press="true"] { transform: scale(.88); background: var(--color-brand-hover); }
@keyframes stage-in { from { opacity: 0; transform: translateY(8px); } }
@keyframes stage-shimmer { to { background-position: -250% 0; } }
`;
document.head.append(Object.assign(document.createElement("style"), { textContent: css }));
createRoot(document.getElementById("root")!).render(<Stage />);
