import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { SessionController } from "./session";
import { accountTransport, googleTransport } from "./transport";
import { AccountTransportError } from "./errors";
import { taskQueries, taskTransport } from "./tasks";
import { projectQueries, projectTransport } from "./projects";
import { attachmentQueries, attachmentTransport } from "./attachments";
import { settingsQueries, settingsTransport } from "./settings";
import { metadataQueries, metadataTransport } from "./metadata";
import { organizationQueries, organizationTransport } from "./organization";
import { searchQueries, searchTransport } from "./search";

// A read or write that finds the session revoked re-checks the account, which
// signs the UI out (and clears every user-scoped query) when the server agrees.
const onError = (error: Error) => { if (error instanceof AccountTransportError && error.code === "UNAUTHENTICATED") void session.refresh(); };
export const queries = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
export const session = new SessionController(accountTransport(), () => queries.clear(), googleTransport());
export const tasks = taskTransport();
export const reads = taskQueries(tasks);
export const projects = projectTransport();
export const projectReads = projectQueries(projects);
export const attachments = attachmentTransport();
export const attachmentReads = attachmentQueries(attachments);
export const settings = settingsTransport();
export const settingsReads = settingsQueries(settings);
export const metadata = metadataTransport();
export const metadataReads = metadataQueries(metadata);
export const organization = organizationTransport();
export const organizationReads = organizationQueries(organization);
export const searchReads = searchQueries(searchTransport());
