// Prototype lab for the liquid Coach button (liquid.html, dev server only): a mock
// shell — sidebar, calendar column, Plan sidebar — with the blob, the bar and the
// Toolcraft panel. No account or API needed.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUp, Check, ChevronDown, Paperclip, Sparkles, X } from "lucide-react";
import "@fontsource-variable/geist";
import "./ui/styles.css";
import { LiquidCoach, useLiquidActive } from "./liquid-coach";
import { LiquidPanel, useLiquidParams } from "./liquid-panel";
import { Button, SegmentedControl, Switch, Textarea, cn } from "./ui";

function MockBar({ reply, draft }: { reply: boolean; draft: boolean }) {
  const liquid = useLiquidActive();
  return <>
    <div className="absolute inset-x-0 bottom-full flex flex-col gap-2 pb-2 empty:hidden">
      {reply && <section aria-label="Coach reply" className="flex items-start gap-2.5 rounded-xl border border-border bg-background p-3 shadow-popover">
        <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
        <p className="flex-1 text-sm">Moved “Write the brief” to 10:00 and added two focus blocks this afternoon.</p>
      </section>}
      {draft && <PendingPill />}
    </div>
    <form data-liquid-target="" aria-label="Talk to the Coach" onSubmit={(event) => event.preventDefault()}
      className={cn("flex flex-col gap-1.5 rounded-xl border p-1.5", liquid ? "border-transparent bg-transparent" : "border-border bg-background shadow-popover")}>
      <div className="flex items-end gap-1">
        <Button type="button" variant="ghost" size="icon" className="size-control!" aria-label="Attach a document"><Paperclip /></Button>
        <Textarea rows={1} aria-label="Message the Coach" placeholder="Ask the Coach or ask for a change…" data-coach-bar-input=""
          className="max-h-40 min-h-control flex-1 resize-none border-0 bg-transparent py-1.5 text-sm leading-5 shadow-none focus-visible:ring-0" />
        <Button type="submit" size="icon" className="size-control!" aria-label="Send"><ArrowUp /></Button>
      </div>
    </form>
  </>;
}

function PendingPill() {
  return <div role="group" aria-label="Coach changes" className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pr-1 pl-3 shadow-popover">
    <span aria-hidden="true" className="flex -space-x-1"><span className="size-2.5 rounded-full border border-background bg-[#4073ff]" /><span className="size-2.5 rounded-full border border-background bg-[#25b84c]" /></span>
    <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm whitespace-nowrap">4 added, 1 moved<ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" /></button>
    <Button type="button" variant="ghost" size="icon" aria-label="Decline all changes"><X /></Button>
    <Button type="button" size="icon" className="rounded-full" aria-label="Accept all changes"><Check /></Button>
  </div>;
}

const hours = Array.from({ length: 11 }, (_, index) => 8 + index);
const events = [{ day: 0, start: 9, length: 1.5, title: "Standup + planning", color: "#4073ff" }, { day: 1, start: 11, length: 2, title: "Write the brief", color: "#25b84c" },
  { day: 2, start: 14, length: 1, title: "Design review", color: "#af38eb" }, { day: 3, start: 10, length: 3, title: "Deep work", color: "#ff9933" }, { day: 4, start: 15.5, length: 1, title: "Gym", color: "#14aaf5" }];

function Lab() {
  const [params, setParams] = useLiquidParams();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("calendar");
  const [draft, setDraft] = useState(false);
  const [reply, setReply] = useState(false);
  const [panel, setPanel] = useState(true);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const focusField = () => requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[data-coach-bar-input]")?.focus({ preventScroll: true }));

  return <div className="flex h-svh overflow-hidden bg-background text-foreground">
    <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border bg-muted/40 p-3 text-sm md:flex">
      {["Inbox", "Today", "Upcoming", "Season", "Projects"].map(item => <div key={item} className={cn("rounded-md px-2 py-1.5", item === "Today" && "bg-brand-tint text-brand-tint-foreground")}>{item}</div>)}
      <div className="mt-auto flex flex-col gap-2 rounded-lg border border-border bg-background p-2 text-xs">
        <span className="font-medium">Lab</span>
        <SegmentedControl name="View" value={view} onValueChange={setView} options={[{ label: "Calendar + Plan", value: "calendar" }, { label: "List", value: "list" }]} />
        <label className="flex items-center gap-2"><Switch checked={draft} onCheckedChange={setDraft} />Draft pending</label>
        <label className="flex items-center gap-2"><Switch checked={reply} onCheckedChange={setReply} />Reply shown</label>
        <label className="flex items-center gap-2"><Switch checked={dark} onCheckedChange={(on) => { document.documentElement.classList.toggle("dark", on); setDark(on); }} />Dark</label>
        <label className="flex items-center gap-2"><Switch checked={panel} onCheckedChange={setPanel} />Panel</label>
      </div>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-6 text-sm font-medium">{view === "calendar" ? "This week" : "Today"}</div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-4">
        {view === "calendar"
          ? <div className="relative grid min-h-[640px] flex-1 grid-cols-5 border-t border-l border-border">
            {Array.from({ length: 5 }, (_, day) => <div key={day} className="relative border-r border-border">{hours.map(hour => <div key={hour} className="h-[calc(100%/11)] border-b border-border-subtle" />)}
              {events.filter(event => event.day === day).map(event => <div key={event.title} className="absolute inset-x-1 rounded-md px-2 py-1 text-xs text-white"
                style={{ top: `${(event.start - 8) / 11 * 100}%`, height: `${event.length / 11 * 100}%`, background: event.color }}>{event.title}</div>)}</div>)}
          </div>
          : <ul className="mx-auto flex w-full max-w-(--spacing-page) flex-col">{Array.from({ length: 24 }, (_, index) =>
            <li key={index} className="flex items-center gap-3 border-b border-border-subtle py-2.5 text-sm"><span className="size-4 rounded-full border border-muted-foreground" />Task number {index + 1}</li>)}</ul>}
        <LiquidCoach open={open} params={params} docked={draft ? <PendingPill /> : undefined}
          onOpenChange={(next) => { setOpen(next); if (next) focusField(); }}>
          <MockBar reply={reply} draft={draft} />
        </LiquidCoach>
      </div>
    </main>
    {view === "calendar" && <aside className="hidden w-80 shrink-0 flex-col gap-2 border-l border-border p-4 text-sm lg:flex">
      <span className="font-medium">Plan</span>
      {["Next", "Inbox", "Later"].map(item => <div key={item} className="rounded-md border border-border px-3 py-2 text-muted-foreground">{item}</div>)}
    </aside>}
    {panel && <LiquidPanel params={params} onChange={setParams} onClose={() => setPanel(false)} />}
  </div>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<Lab />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
