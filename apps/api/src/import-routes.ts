import { Elysia } from "elysia";
import { z } from "zod";
import { planTodoistImport, type ImportContext, type ImportPlan, type TodoistSnapshot } from "@todalo/server/todoist-import";
import { writeUser } from "./project-routes";
import { completedSince, type TodoistClient } from "./todoist";

// Todoist import (.scratch/todoist-import). The OAuth exchange, the token and
// the import all stay server-side; clients only open the authorize URL.
export interface ImportStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  todoist: TodoistClient;
  context(userId: string, timeZone: string): Promise<ImportContext>;
  apply(userId: string, plan: ImportPlan): Promise<void>;
  promptDue(userId: string): Promise<boolean>;
  promptSeen(userId: string): Promise<void>;
  now?: () => number;
}

export const NATIVE_RETURN = "app.todalo.client://import/todoist";
const CONNECT_TTL = 10 * 60_000;
const CONNECTED_TTL = 30 * 60_000;

type Session = {
  state: string; expiresAt: number; returnTo: string;
  status: "pending" | "connected" | "running" | "done" | "failed";
  token?: string; snapshot?: TodoistSnapshot; error?: string; result?: ImportResult;
};
export interface ImportResult { created: { projects: number; sections: number; tasks: number; labels: number }; skipped: number; warnings: string[] }

const runInput = z.object({
  projectIds: z.array(z.string().min(1)).min(1).max(1000),
  include: z.object({ sections: z.boolean(), subtasks: z.boolean(), labels: z.boolean(), recurring: z.boolean(), comments: z.boolean(), completed: z.boolean(), completedRange: z.enum(["quarter", "year", "all"]).optional() }).strict(),
  timeZone: z.string().refine((zone) => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } }),
}).strict();

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your selection and try again." } as const;
const NOT_CONNECTED = { code: "NOT_CONNECTED", message: "Connect Todoist first." } as const;
const BUSY = { code: "IMPORT_RUNNING", message: "An import is already running." } as const;
const UPSTREAM = { code: "TODOIST_UNAVAILABLE", message: "Todoist could not be reached. Try again." } as const;

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function returnPage(href: string | null, message: string, status = 200) {
  const link = href ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(href)}"><p><a id="return" href="${escapeHtml(href)}">Return to todalo</a></p>` : "";
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Todoist import</title>${link}<p>${escapeHtml(message)}</p>`, {
    status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'" },
  });
}

export function createImportRoutes(store: ImportStore) {
  const now = store.now ?? Date.now;
  // ponytail: in-process sessions (single API instance, like live.ts). A restart
  // only means reconnecting; tokens are never persisted.
  const sessions = new Map<string, Session>();
  const byState = new Map<string, string>();
  const current = (userId: string) => {
    const session = sessions.get(userId);
    if (session && session.status !== "running" && session.expiresAt <= now()) { forget(userId); return undefined; }
    return session;
  };
  const forget = (userId: string) => {
    const session = sessions.get(userId);
    if (!session) return;
    byState.delete(session.state);
    sessions.delete(userId);
    if (session.token) void store.todoist.revoke(session.token);
  };
  const authed = async (request: Request, write: boolean) => {
    if (write) return writeUser(store, request);
    return store.verify(request.headers);
  };

  return new Elysia({ prefix: "/api/v1/imports/todoist" })
    .onBeforeHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .post("/connect", async ({ request, status }) => {
      const userId = await authed(request, true);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      if (current(userId)?.status === "running") return status(409, BUSY);
      forget(userId);
      const state = crypto.randomUUID() + crypto.randomUUID();
      // Bearer = native shell (deep link back); cookie = browser on an allowed origin.
      const native = request.headers.get("authorization")?.startsWith("Bearer ");
      const returnTo = native ? NATIVE_RETURN : `${request.headers.get("origin")}/account#import`;
      sessions.set(userId, { state, expiresAt: now() + CONNECT_TTL, returnTo, status: "pending" });
      byState.set(state, userId);
      return { authorizeUrl: store.todoist.authorizeUrl(state) };
    })
    .get("/callback", async ({ query }) => {
      const state = typeof query.state === "string" ? query.state : "";
      const userId = byState.get(state);
      const session = userId ? current(userId) : undefined;
      // Single use: a replayed or forged state never reaches Todoist.
      byState.delete(state);
      if (!userId || !session || session.state !== state || session.status !== "pending") {
        return returnPage(null, "This Todoist link expired or was already used. Return to todalo and connect again.", 400);
      }
      const code = typeof query.code === "string" ? query.code : "";
      if (!code) {
        Object.assign(session, { status: "failed", error: query.error === "access_denied" ? "denied" : "failed" });
        return returnPage(session.returnTo, "Todoist was not connected.");
      }
      try {
        session.token = await store.todoist.exchange(code);
        Object.assign(session, { status: "connected", expiresAt: now() + CONNECTED_TTL });
        return returnPage(session.returnTo, "Todoist is connected. Return to todalo to choose what to import.");
      } catch {
        Object.assign(session, { status: "failed", error: "failed" });
        return returnPage(session.returnTo, "Todoist could not be connected. Return to todalo and try again.");
      }
    })
    .get("/", async ({ request, status }) => {
      const userId = await authed(request, false);
      if (!userId) return status(401, UNAUTHENTICATED);
      const session = current(userId);
      const prompt = await store.promptDue(userId);
      if (!session) return { status: "idle", prompt };
      if (session.status !== "connected") return { status: session.status, error: session.error, result: session.result, prompt };
      try { session.snapshot ??= await store.todoist.snapshot(session.token!); }
      catch { return status(502, UPSTREAM); }
      const zone = new URL(request.url).searchParams.get("timeZone") ?? "UTC";
      return { status: "connected", prompt, preview: preview(session.snapshot, await store.context(userId, runInput.shape.timeZone.safeParse(zone).success ? zone : "UTC")) };
    })
    .post("/run", async ({ request, body, status }) => {
      const userId = await authed(request, true);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = runInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const session = current(userId);
      if (session?.status === "running") return status(409, BUSY);
      if (session?.status !== "connected" || !session.token) return status(409, NOT_CONNECTED);
      session.status = "running";
      try {
        const snapshot = session.snapshot ?? await store.todoist.snapshot(session.token);
        session.snapshot = snapshot;
        const known = new Set(snapshot.projects.filter((p) => !p.is_deleted).map((p) => p.id));
        if (input.data.projectIds.some((id) => !known.has(id))) { session.status = "connected"; return status(400, INVALID); }
        const { completed, completedRange = "quarter" } = input.data.include;
        const items = completed ? [...snapshot.items, ...await store.todoist.completed(session.token, completedSince(completedRange, snapshot.user?.joined_at))] : snapshot.items;
        const plan = planTodoistImport({ ...snapshot, items }, input.data, await store.context(userId, input.data.timeZone));
        await store.apply(userId, plan);
        const result: ImportResult = {
          created: { projects: plan.projects.length, sections: plan.sections.length, tasks: plan.tasks.length, labels: plan.labels.length },
          skipped: plan.skipped, warnings: plan.warnings,
        };
        void store.todoist.revoke(session.token);
        Object.assign(session, { status: "done", token: undefined, snapshot: undefined, result, expiresAt: now() + CONNECTED_TTL });
        return { status: "done", result };
      } catch (error) {
        // Nothing was written (one batch); the connection stays usable until it expires.
        session.status = "connected";
        console.error("Todoist import failed", error instanceof Error ? error.message : error);
        return status(502, UPSTREAM);
      }
    })
    // Answering the post-sign-up prompt (either way) hides it on every device.
    .post("/prompt", async ({ request, status }) => {
      const userId = await authed(request, true);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      await store.promptSeen(userId);
      return { prompt: false };
    })
    .delete("/", async ({ request, status }) => {
      const userId = await authed(request, true);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      if (current(userId)?.status === "running") return status(409, BUSY);
      forget(userId);
      return { status: "idle" };
    });
}

export interface ImportPreview {
  projects: { id: string; name: string; inbox: boolean; tasks: number; imported: number }[];
  counts: { sections: number; subtasks: number; labels: number; recurring: number; comments: number };
}

function preview(snapshot: TodoistSnapshot, context: ImportContext): ImportPreview {
  const items = snapshot.items.filter((i) => !i.is_deleted && !i.checked);
  const projects = snapshot.projects.filter((p) => !p.is_deleted);
  const names = new Map(projects.map((p) => [p.id, p]));
  const path = (id: string): string => { const p = names.get(id)!; return p.parent_id && names.has(p.parent_id) && !names.get(p.parent_id)!.inbox_project ? `${path(p.parent_id)} / ${p.name}` : p.name; };
  return {
    projects: projects.map((p) => {
      const own = items.filter((i) => i.project_id === p.id);
      return { id: p.id, name: path(p.id), inbox: Boolean(p.inbox_project), tasks: own.length, imported: own.filter((i) => context.mapped.has(`task:${i.id}`)).length };
    }).sort((a, b) => Number(b.inbox) - Number(a.inbox)),
    counts: {
      sections: snapshot.sections.filter((s) => !s.is_deleted).length,
      subtasks: items.filter((i) => i.parent_id).length,
      labels: snapshot.labels.filter((l) => !l.is_deleted).length,
      recurring: items.filter((i) => i.due?.is_recurring).length,
      comments: snapshot.notes.filter((n) => !n.is_deleted).length,
    },
  };
}
