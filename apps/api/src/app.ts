import { Elysia } from "elysia";
import { auth } from "@todalo/auth";
import { db } from "@todalo/db";
import { projects, userSettings } from "@todalo/db/schema";
import { eq } from "drizzle-orm";
import { connectSpeech } from "./speech";
import { commitRambleTodos } from "./commit";
import { RambleConnection } from "./ramble-session";
import { createSemanticProcessor } from "./semantic-llm";
import type { SemanticProcessor, SemanticProject } from "@todalo/ramble/semantic";

export interface ApiDependencies {
  verify(headers: Headers): Promise<string | null>;
  preferences(userId: string): Promise<{ smartRecognition: boolean; projectIds: Set<string>; projects: SemanticProject[] }>;
  speech: typeof connectSpeech;
  semantic: SemanticProcessor;
  commit: typeof commitRambleTodos;
  allowedOrigins: Set<string>;
}

export function createApi(dependencies: ApiDependencies) {
  const connections = new Map<string, RambleConnection>();
  const authenticated = new WeakMap<Request, { userId: string; smartRecognition: boolean; projectIds: Set<string>; projects: SemanticProject[] }>();
  return new Elysia({ websocket: { maxPayloadLength: 64_000, idleTimeout: 120, backpressureLimit: 512_000, closeOnBackpressureLimit: true } })
    .get("/api/ramble/health", () => ({ ok: true }))
    .get("/api/ramble/session", async ({ request, status }) => {
      const userId = await dependencies.verify(request.headers);
      return userId ? { userId } : status(401, { error: "Not authenticated" });
    })
    .ws("/api/ramble/ws", {
      async beforeHandle({ request, status }) {
        // Cookies alone aren't sufficient: protect the upgrade against a
        // cross-site page opening a socket with the user's ambient cookie.
        const origin = request.headers.get("origin");
        if (!origin || !dependencies.allowedOrigins.has(origin)) return status(403, "Origin not allowed");
        const userId = await dependencies.verify(request.headers);
        if (!userId) return status(401, "Not authenticated");
        authenticated.set(request, { userId, ...await dependencies.preferences(userId) });
      },
      open(ws) {
        const context = authenticated.get(ws.data.request);
        if (!context) { ws.close(1008, "Not authenticated"); return; }
        authenticated.delete(ws.data.request);
        connections.set(ws.id, new RambleConnection({
          send: (message) => { ws.send(JSON.stringify(message)); },
          speech: dependencies.speech,
          semantic: dependencies.semantic,
          commit: (todos, zone) => dependencies.commit(context.userId, todos, zone),
          smartRecognition: context.smartRecognition,
          projectIds: context.projectIds,
          projects: context.projects,
        }));
      },
      async message(ws, message) {
        try {
          await connections.get(ws.id)?.message(message);
          if (typeof message === "object" && message !== null && "type" in message && message.type === "discard") ws.close(1000);
        } catch {
          ws.send(JSON.stringify({ type: "error", code: "session_error", message: "The capture could not continue. Try again." }));
        }
      },
      close(ws) {
        connections.get(ws.id)?.close();
        connections.delete(ws.id);
      },
    });
}

export function productionDependencies(): ApiDependencies {
  const authUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const origins = (process.env.RAMBLE_ALLOWED_ORIGINS ?? new URL(authUrl).origin).split(",").map((origin) => origin.trim());
  return {
    allowedOrigins: new Set(origins),
    verify: async (headers) => (await auth.api.getSession({ headers }))?.user.id ?? null,
    preferences: async (userId) => {
      const [settings, owned] = await Promise.all([
        db.select().from(userSettings).where(eq(userSettings.userId, userId)),
        db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId)),
      ]);
      return { smartRecognition: settings[0]?.smartDateRecognitionEnabled ?? true, projectIds: new Set(owned.map((project) => project.id)), projects: owned };
    },
    speech: connectSpeech,
    semantic: createSemanticProcessor(),
    commit: commitRambleTodos,
  };
}
