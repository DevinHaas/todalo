// Connected calendars (ticket 20): the events read for Today/Upcoming, the live
// stream for the signed-in user, and the Calendars section of the Account screen.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { calendar, calendarReads, live, session, syncFor } from "./runtime";
import { calendarMutations, startLiveUpdates, type CalendarEventDto } from "./calendar";
import { CalendarSettings } from "./calendar-views";
import { GoogleButton } from "./google";
import { inlineError } from "./toasts";
import { Button } from "./ui";

const none: CalendarEventDto[] = [];
/** The user's visible provider events; a failed read just shows no events (tasks still render). */
export function useCalendarEvents(userId: string) {
  return useQuery(calendarReads.events(userId)).data ?? none;
}

/** One live stream while signed in; unmounting (sign-out) closes it. Its `sync` changes pull the delta. */
export function LiveUpdates({ userId }: { userId: string }) {
  const cache = useQueryClient();
  useEffect(() => startLiveUpdates({ transport: live, cache, userId, sync: syncFor(userId), onUnauthenticated: () => void session.refresh() }), [cache, userId]);
  return null;
}

/** The toolbar's quiet Synced / Syncing… label; pressing it (or ⌘R / Ctrl+R) refetches everything. */
export function SyncStatus({ userId }: { userId: string }) {
  const sync = syncFor(userId);
  const state = useSyncExternalStore(sync.subscribe, () => sync.state);
  return <Button variant="ghost" size="xs" className="text-muted-foreground" data-sync-now aria-live="polite"
    title="Sync now" onClick={() => void sync.reload().catch(() => {})}>
    {state === "syncing" ? "Syncing…" : "Synced"}
  </Button>;
}

export function CalendarSettingsScreen({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const query = useQuery(calendarReads.accounts(userId));
  const writes = useMemo(() => calendarMutations(calendar, cache, userId), [cache, userId]);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const show = useMutation(writes.showEvents);
  const visible = useMutation(writes.setVisible);
  const resync = useMutation(writes.resync);
  const disconnect = useMutation(writes.disconnect);
  // Legacy disabled the card while a write ran; failures keep the card and say so.
  const begin = (accountId: string) => { setError(null); setPending(current => new Set(current).add(accountId)); };
  const settle = (accountId: string) => ({
    // Toasted failures (toasts.ts) are not repeated on the card.
    onError: (failure: Error) => { const text = inlineError(failure); setError(text && `${text} Your calendars were not changed.`); },
    onSettled: () => setPending(current => { const next = new Set(current); next.delete(accountId); return next; }),
  });

  // A finished Google link (system browser) may have added an account or granted calendar access.
  const linking = useSyncExternalStore(session.subscribe, session.getGooglePending);
  const wasLinking = useRef(linking);
  useEffect(() => {
    if (wasLinking.current && !linking) void cache.invalidateQueries({ queryKey: ["user", userId, "calendar"] });
    wasLinking.current = linking;
  }, [cache, linking, userId]);

  return <CalendarSettings state={query} onRetry={() => void query.refetch()} pending={pending} error={error}
    link={<GoogleButton intent="link" />}
    actions={{
      showEvents: (accountId, showEvents) => { begin(accountId); show.mutate({ accountId, showEvents }, settle(accountId)); },
      setVisible: (accountId, cal) => { begin(accountId); visible.mutate({ accountId, calendar: cal }, settle(accountId)); },
      resync: (accountId) => { begin(accountId); resync.mutate(accountId, settle(accountId)); },
      disconnect: (accountId) => { begin(accountId); disconnect.mutate(accountId, settle(accountId)); },
    }} />;
}
