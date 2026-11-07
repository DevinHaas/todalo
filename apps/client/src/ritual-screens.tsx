import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Square } from "lucide-react";
import { ritualReads, rituals, seasonReads } from "./runtime";
import { ritualMutations, type RatingDto, type RitualKind, type RitualRun, type RitualSettingsDto } from "./rituals";
import { CheckInPanel, RitualSettingsForm, RitualsNav } from "./ritual-views";
import { createRambleRecorder, type RambleView } from "./ramble";
import { platform } from "./ramble-screen";
import { LoadFailure, Loading } from "./goal-views";
import { Button, Hint } from "./ui";

// Goals ticket 11: ritual settings, the sidebar entry and the step runner in the right sidebar.

const OPEN = "todalo:ritual";
/** Opens a ritual's panel from anywhere (sidebar, schedule item, keyboard). */
export const openRitual = (kind: RitualKind = "checkIn") => window.dispatchEvent(new CustomEvent(OPEN, { detail: kind }));

function useRitualWrites(userId: string) {
  const cache = useQueryClient();
  const writes = useMemo(() => ritualMutations(rituals, cache, userId), [cache, userId]);
  return {
    save: useMutation({ mutationFn: writes.save, meta: { action: () => "save your ritual settings" } }),
    record: useMutation({ mutationFn: writes.record, meta: { action: (run: RitualRun) => run.status === "skipped" ? "skip the Check-in" : "save the Check-in" } }),
  };
}

/** The Check-in item's task ID: opening that task starts the Check-in instead of the task sheet. */
export function useCheckInTaskId(userId: string) {
  const query = useQuery(ritualReads.state(userId));
  return query.data?.settings.checkIn.enabled ? query.data.checkIn.taskId : null;
}

export function RitualSettingsScreen({ userId }: { userId: string }) {
  const query = useQuery(ritualReads.state(userId));
  const { save } = useRitualWrites(userId);
  if (query.status === "pending") return <div className="ui"><Loading>Loading rituals…</Loading></div>;
  if (!query.data) return <LoadFailure error={query.error} onRetry={() => void query.refetch()} />;
  return <RitualSettingsForm settings={query.data.settings} onChange={(settings: RitualSettingsDto) => save.mutate(settings)} />;
}

export function RitualsSidebar({ userId }: { userId: string }) {
  const query = useQuery(ritualReads.state(userId));
  return query.data ? <RitualsNav rituals={query.data} onStart={() => openRitual("checkIn")} /> : null;
}

/**
 * Spoken context through Ramble's capture: each phrase Ramble segments is
 * appended as text when the user stops. Nothing is saved as a task.
 */
function VoiceContext({ onText }: { onText: (text: string) => void }) {
  const [view, setView] = useState<RambleView | null>(null);
  const recorder = useRef<ReturnType<typeof createRambleRecorder> | null>(null);
  const said = (current: RambleView | null) => (current?.state?.todos ?? []).map(todo => todo.title).join(". ");
  const stop = () => {
    const text = said(recorder.current?.view() ?? null);
    recorder.current?.dispose();
    recorder.current = null;
    setView(null);
    if (text) onText(text);
  };
  useEffect(() => () => recorder.current?.dispose(), []);
  const listening = view !== null && view.status !== "error";
  return <div className="flex flex-wrap items-center gap-2">
    <Button type="button" variant="outline" size="sm" data-ritual-action="voice" aria-pressed={listening}
      onClick={() => {
        if (recorder.current) { stop(); return; }
        recorder.current = createRambleRecorder(platform({ defaultDueDate: null, smartRecognition: false }), setView);
        recorder.current.open();
      }}>
      {recorder.current ? <><Square />Stop</> : <><Mic />Speak</>}
    </Button>
    {view && <Hint aria-live="polite" className="min-w-0 flex-1 truncate">{view.error ?? (said(view) || (view.status === "listening" ? "Listening…" : "Starting microphone…"))}</Hint>}
  </div>;
}

/** The right-sidebar ritual panel, beside every screen; never blocks the rest of the app. */
export function RitualHost({ userId }: { userId: string }) {
  const [open, setOpen] = useState<RitualKind | null>(null);
  const query = useQuery(ritualReads.state(userId));
  const season = useQuery({ ...seasonReads.current(userId), enabled: open !== null });
  const { record } = useRitualWrites(userId);
  useEffect(() => {
    const start = (event: Event) => setOpen((event as CustomEvent<RitualKind>).detail);
    window.addEventListener(OPEN, start);
    return () => window.removeEventListener(OPEN, start);
  }, []);
  // ponytail: only the Check-in has steps so far; Weekly and Season review panels come with tickets 13–14.
  if (open !== "checkIn" || !query.data) return null;
  const { period, status } = query.data.checkIn;
  const done = (run: Omit<RitualRun, "kind" | "period">) => record.mutate({ kind: "checkIn", period, ...run }, { onSuccess: () => setOpen(null) });
  if (season.status === "pending") return null;
  const goals = (season.data?.season?.goals ?? []).filter(goal => !goal.archived).map(({ goalId, title, color }) => ({ goalId, title, color }));
  return <CheckInPanel key={period} goals={goals} period={period} status={status} pending={record.isPending}
    voice={append => <VoiceContext onText={append} />}
    onFinish={(ratings: RatingDto[]) => done({ status: "completed", ratings })} onSkip={() => done({ status: "skipped", ratings: [] })} onClose={() => setOpen(null)} />;
}
