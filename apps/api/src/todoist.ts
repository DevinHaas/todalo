// Todoist API v1 calls used by the import. The access token stays in this process.
import type { TodoistItem, TodoistSnapshot } from "@todalo/server/todoist-import";

export interface TodoistClient {
  authorizeUrl(state: string): string;
  exchange(code: string): Promise<string>;
  snapshot(token: string): Promise<TodoistSnapshot>;
  /** Tasks completed in the last 3 months (Todoist's maximum range per request). */
  completed(token: string): Promise<TodoistItem[]>;
  revoke(token: string): Promise<void>;
}

export class TodoistError extends Error {}

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
      const body = new URLSearchParams({ sync_token: "*", resource_types: JSON.stringify(["projects", "sections", "items", "labels", "notes"]) });
      const data = await call<Partial<TodoistSnapshot>>("https://api.todoist.com/api/v1/sync", { method: "POST", headers: bearer(token), body });
      return { projects: data.projects ?? [], sections: data.sections ?? [], items: data.items ?? [], labels: data.labels ?? [], notes: data.notes ?? [] };
    },
    async completed(token) {
      // ponytail: one 3-month window; older history needs more windows if users ask.
      const until = new Date();
      const since = new Date(until.getTime() - 89 * 86_400_000);
      const items: TodoistItem[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ since: since.toISOString(), until: until.toISOString(), limit: "200", ...(cursor ? { cursor } : {}) });
        const page: { items?: TodoistItem[]; next_cursor?: string | null } = await call(`https://api.todoist.com/api/v1/tasks/completed/by_completion_date?${query}`, { headers: bearer(token) });
        items.push(...(page.items ?? []).map((item) => ({ ...item, checked: true })));
        cursor = page.next_cursor ?? null;
      } while (cursor);
      return items;
    },
    async revoke(token) {
      const query = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, access_token: token });
      await http(`https://api.todoist.com/api/v1/access_tokens?${query}`, { method: "DELETE", redirect: "error" }).catch(() => {});
    },
  };
}
