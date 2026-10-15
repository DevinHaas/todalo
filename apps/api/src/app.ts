import { Elysia } from "elysia";
import type { connectSpeech } from "./speech";
import type { commitRambleTodos } from "./commit";
import { RambleConnection } from "./ramble-session";
import { createSocketTickets, type SocketTickets } from "./socket-tickets";
import type { SemanticProcessor, SemanticProject } from "@todalo/ramble/semantic";
import { rambleCommitInput } from "@todalo/ramble/commit";
import { RambleCommitError } from "./commit-rows";
import { writeUser } from "./project-routes";

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This project does not exist or you do not have access to it." } as const;
const SAVE_FAILED = { code: "SAVE_FAILED", message: "Your changes could not be saved. Try again." } as const;

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
    // Ticket 21: saves a staged batch the client still holds after its socket
    // was lost (or a socket save's answer never arrived). The operation ID the
    // client sent with `start` makes this a replay of the same commit, never a
    // second copy. Same rules as the socket save: owned projects, valid parents.
    .post("/api/v1/ramble/commit", async ({ request, body, status, set }) => {
      set.headers["cache-control"] = "no-store";
      const userId = await writeUser(dependencies, request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = rambleCommitInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      try {
        return { count: await dependencies.commit(userId, input.data.todos, input.data.timeZone, input.data.operationId) };
      } catch (error) {
        if (error instanceof RambleCommitError) return error.reason === "missing" ? status(404, NOT_FOUND) : status(400, INVALID);
        return status(500, SAVE_FAILED);
      }
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
          commit: (todos, zone, operationId) => dependencies.commit(context.userId, todos, zone, operationId),
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
