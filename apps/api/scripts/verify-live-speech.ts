// Opt-in live QA: uses configured speech/task providers and the database; audio is synthesized,
// never recorded from the microphone. Run with Bun and the root .env loaded.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auth } from "@todalo/auth";
import { db } from "@todalo/db";
import { projects, tasks } from "@todalo/db/schema";
import { and, eq } from "drizzle-orm";
import type { RambleSessionState } from "@todalo/ramble";
import { createApi, productionDependencies } from "../src/app";
import { connectClipSpeech } from "../src/clip-speech";

interface Message { type: string; state?: RambleSessionState; text?: string; final?: boolean; count?: number; code?: string; message?: string }
const email = process.env.TEST_USER_EMAIL ?? "test@todalo.dev";
const password = process.env.TEST_USER_PASSWORD ?? "password123";
const projectId = crypto.randomUUID();
const audioDir = await mkdtemp(join(tmpdir(), "ramble-live-qa-"));
let userId: string | undefined;
let cookie: string | undefined;
let app: ReturnType<typeof createApi> | undefined;
let socket: WebSocket | undefined;
let exitCode = 1;
let projectCreated = false;

function deadline<T>(promise: Promise<T>, label: string, timeout = 90000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), timeout);
  })]).finally(() => clearTimeout(timer));
}

async function synthesize(phrase: string, index: number): Promise<Uint8Array> {
  const path = join(audioDir, `${index}.wav`);
  const child = Bun.spawn(["/usr/bin/say", "-v", "Samantha", "-r", "145", "--file-format=WAVE", "--data-format=LEI16@16000", "-o", path, phrase], { stdout: "ignore", stderr: "pipe" });
  assert.equal(await child.exited, 0, "macOS speech synthesis must succeed");
  const wav = await readFile(path);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  let offset = 12;
  let pcm: Uint8Array | undefined;
  while (offset + 8 <= wav.length) {
    const type = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (type === "fmt ") {
      assert.equal(wav.readUInt16LE(offset + 8), 1, "PCM encoding");
      assert.equal(wav.readUInt16LE(offset + 10), 1, "mono audio");
      assert.equal(wav.readUInt32LE(offset + 12), 16000, "16k sample rate");
      assert.equal(wav.readUInt16LE(offset + 22), 16, "16-bit audio");
    }
    if (type === "data") pcm = new Uint8Array(wav.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size + size % 2;
  }
  assert.ok(pcm?.length, "synthesized WAV must contain PCM samples");
  return pcm;
}

try {
  const phrases = ["Run the Ramble quality check tomorrow", "sub task", "Check the packing list tomorrow", "top level", "Buy apples tomorrow", "remove last"];
  const audio = await Promise.all(phrases.map(synthesize));
  const login = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  assert.equal(login.status, 200, "existing QA user must authenticate");
  cookie = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  assert.ok(cookie, "shared authentication must issue a session cookie");
  const identity = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.ok(identity?.user.id);
  userId = identity.user.id;
  await db.insert(projects).values({ id: projectId, userId, name: `Ramble synthetic QA ${projectId}` });
  projectCreated = true;
  const dependencies = productionDependencies();
  if (["fish", "local"].includes(process.env.RAMBLE_STT_PROVIDER ?? "fish")) {
    dependencies.speech = (callbacks) => connectClipSpeech(callbacks, process.env, async (url, options) => {
      const response = await fetch(url, options);
      if (!response.ok) console.log(`Speech provider HTTP ${response.status}`);
      return response;
    });
  }
  const origin = [...dependencies.allowedOrigins][0];
  assert.ok(origin);
  app = createApi(dependencies).listen({ hostname: "127.0.0.1", port: 0 });
  assert.ok(app.server);
  socket = new WebSocket(`ws://127.0.0.1:${app.server.port}/api/ramble/ws`, { headers: { origin, cookie } });
  const messages: Message[] = [];
  const listeners = new Set<() => void>();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as Message;
    messages.push(message);
    if (message.type === "transcript" && message.final) console.log("Finalized QA speech:", message.text);
    listeners.forEach((listener) => listener());
  });
  await deadline(new Promise<void>((resolve, reject) => {
    socket!.addEventListener("open", () => resolve(), { once: true });
    socket!.addEventListener("error", () => reject(new Error("Authenticated live socket failed")), { once: true });
  }), "authenticated websocket");
  const wait = (type: string, after = 0) => deadline(new Promise<Message>((resolve, reject) => {
    const check = () => {
      const next = messages.slice(after).find((message) => message.type === type || message.type === "error");
      if (!next) return;
      listeners.delete(check);
      if (next.type === "error") reject(new Error(`Live capture error ${next.code}: ${next.message}`));
      else resolve(next);
    };
    listeners.add(check); check();
  }), `live ${type}`);
  await wait("state");
  const startAfter = messages.length;
  socket.send(JSON.stringify({ type: "start", options: { referenceDate: "2026-10-03T12:00:00", timeZone: "Europe/Zurich", projectId } }));
  await wait("ready", startAfter);
  let state: RambleSessionState | undefined;
  for (let index = 0; index < audio.length; index += 1) {
    const after = messages.length;
    // Stream 100ms frames at real speed, then endpoint with silence.
    for (let offset = 0; offset < audio[index].length; offset += 3200) {
      socket.send(audio[index].subarray(offset, offset + 3200));
      await Bun.sleep(100);
    }
    for (let pause = 0; pause < 18; pause += 1) {
      socket.send(new Uint8Array(3200)); await Bun.sleep(100);
    }
    state = (await wait("state", after)).state;
    assert.ok(state);
    if (index === 0) { assert.equal(state.todos.length, 1); assert.equal(state.todos[0].dueDate, "2026-10-04"); }
    if (index === 1) assert.equal(state.mode, "sub-task");
    if (index === 2) { assert.equal(state.todos.length, 2); assert.equal(state.todos[1].parentId, state.todos[0].id); assert.equal(state.todos[1].dueDate, "2026-10-04"); }
    if (index === 3) assert.equal(state.mode, "top-level");
    if (index === 4) assert.equal(state.todos.length, 3);
    if (index === 5) assert.equal(state.todos.length, 2, "voice remove last must undo the temporary item");
  }
  assert.ok(state);
  assert.equal((await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId))).length, 0, "live speech must only stage tasks before explicit commit");
  const commitAfter = messages.length;
  socket.send(JSON.stringify({ type: "commit" }));
  assert.equal((await wait("committed", commitAfter)).count, 2);
  const persisted = await db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.projectId, projectId)));
  assert.equal(persisted.length, 2);
  const parent = persisted.find((todo) => todo.parentId === null);
  const child = persisted.find((todo) => todo.parentId !== null);
  assert.ok(parent && child);
  assert.equal(child.parentId, parent.id);
  assert.equal(parent.title, state.todos[0].title);
  assert.equal(child.title, state.todos[1].title);
  const zurichDay = (date: Date | null) => date && new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  assert.equal(zurichDay(parent.dueDate), "2026-10-04");
  assert.equal(zurichDay(child.dueDate), "2026-10-04");
  console.log("Live synthetic-speech QA passed: real authentication, configured transcription/task models, sub-task grammar, undo, staging, explicit commit, persisted linkage and local due dates.");
  exitCode = 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Live speech QA failed");
} finally {
  socket?.close();
  void app?.server?.stop(true);
  if (projectCreated && userId) {
    await db.delete(tasks).where(and(eq(tasks.userId, userId), eq(tasks.projectId, projectId)));
    await db.delete(projects).where(and(eq(projects.userId, userId), eq(projects.id, projectId)));
    console.log("Removed this run's uniquely scoped QA tasks and project.");
  }
  if (cookie) await auth.api.signOut({ headers: new Headers({ cookie }) });
  await rm(audioDir, { recursive: true, force: true });
}
process.exit(exitCode);
