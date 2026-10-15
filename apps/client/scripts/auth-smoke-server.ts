// Isolated manual QA service: no production auth/database imports or .env data.
import { memoryAdapter } from "better-auth/adapters/memory";
import { createSessionAuth } from "../../../packages/auth/src/config";
import { createAuthRoutes } from "../../api/src/auth-routes";
import { fakeGoogleFetch, withFakeGoogleConsent } from "../../api/src/fake-google";
import { createTaskRoutes } from "../../api/src/task-routes";
import { createSettingsRoutes } from "../../api/src/settings-routes";
import { qaAttachmentRoutes, qaOrganize, qaProjectRoutes } from "./qa-projects";
import type { TaskRecord } from "../../../packages/server/src/task-dto";
import { editConflicts, planCompletion, type CompletionTarget } from "../../../packages/server/src/task-rules";
import { createApi } from "../../api/src/app";
import { connectSpeech } from "../../api/src/speech";
import type { SpeechCallbacks, SpeechConnection } from "../../api/src/elevenlabs";
import { fixtureSemanticProcessor } from "../../api/test-fixtures/semantic";

// Set QA_CLIENT_ORIGIN when the Vite client runs on another port.
const clientOrigin = process.env.QA_CLIENT_ORIGIN ?? "http://localhost:5173";
const auth = createSessionAuth({
  database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  baseURL: clientOrigin,
  secret: "local-smoke-test-only-secret-32-characters",
  trustedOrigins: [clientOrigin],
  // Fake Google: consent at /api/fake-google/authorize, token endpoint stubbed below.
  socialProviders: { google: { clientId: "qa-fake-google-client", clientSecret: "qa-fake-google-secret" } },
});
globalThis.fetch = fakeGoogleFetch(fetch);
const { user } = await auth.api.signUpEmail({ body: { name: "Development User", email: "existing@example.test", password: "dev-password-123" } });
const { user: other } = await auth.api.signUpEmail({ body: { name: "Other User", email: "other@example.test", password: "dev-password-123" } });

// Fixture tasks mirror docs/qa/tauri-baseline-fixture.ts, relative to the service's start day.
const day = (offset: number, hours = 0, minutes = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); date.setHours(hours, minutes, 0, 0); return date; };
type QaTask = TaskRecord & { userId: string; recurrence: CompletionTarget["recurrence"]; lastCompletionId: string | null; updatedAt: Date };
const task = (id: string, userId: string, title: string, extra: Partial<QaTask> = {}): QaTask => ({
  id, userId, title, description: null, status: "todo" as const, priority: 4, projectId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [] as string[],
  recurrence: null, lastCompletionId: null, updatedAt: new Date(), ...extra,
});
const tasks = [
  task("overdue-review", user.id, "Review the migration checklist", { dueDate: day(-1, 12), priority: 2, description: "Walk through every inventory row before the cutover." }),
  task("shared-screen", user.id, "Plan the first shared screen", { dueDate: day(0, 14, 30), labelIds: ["design"], deadline: day(3), projectId: "qa-work" }),
  task("future", user.id, "Future fixture task", { dueDate: day(2), projectId: "qa-work" }),
  task("undated", user.id, "Undated fixture task", { projectId: "qa-work" }),
  task("completed", user.id, "Completed fixture task", { dueDate: day(0, 9), status: "done", completedAt: day(0, 9) }),
  task("daily-standup", user.id, "Daily standup notes", { dueDate: day(0, 9, 30), recurrence: { n: 1, unit: "day", basedOn: "scheduled" } }),
  task("other-private", other.id, "Another user's private task", { dueDate: day(0, 10), projectId: "qa-other" }),
  // Ticket 13: a sectioned sub-task under an undated Work task.
  task("undated-step", user.id, "Undated fixture sub-task", { projectId: "qa-work", sectionId: "qa-doing", parentId: "undated-parent" }),
  task("undated-parent", user.id, "Sectioned fixture parent", { projectId: "qa-work", sectionId: "qa-doing" }),
];
if (process.env.QA_EMPTY_TODAY) tasks.splice(0, 6);
const tomorrow = day(1);

const projects = [
  { id: "qa-work", userId: user.id, name: "Work", color: null },
  { id: "qa-errands", userId: user.id, name: "Errands", color: null },
  { id: "qa-other", userId: other.id, name: "Other user's project", color: null },
];
const sections = [
  { id: "qa-doing", userId: user.id, projectId: "qa-work", name: "Doing", sortOrder: 0 },
  { id: "qa-later", userId: user.id, projectId: "qa-work", name: "Later", sortOrder: 1 },
  { id: "qa-other-section", userId: other.id, projectId: "qa-other", name: "Other user's section", sortOrder: 0 },
];
// Rows as the legacy paste route stored them (base64 content), for compatibility checks.
const stored = (id: string, userId: string, taskId: string, name: string, text: string) => ({ id, userId, taskId, name, mediaType: "text/plain", byteSize: Buffer.byteLength(text), content: Buffer.from(text).toString("base64") });
const attachments = [
  stored("qa-legacy-file", user.id, "undated", "Legacy brief.txt", "Stored by the legacy web app.\n"),
  stored("qa-other-file", other.id, "other-private", "Private notes.txt", "Another user's attachment.\n"),
];

const verifySession = async (headers: Headers) => (await auth.api.getSession({ headers, query: { disableCookieCache: true } }))?.user.id ?? null;
// Account settings (ticket 12): per-user memory rows, defaulting smart dates on.
// QA_SETTINGS_SAVE_FAILS=1 answers every settings save with a 500 (rollback QA).
const settings = new Map<string, boolean>();
const app = createAuthRoutes(auth).use(createSettingsRoutes({
  verify: verifySession,
  allowedOrigins: new Set([clientOrigin]),
  get: async (userId) => ({ smartDateRecognition: settings.get(userId) ?? true }),
  setSmartDateRecognition: async (userId, enabled) => {
    if (process.env.QA_SETTINGS_SAVE_FAILS) throw new Error("QA: settings save failed");
    settings.set(userId, enabled);
    return { smartDateRecognition: enabled };
  },
})).use(qaProjectRoutes({

  verify: verifySession,
  allowedOrigins: new Set([clientOrigin]),
  projects,
  sections,
  tasks,
})).use(qaAttachmentRoutes({ verify: verifySession, allowedOrigins: new Set([clientOrigin]), projects, tasks, attachments })).use(createTaskRoutes({
  verify: async (headers) => (await auth.api.getSession({ headers, query: { disableCookieCache: true } }))?.user.id ?? null,
  // ponytail: inline copy of countTodayTasks; importing @todalo/server/today would pull in the production DB client.
  today: async (userId) => {
    const owned = tasks.filter(item => item.userId === userId);
    return { tasks: owned, openCount: owned.filter(item => item.status !== "done" && item.dueDate && item.dueDate < tomorrow).length };
  },
  task: async (userId, id) => tasks.find(item => item.userId === userId && item.id === id) ?? null,
  allowedOrigins: new Set([clientOrigin]),
  // Memory copy of @todalo/server/tasks operation-ID rules (no calendar). With
  // QA_AMBIGUOUS_WRITES set, each first create/complete/edit is applied and then
  // answered with a 500, so QA can watch the client retry without duplicates.
  create: async (userId, input) => {
    const existing = tasks.find(item => item.id === input.id);
    if (existing) return existing.userId === userId ? { task: existing, created: false } : null;
    const created = task(input.id, userId, input.title, {
      description: input.description ?? null, dueDate: input.dueDate ? new Date(input.dueDate) : null, dueDateEnd: input.dueDateEnd ? new Date(input.dueDateEnd) : null,
      recurrence: input.recurrence ? { ...input.recurrence, until: input.recurrence.until ? new Date(input.recurrence.until) : null } : null,
    });
    tasks.push(created);
    ambiguous(`create:${input.id}`);
    return { task: created, created: true };
  },
  // Same pure rules as @todalo/server/tasks (task-rules.ts): recurrence, replays, stale taps/edits.
  complete: async (userId, id, request) => {
    const owned = tasks.find(item => item.userId === userId && item.id === id);
    if (!owned) return null;
    const plan = planCompletion({ ...owned, dueDate: owned.dueDate ? new Date(owned.dueDate) : null }, request);
    if (plan.kind === "changed") return "changed";
    if (plan.kind === "write") {
      Object.assign(owned, plan.patch, { updatedAt: new Date() });
      ambiguous(`complete:${id}`);
    }
    return owned;
  },
  update: async (userId, id, { updatedAt, ...details }) => {
    const owned = tasks.find(item => item.userId === userId && item.id === id);
    if (!owned) return null;
    const date = (value: string | null | undefined) => value ? new Date(value) : null;
    const changes = {
      ...details, deadline: date(details.deadline), dueDate: date(details.dueDate), dueDateEnd: date(details.dueDateEnd),
      recurrence: details.recurrence && { ...details.recurrence, until: date(details.recurrence.until) },
    };
    if (editConflicts(owned, changes, new Date(updatedAt))) return "changed";
    Object.assign(owned, changes, { updatedAt: new Date() });
    ambiguous(`update:${id}`);
    return owned;
  },
  organize: qaOrganize({ projects, sections, tasks }),
  remove: async (userId, id) => {
    const index = tasks.findIndex(item => item.userId === userId && item.id === id);
    if (index >= 0) tasks.splice(index, 1);
    return index >= 0;
  },
}));
const answered = new Set<string>();
function ambiguous(operation: string) {
  if (!process.env.QA_AMBIGUOUS_WRITES || answered.has(operation)) return;
  answered.add(operation);
  throw new Error(`QA: ${operation} applied, response dropped`);
}

// Fake transcription (no provider credentials): reports what actually arrived,
// so a capture proves PCM16 conversion and ordered transport end to end. The
// client's Stop sends 1.5 s of digital silence, which finalizes the phrase.
// Set RAMBLE_STT_PROVIDER=local (plus a loopback RAMBLE_STT_URL) for real speech.
function fakeSpeech(callbacks: SpeechCallbacks): SpeechConnection {
  let closed = false; let bytes = 0; let frames = 0; let peak = 0; let reported = 0;
  queueMicrotask(() => { if (!closed) callbacks.ready(); });
  const text = () => `QA transcription: ${(bytes / 32000).toFixed(1)} s of 16 kHz PCM16 in ${frames} frames, peak ${Math.round(peak / 327.67)}%`;
  return {
    audio(chunk) {
      if (closed) return;
      const samples = new Int16Array(chunk.slice().buffer);
      if (chunk.byteLength === 48_000 && samples.every((sample) => sample === 0)) {
        if (frames) callbacks.transcript(text(), true);
        bytes = 0; frames = 0; peak = 0; reported = 0;
        return;
      }
      frames += 1; bytes += chunk.byteLength;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      if (bytes - reported >= 32000) { reported = bytes; callbacks.transcript(text(), false); }
    },
    async finish() {},
    close() { closed = true; },
  };
}
const ramble = createApi({
  allowedOrigins: new Set([clientOrigin]),
  verify: async (headers) => (await auth.api.getSession({ headers, query: { disableCookieCache: true } }))?.user.id ?? null,
  preferences: async () => ({ smartRecognition: true, projectIds: new Set(), projects: [] }),
  speech: process.env.RAMBLE_STT_PROVIDER ? connectSpeech : fakeSpeech,
  semantic: fixtureSemanticProcessor,
  commit: async () => { throw new Error("Saving Ramble tasks is ticket 21."); },
});
// Elysia owns the listener so /api/ramble/ws can upgrade; everything else
// falls through to the auth/task routes and the fake Google consent page.
ramble.mount(withFakeGoogleConsent((request) => app.handle(request))).listen({ hostname: "127.0.0.1", port: Number(process.env.QA_API_PORT ?? 3009) });
console.log(`Isolated account QA API listening on 127.0.0.1:${process.env.QA_API_PORT ?? 3009}`);
