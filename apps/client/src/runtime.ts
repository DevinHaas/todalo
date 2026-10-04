import { QueryClient } from "@tanstack/react-query";
import { SessionController } from "./session";
import { accountTransport } from "./transport";

export const queries = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
export const session = new SessionController(accountTransport(), () => queries.clear());
