// Todoist API v1 calls used by the import. The access token stays in this process.
import type { TodoistItem, TodoistSnapshot } from "@todalo/server/todoist-import";

export interface TodoistClient {
  authorizeUrl(state: string): string;
  exchange(code: string): Promise<string>;
  snapshot(token: string): Promise<TodoistSnapshot>;
  /** Tasks completed since `since`, fetched in windows of Todoist's maximum range per request (3 months). */
  completed(token: string, since: Date): Promise<TodoistItem[]>;
  revoke(token: string): Promise<void>;
}

export class TodoistError extends Error {}

const DAY = 86_400_000;
const COMPLETED_WINDOW = 89 * DAY;
/** How far back "Completed tasks" reaches: 3 months, a year, or the Todoist account's whole history. */
export type CompletedRange = "quarter" | "year" | "all";
export function completedSince(range: CompletedRange, joinedAt: string | null | undefined, now = new Date()) {
  if (range === "quarter") return new Date(now.getTime() - COMPLETED_WINDOW);
  if (range === "year") return new Date(now.getTime() - 365 * DAY);
  const joined = joinedAt ? new Date(joinedAt) : null;
  // Todoist launched in 2007; without a join date that bounds "everything".
  return joined && !Number.isNaN(joined.getTime()) ? joined : new Date("2007-01-01T00:00:00Z");
}

export function todoistClient(config: { clientId: string; clientSecret: string; redirectUri: string; fetch?: typeof fetch }): TodoistClient {
  const http = config.fetch ?? fetch;
  const call = async <T>(url: string, init: RequestInit) => {
    const response = await http(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new TodoistError(`Todoist answered ${response.status}`);
    return response.json() as Promise<T>;
  };
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  return {
    authorizeUrl: (state) => `https://app.todoist.com/oauth/authorize?${new URLSearchParams({ client_id: config.clientId, scope: "data:read", state, redirect_uri: config.redirectUri, response_type: "code" })}`,
    async exchange(code) {
      const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.redirectUri });
      const { access_token } = await call<{ access_token?: string }>("https://api.todoist.com/oauth/access_token", { method: "POST", body });
      if (!access_token) throw new TodoistError("Todoist returned no access token");
      return access_token;
    },
    async snapshot(token) {
      const body = new URLSearchParams({ sync_token: "*", resource_types: JSON.stringify(["projects", "sections", "items", "labels", "notes", "user"]) });
      const data = await call<Partial<TodoistSnapshot>>("https://api.todoist.com/api/v1/sync", { method: "POST", headers: bearer(token), body });
      return { projects: data.projects ?? [], sections: data.sections ?? [], items: data.items ?? [], labels: data.labels ?? [], notes: data.notes ?? [], user: data.user };
    },
    async completed(token, since) {
      // Newest window first, back to `since`; each request may span at most ~3 months.
      // ponytail: sequential windows (~4 a year of history); parallelize if "Everything" gets slow.
      const items: TodoistItem[] = [];
      for (let until = new Date(); until > since; until = new Date(until.getTime() - COMPLETED_WINDOW)) {
        const start = new Date(Math.max(since.getTime(), until.getTime() - COMPLETED_WINDOW));
        let cursor: string | null = null;
        do {
          const query = new URLSearchParams({ since: start.toISOString(), until: until.toISOString(), limit: "200", ...(cursor ? { cursor } : {}) });
          const page: { items?: TodoistItem[]; next_cursor?: string | null } = await call(`https://api.todoist.com/api/v1/tasks/completed/by_completion_date?${query}`, { headers: bearer(token) });
          items.push(...(page.items ?? []).map((item) => ({ ...item, checked: true })));
          cursor = page.next_cursor ?? null;
        } while (cursor);
      }
      return items;
    },
    async revoke(token) {
      const query = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, access_token: token });
      await http(`https://api.todoist.com/api/v1/access_tokens?${query}`, { method: "DELETE", redirect: "error" }).catch(() => {});
    },
  };
}
