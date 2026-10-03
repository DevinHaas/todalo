import { describe, expect, it, vi } from "vitest";
import { RambleConnection } from "./ramble-session";
import type { SpeechCallbacks } from "./elevenlabs";
import type { RambleTodo } from "@todalo/ramble";
import { fixtureSemanticProcessor, operation } from "../test-fixtures/semantic";

function harness() {
  const send = vi.fn();
  const commit = vi.fn(async (_todos: RambleTodo[], _zone: string) => 2);
  let callbacks: SpeechCallbacks | undefined;
  const audio = vi.fn();
  const close = vi.fn();
  const finish = vi.fn(async () => {});
  const process = vi.fn(fixtureSemanticProcessor.process);
  const assertConfigured = vi.fn();
  const session = new RambleConnection({
    send, commit, smartRecognition: true, projectIds: new Set(["owned"]), projects: [{ id: "owned", name: "Work" }],
    semantic: { process, assertConfigured },
    speech: (events) => { callbacks = events; return { audio, close, finish }; },
  });
  const start = () => session.message({ type: "start", options: {
    referenceDate: "2026-10-03T14:30:00", timeZone: "Europe/Zurich", projectId: "owned",
  } });
  return { session, send, commit, start, audio, close, finish, process, assertConfigured, events: () => callbacks! };
}

describe("connection staging", () => {
  it("keeps sessions independent and writes only after explicit commit", async () => {
    const h = harness(); const other = harness();
    await h.start(); h.events().ready();
    await h.events().transcript("buy milk tomorrow at 4pm", true);
    await h.events().transcript("sub task", true);
    await h.events().transcript("check fridge", true);
    expect(h.session.state.todos).toHaveLength(2);
    expect(h.session.state.todos[1].parentId).toBe(h.session.state.todos[0].id);
    expect(h.session.state.todos[0]).toMatchObject({ title: "buy milk", dueDate: "2026-10-04", startTime: "16:00", projectId: "owned" });
    expect(other.session.state.todos).toEqual([]);
    expect(h.commit).not.toHaveBeenCalled();
    await h.session.message({ type: "commit" });
    expect(h.finish).toHaveBeenCalledOnce();
    expect(h.commit).toHaveBeenCalledWith(h.session.state.todos, "Europe/Zurich");
    expect(h.send).toHaveBeenLastCalledWith({ type: "committed", count: 2 });
    await h.session.message({ type: "commit" });
    expect(h.commit).toHaveBeenCalledOnce();
  });
  it("flushes a pending final phrase before saving and ignores later speech", async () => {
    const h = harness(); await h.start();
    h.finish.mockImplementation(async () => { h.events().transcript("pending phrase", true); });
    await h.session.message({ type: "commit" });
    expect(h.commit.mock.calls[0][0][0].title).toBe("pending phrase");
    h.events().transcript("late phrase", true);
    expect(h.session.state.todos).toHaveLength(1);
  });
  it("handles partials, mode undo, item undo, removal and discard without writes", async () => {
    const h = harness(); await h.start();
    for (const phrase of ["parent", "sub-task", "child", "top level", "undo", "undo"]) await h.events().transcript(phrase, true);
    expect(h.session.state.mode).toBe("sub-task");
    expect(h.session.state.todos).toHaveLength(1);
    h.events().transcript("partial only", false);
    expect(h.session.state.todos).toHaveLength(1);
    await h.session.message({ type: "remove", id: h.session.state.todos[0].id });
    expect(h.session.state.todos).toEqual([]);
    await h.session.message({ type: "discard" });
    expect(h.close).toHaveBeenCalled();
    expect(h.commit).not.toHaveBeenCalled();
  });
  it("spoken end commits once; overlapping manual commit cannot duplicate it", async () => {
    const h = harness(); await h.start();
    h.events().transcript("a task", true);
    h.events().transcript("that's all", true);
    await h.session.message({ type: "commit" });
    await Promise.resolve();
    expect(h.commit).toHaveBeenCalledOnce();
  });
  it("keeps staged tasks when speech or save fails, allowing save retry", async () => {
    const h = harness(); await h.start();
    await h.events().transcript("important", true);
    h.events().error("Unavailable");
    h.commit.mockRejectedValueOnce(new Error("database unavailable"));
    await h.session.message({ type: "commit" });
    expect(h.session.state.todos).toHaveLength(1);
    expect(h.send).toHaveBeenLastCalledWith(expect.objectContaining({ code: "save_failed" }));
    await h.session.message({ type: "commit" });
    expect(h.commit).toHaveBeenCalledTimes(2);
  });
  it("rejects foreign projects, browser transcript injection, bad timezone, and oversized audio", async () => {
    const h = harness();
    await h.session.message({ type: "start", options: { projectId: "foreign" } });
    expect(h.send).toHaveBeenLastCalledWith(expect.objectContaining({ code: "invalid_project" }));
    await h.session.message({ type: "transcript", text: "injected", final: true });
    expect(h.session.state.todos).toEqual([]);
    await h.start();
    await h.session.message(new Uint8Array(64_002));
    expect(h.audio).not.toHaveBeenCalled();
    await h.session.message(new Uint8Array(3200));
    expect(h.audio).toHaveBeenCalledOnce();
  });
  it("ignores conversational speech and applies multi-task output with contextual edits", async () => {
    const h = harness(); await h.start();
    h.process.mockResolvedValueOnce([]);
    await h.session.transcript("I am just thinking aloud", true);
    expect(h.session.state.todos).toHaveLength(0);
    h.process.mockResolvedValueOnce([operation({ type: "create", text: "Buy milk" }), operation({ type: "create", text: "Call Anna" })]);
    await h.session.transcript("Buy milk and call Anna", true);
    h.process.mockResolvedValueOnce([operation({ type: "edit", targetId: "$last", dueDate: "2026-10-09" })]);
    await h.session.transcript("Actually make that Friday", true);
    expect(h.session.state.todos).toHaveLength(2);
    expect(h.session.state.todos[1]).toMatchObject({ title: "Call Anna", dueDate: "2026-10-09" });
    expect(h.process.mock.calls[2][0].recentSpeech).toEqual(["I am just thinking aloud", "Buy milk and call Anna"]);
  });
  it("waits for delayed understanding before committing a finalized phrase", async () => {
    const h = harness(); await h.start();
    let resolve!: (value: ReturnType<typeof operation>[]) => void;
    h.process.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const processing = h.session.transcript("Call Anna", true);
    await Promise.resolve();
    const saving = h.session.message({ type: "commit" });
    await Promise.resolve();
    expect(h.commit).not.toHaveBeenCalled();
    resolve([operation({ type: "create", text: "Call Anna" })]);
    await processing; await saving;
    expect(h.commit.mock.calls[0][0]).toHaveLength(1);
  });
  it("serializes corrections and manual removals behind model responses", async () => {
    const h = harness(); await h.start();
    await h.session.transcript("Call Anna", true);
    let resolve!: (value: ReturnType<typeof operation>[]) => void;
    h.process.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = h.session.transcript("Actually Friday", true);
    await Promise.resolve();
    const remove = h.session.message({ type: "remove", id: h.session.state.todos[0].id });
    resolve([operation({ type: "edit", targetId: "$last", dueDate: "2026-10-09" })]);
    await pending; await remove;
    expect(h.session.state.todos).toEqual([]);
  });
  it("retains failed speech, blocks saving, and retries without duplicate tasks", async () => {
    const h = harness(); await h.start();
    await h.session.transcript("Existing task", true);
    h.process.mockRejectedValueOnce(new Error("Provider timed out"));
    await h.session.transcript("Call Anna", true);
    await h.session.message({ type: "commit" });
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.session.state.todos).toHaveLength(1);
    await h.session.message({ type: "retry-understanding" });
    expect(h.session.state.todos).toHaveLength(2);
    await h.session.message({ type: "commit" });
    expect(h.commit).toHaveBeenCalledOnce();
  });
  it("aborts a model call on discard and ignores its late result", async () => {
    const h = harness(); await h.start();
    let resolve!: (value: ReturnType<typeof operation>[]) => void;
    h.process.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = h.session.transcript("Call Anna", true); await Promise.resolve();
    const signal = h.process.mock.calls[0][1];
    await h.session.message({ type: "discard" });
    expect(signal.aborted).toBe(true);
    resolve([operation({ type: "create", text: "Call Anna" })]); await pending;
    expect(h.session.state.todos).toHaveLength(0);
    expect(h.commit).not.toHaveBeenCalled();
  });
  it("rejects invented project IDs and ending capture from a conversational sentence", async () => {
    const h = harness(); await h.start();
    h.process.mockResolvedValueOnce([operation({ type: "create", text: "Task", projectId: "foreign" })]);
    await h.session.transcript("A task", true);
    expect(h.session.state.todos).toHaveLength(0);
    expect(h.commit).not.toHaveBeenCalled();
    const other = harness(); await other.start();
    other.process.mockResolvedValueOnce([operation({ type: "end" })]);
    await other.session.transcript("The report is done but I need to send it", true);
    expect(other.commit).not.toHaveBeenCalled();
    expect(other.session.state.readyToCommit).toBe(false);
  });
  it("requires model configuration before opening a paid speech connection", async () => {
    const h = harness(); h.assertConfigured.mockImplementation(() => { throw new Error("Missing credential"); });
    await h.start();
    expect(h.send).toHaveBeenLastCalledWith(expect.objectContaining({ code: "understanding_unavailable" }));
    expect(h.events()).toBeUndefined();
  });
});
