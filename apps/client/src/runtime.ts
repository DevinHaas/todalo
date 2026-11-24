import { connectionMonitor, userQueryClient } from "./connection";
import { rememberedAccount, SessionController } from "./session";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { appVersion } from "./releases";
import { accountTransport, googleTransport } from "./transport";
import { AccountTransportError } from "./errors";
import { reportWriteError } from "./toasts";
import { taskKeys, taskQueries, taskTransport, type TodayDto } from "./tasks";
import { projectQueries, projectTransport } from "./projects";
import { goalQueries, goalTransport } from "./goals";
import { seasonQueries, seasonTransport } from "./seasons";
import { ritualQueries, ritualTransport } from "./rituals";
import { coachQueries, coachTransport } from "./coach";
import { attachmentQueries, attachmentTransport } from "./attachments";
import { settingsQueries, settingsTransport } from "./settings";
import { keyboardQueries, keyboardTransport } from "./keyboard";
import { personalizationQueries, personalizationTransport } from "./personalization";
import { metadataQueries, metadataTransport } from "./metadata";
import { organizationQueries, organizationTransport } from "./organization";
import { bulkTransport } from "./bulk";
import { calendarQueries, calendarTransport, liveTransport } from "./calendar";
import { createSync, syncTransport, type Sync } from "./sync";
import { searchQueries, searchTransport } from "./search";
import { importTransport } from "./imports";
import { commentQueries, commentTransport } from "./comments";

// A read or write that finds the session revoked re-checks the account, which
// signs the UI out (and clears every user-scoped query) when the server agrees.
const onError = (error: Error) => { if (error instanceof AccountTransportError && error.code === "UNAUTHENTICATED") void session.refresh(); };
export const connection = connectionMonitor();
export const queries = userQueryClient(connection, onError, (error, input, mutation) => reportWriteError(queries, error, input, mutation));
// Launches open on the last session's reads (stale-while-revalidate): the user's queries are kept
// in localStorage, restored before the first render (main.tsx `restored`) and refetched as stale.
// Signing out, switching accounts or a rejected session clears them there too.
const unpersisted = new Set(["search", "personalization"]);
const persister = createSyncStoragePersister({ storage: typeof localStorage === "undefined" ? undefined : localStorage, key: "todalo.queries", throttleTime: 1000 });
const [, restoring] = persistQueryClient({
  queryClient: queries, persister, buster: appVersion, maxAge: 7 * 24 * 60 * 60 * 1000,
  // Only settled user reads. Not search (per-query, short-lived) nor personalization: its wallpaper
  // (up to ~1 MB) and design already restore from their own keys before the first paint.
  dehydrateOptions: { shouldDehydrateQuery: query => query.state.status === "success" && query.queryKey[0] === "user" && !unpersisted.has(String(query.queryKey[2])) },
});
export const restored = restoring.catch(() => undefined);
const clearUserCache = () => { queries.clear(); void persister.removeClient(); };
export const session = new SessionController(accountTransport(), clearUserCache, googleTransport(), rememberedAccount());
export const tasks = taskTransport();
export const reads = taskQueries(tasks);
// First launch on this device (no remembered account): Today's read starts alongside the account
// check instead of after it, and lands in the cache when the session resolves to its user.
// ponytail: a signed-out visitor spends one 401.
if (!session.getSnapshot().account && typeof window !== "undefined") {
  // public/early.js may have started it before this bundle loaded (browsers only).
  const early: Promise<TodayDto | null> = (window as { __todaloEarlyToday?: Promise<TodayDto | null> }).__todaloEarlyToday ?? tasks.today().catch(() => null);
  const stop = session.subscribe(() => {
    const { status, account } = session.getSnapshot();
    if (status === "loading") return;
    stop();
    if (status !== "signed-in" || !account) return;
    const key = taskKeys.today(account.user.id);
    void early.then(today => { if (today && queries.getQueryData(key) === undefined) queries.setQueryData(key, today); });
  });
}
export const projects = projectTransport();
export const projectReads = projectQueries(projects);
export const goals = goalTransport();
export const goalReads = goalQueries(goals);
export const seasons = seasonTransport();
export const seasonReads = seasonQueries(seasons);
export const rituals = ritualTransport();
export const ritualReads = ritualQueries(rituals);
export const coach = coachTransport();
export const coachReads = coachQueries(coach);
export const attachments = attachmentTransport();
export const attachmentReads = attachmentQueries(attachments);
export const settings = settingsTransport();
export const settingsReads = settingsQueries(settings);
export const shortcuts = keyboardTransport();
export const shortcutReads = keyboardQueries(shortcuts);
export const personalization = personalizationTransport();
export const personalizationReads = personalizationQueries(personalization);
export const metadata = metadataTransport();
export const metadataReads = metadataQueries(metadata);
export const organization = organizationTransport();
export const organizationReads = organizationQueries(organization);
export const bulk = bulkTransport();
export const searchReads = searchQueries(searchTransport());
export const calendar = calendarTransport();
export const calendarReads = calendarQueries(calendar);
export const live = liveTransport();
const changes = syncTransport();
const syncs = new Map<string, Sync>();
/** The signed-in user's live sync (sync.ts): one cursor per user for the app's lifetime. */
export function syncFor(userId: string) {
  let sync = syncs.get(userId);
  if (!sync) syncs.set(userId, sync = createSync({ transport: changes, cache: queries, userId }));
  return sync;
}
export const imports = importTransport();
export const comments = commentTransport();
export const commentReads = commentQueries(comments);
