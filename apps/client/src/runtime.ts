import { connectionMonitor, userQueryClient } from "./connection";
import { SessionController } from "./session";
import { accountTransport, googleTransport } from "./transport";
import { AccountTransportError } from "./errors";
import { reportWriteError } from "./toasts";
import { taskQueries, taskTransport } from "./tasks";
import { projectQueries, projectTransport } from "./projects";
import { goalQueries, goalTransport } from "./goals";
import { seasonQueries, seasonTransport } from "./seasons";
import { attachmentQueries, attachmentTransport } from "./attachments";
import { settingsQueries, settingsTransport } from "./settings";
import { keyboardQueries, keyboardTransport } from "./keyboard";
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
export const session = new SessionController(accountTransport(), () => queries.clear(), googleTransport());
export const tasks = taskTransport();
export const reads = taskQueries(tasks);
export const projects = projectTransport();
export const projectReads = projectQueries(projects);
export const goals = goalTransport();
export const goalReads = goalQueries(goals);
export const seasons = seasonTransport();
export const seasonReads = seasonQueries(seasons);
export const attachments = attachmentTransport();
export const attachmentReads = attachmentQueries(attachments);
export const settings = settingsTransport();
export const settingsReads = settingsQueries(settings);
export const shortcuts = keyboardTransport();
export const shortcutReads = keyboardQueries(shortcuts);
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
