import { Elysia } from "elysia";
import type { connectSpeech } from "./speech";
import type { commitRambleTodos } from "./commit";
import { RambleConnection } from "./ramble-session";
import { createSocketTickets, type SocketTickets } from "./socket-tickets";
import type { SemanticProcessor, SemanticProject } from "@todalo/ramble/semantic";

export interface ApiDependencies {
  verify(headers: Headers): Promise<string | null>;
  preferences(userId: string): Promise<{ smartRecognition: boolean; projectIds: Set<string>; projects: SemanticProject[] }>;
  speech: typeof connectSpeech;
  semantic: SemanticProcessor;
  commit: typeof commitRambleTodos;
  allowedOrigins: Set<string>;
  tickets?: SocketTickets;
}

export function createApi(dependencies: ApiDependencies) {
  const connections = new Map<string, RambleConnection>();
  const authenticated = new WeakMap<Request, { userId: string; smartRecognition: boolean; projectIds: Set<string>; projects: SemanticProject[] }>();
  const tickets = dependencies.tickets ?? createSocketTickets();
  return new Elysia({ websocket: { maxPayloadLength: 64_000, idleTimeout: 120, backpressureLimit: 512_000, closeOnBackpressureLimit: true } })
    .get("/api/ramble/health", () => ({ ok: true }))
    .get("/api/ramble/session", async ({ request, status }) => {
      const userId = await dependencies.verify(request.headers);
      return userId ? { userId } : status(401, { error: "Not authenticated" });
    })
    // Native clients cannot attach their Keychain bearer to a WebView socket.
    // They mint a one-use ticket here through the Rust transport instead.
    // Only an explicit bearer header is accepted: forwarding cookies would let
    // any page with an ambient browser session mint tickets (CSRF).
    .post("/api/ramble/ticket", async ({ request, status, set }) => {
      set.headers["cache-control"] = "no-store";
      const authorization = request.headers.get("authorization");
      if (!authorization?.startsWith("Bearer ")) return status(401, { error: "Not authenticated" });
      const userId = await dependencies.verify(new Headers({ authorization }));
      return userId ? tickets.issue(userId) : status(401, { error: "Not authenticated" });
    })
    .ws("/api/ramble/ws", {
      async beforeHandle({ request, status }) {
        const ticket = new URL(request.url).searchParams.get("ticket");
        let userId: string | null;
        if (ticket !== null) {
          // A ticket is not ambient authority, so no Origin is required; cookies
          // are ignored so the two authentication paths never mix.
          userId = tickets.consume(ticket);
        } else {
          // Cookies alone aren't sufficient: protect the upgrade against a
          // cross-site page opening a socket with the user's ambient cookie.
          const origin = request.headers.get("origin");
          if (!origin || !dependencies.allowedOrigins.has(origin)) return status(403, "Origin not allowed");
          userId = await dependencies.verify(request.headers);
        }
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
