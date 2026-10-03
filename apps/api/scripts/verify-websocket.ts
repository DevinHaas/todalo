import assert from "node:assert/strict";
import type { RambleSessionState, RambleTodo } from "@todalo/ramble";
import type { SpeechCallbacks, SpeechConnection } from "../src/elevenlabs";
import { fixtureSemanticProcessor } from "../test-fixtures/semantic";

// Only permit imports; external production dependencies below are replaced.
process.env.DATABASE_URL ??= "postgresql://ramble-test:ramble-test@localhost:5432/ramble-test";
process.env.BETTER_AUTH_SECRET ??= "ramble-integration-secret-used-only-by-this-process";
process.env.BETTER_AUTH_URL ??= "http://ramble.integration.test";
process.env.GOOGLE_CLIENT_ID ??= "integration-only";
process.env.GOOGLE_CLIENT_SECRET ??= "integration-only";
const { createApi } = await import("../src/app");
interface Message { type: string; state?: RambleSessionState; text?: string; final?: boolean; count?: number; code?: string }
const origin = "http://ramble.integration.test";
const cookie = "test-session=authenticated";
const saved: { userId: string; todos: RambleTodo[]; timeZone: string }[] = [];
let closes = 0;
let finishes = 0;
function speech(callbacks: SpeechCallbacks): SpeechConnection {
  let closed = false;
  queueMicrotask(() => { if (!closed) callbacks.ready(); });
  return {
    audio(bytes) {
      if (closed) return;
      // Fixtures are text encoded as binary frames, decoded only by this fake
      // provider. The production protocol has no browser transcript endpoint.
      const text = new TextDecoder().decode(bytes).replace(/\0$/, "");
      callbacks.transcript(text.slice(0, Math.max(1, text.length - 2)), false);
      callbacks.transcript(text, true);
    },
    async finish() { finishes += 1; },
    close() { if (!closed) closes += 1; closed = true; },
  };
}
const app = createApi({
  allowedOrigins: new Set([origin]),
  verify: async (headers) => headers.get("cookie") === cookie ? "test-user" : null,
  preferences: async () => ({ smartRecognition: true, projectIds: new Set(["project-trip"]), projects: [{ id: "project-trip", name: "Trip" }] }),
  speech,
  semantic: fixtureSemanticProcessor,
  commit: async (userId, todos, timeZone) => {
    saved.push({ userId, todos: structuredClone(todos), timeZone });
    return todos.length;
  },
}).listen({ hostname: "127.0.0.1", port: 0 });
assert.ok(app.server);
const http = `http://127.0.0.1:${app.server.port}`;
const ws = `ws://127.0.0.1:${app.server.port}/api/ramble/ws`;
const sockets: WebSocket[] = [];
function deadline<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 3000);
  })]).finally(() => clearTimeout(timer));
}
async function rejected(headers: Record<string, string>) {
  const socket = new WebSocket(ws, { headers });
  sockets.push(socket);
  let opened = false;
  socket.addEventListener("open", () => { opened = true; socket.close(); });
  await deadline(new Promise<void>((resolve) => {
    socket.addEventListener("error", () => resolve(), { once: true });
    socket.addEventListener("close", () => resolve(), { once: true });
  }), "rejected upgrade");
  assert.equal(opened, false, "unauthorized websocket must not open");
  socket.close();
}
async function connected() {
  const socket = new WebSocket(ws, { headers: { origin, cookie } });
  sockets.push(socket);
  const messages: Message[] = [];
  const listeners = new Set<() => void>();
  socket.addEventListener("message", (event) => {
    messages.push(JSON.parse(String(event.data)) as Message);
    listeners.forEach((listener) => listener());
  });
  await deadline(new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Authenticated websocket failed")), { once: true });
  }), "authenticated upgrade");
  const wait = (predicate: (message: Message) => boolean, after = 0) =>
    deadline(new Promise<Message>((resolve) => {
      const check = () => {
        const found = messages.slice(after).find(predicate);
        if (found) { listeners.delete(check); resolve(found); }
      };
      listeners.add(check); check();
    }), "server message");
  await wait((message) => message.type === "state");
  const send = (message: unknown) => socket.send(JSON.stringify(message));
  const start = async (overrides: Record<string, unknown> = {}) => {
    const after = messages.length;
    send({ type: "start", options: { referenceDate: "2026-10-03T23:45:00", timeZone: "Europe/Zurich", projectId: "project-trip", ...overrides } });
    return wait((message) => message.type === "ready" || message.type === "error", after);
  };
  const segment = async (text: string) => {
    const after = messages.length;
    const bytes = new TextEncoder().encode(text);
    const frame = new Uint8Array(bytes.length + bytes.length % 2);
    frame.set(bytes); socket.send(frame);
    const message = await wait((message) => message.type === "state", after);
    assert.ok(message.state);
    assert.ok(messages.slice(after).some((message) => message.type === "transcript" && message.final === false));
    assert.ok(messages.slice(after).some((message) => message.type === "transcript" && message.final === true && message.text === text));
    return message.state;
  };
  const remove = async (id: string) => {
    const after = messages.length; send({ type: "remove", id });
    const message = await wait((message) => message.type === "state", after);
    assert.ok(message.state); return message.state;
  };
  return { socket, messages, wait, send, start, segment, remove };
}
try {
  const health = await fetch(`${http}/api/ramble/health`);
  assert.equal(health.status, 200); assert.deepEqual(await health.json(), { ok: true });
  assert.equal((await fetch(`${http}/api/ramble/session`)).status, 401);
  const session = await fetch(`${http}/api/ramble/session`, { headers: { cookie } });
  assert.equal(session.status, 200); assert.deepEqual(await session.json(), { userId: "test-user" });
  await rejected({ origin });
  await rejected({ origin: "https://untrusted.example", cookie });
  await rejected({ cookie });
  const client = await connected();
  assert.equal((await client.start()).type, "ready");
  let state = await client.segment("Plan trip");
  assert.deepEqual(state.todos.map((todo) => todo.title), ["Plan trip"]);
  assert.equal(saved.length, 0, "capturing must never persist tasks");
  state = await client.segment("sub-task"); assert.equal(state.mode, "sub-task");
  state = await client.segment("Buy adapter tomorrow at 4pm");
  assert.deepEqual(state.todos[1], { id: "ramble-2", title: "Buy adapter", parentId: "ramble-1", dueDate: "2026-10-04", startTime: "16:00", endTime: null, recurrence: null, projectId: "project-trip" });
  state = await client.segment("undo"); assert.equal(state.todos.length, 1); assert.equal(state.mode, "sub-task");
  state = await client.segment("undo"); assert.equal(state.mode, "top-level");
  await client.segment("sub task"); await client.segment("Renew passport tomorrow");
  state = await client.segment("top level"); assert.equal(state.mode, "top-level");
  state = await client.segment("undo"); assert.equal(state.mode, "sub-task", "undo exit-mode must restore parent");
  await client.segment("back to"); await client.segment("Buy suitcase");
  state = await client.segment("scratch that");
  assert.deepEqual(state.todos.map((todo) => todo.title), ["Plan trip", "Renew passport"]);
  await client.segment("Temporary trip"); await client.segment("sub-task");
  state = await client.segment("Temporary child");
  state = await client.remove(state.todos.find((todo) => todo.title === "Temporary trip")!.id);
  assert.deepEqual(state.todos.map((todo) => todo.title), ["Plan trip", "Renew passport"]);
  assert.equal(state.mode, "top-level"); assert.equal(saved.length, 0);
  await client.segment("that's all");
  assert.equal((await client.wait((message) => message.type === "committed")).count, 2);
  assert.equal(saved.length, 1); assert.equal(saved[0].userId, "test-user"); assert.equal(saved[0].timeZone, "Europe/Zurich");
  assert.equal(saved[0].todos[1].parentId, saved[0].todos[0].id); assert.equal(saved[0].todos[1].dueDate, "2026-10-04");
  client.send({ type: "commit" }); client.send({ type: "commit" });
  await Bun.sleep(30); assert.equal(saved.length, 1, "duplicate commits must not create more tasks"); client.socket.close();
  const manual = await connected(); assert.equal((await manual.start()).type, "ready");
  await manual.segment("Buy milk tomorrow"); manual.send({ type: "commit" });
  assert.equal((await manual.wait((message) => message.type === "committed")).count, 1);
  assert.equal(saved.length, 2); assert.equal(finishes, 1, "Add tasks must flush pending speech"); manual.socket.close();
  const discard = await connected(); assert.equal((await discard.start()).type, "ready");
  await discard.segment("Never save this");
  const closed = deadline(new Promise<void>((resolve) => discard.socket.addEventListener("close", () => resolve(), { once: true })), "discard close");
  discard.send({ type: "discard" }); await closed; assert.equal(saved.length, 2); assert.ok(closes >= 3);
  const invalid = await connected();
  assert.equal((await invalid.start({ projectId: "someone-elses-project" })).code, "invalid_project");
  assert.equal((await invalid.start({ timeZone: "Not/AZone" })).code, "invalid_zone");
  assert.equal((await invalid.start()).type, "ready"); invalid.socket.close();
  console.log("WebSocket integration passed: HTTP/session, authentication, origin checks, binary transcripts, hierarchy, all undo types, removal, commit once, flush, discard, and start validation.");
} finally {
  sockets.forEach((socket) => { if (socket.readyState < WebSocket.CLOSING) socket.close(); });
  void app.server?.stop(true);
}
// Importing the shared production auth module creates maintenance timers.
// The assertions and server teardown have completed; end the CLI cleanly.
process.exit(0);
