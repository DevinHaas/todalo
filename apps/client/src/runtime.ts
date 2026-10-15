import { QueryCache, QueryClient } from "@tanstack/react-query";
import { SessionController } from "./session";
import { accountTransport } from "./transport";
import { AccountTransportError } from "./errors";
import { taskQueries, taskTransport } from "./tasks";

export const queries = new QueryClient({
  // A read that finds the session revoked re-checks the account, which signs
  // the UI out (and clears every user-scoped query) when the server agrees.
  queryCache: new QueryCache({ onError: (error) => { if (error instanceof AccountTransportError && error.code === "UNAUTHENTICATED") void session.refresh(); } }),
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
export const session = new SessionController(accountTransport(), () => queries.clear());
export const reads = taskQueries(taskTransport());
