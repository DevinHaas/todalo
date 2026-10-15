import { afterEach, describe, expect, it, vi } from "vitest";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { AccountTransportError } from "./errors";
import { feedback, hapticsPreference, type FeedbackEvent } from "./feedback";
import { taskKeys, taskMutations, type TaskDto, type TaskTransport } from "./tasks";

const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) }; };
const broken = () => { throw new Error("storage blocked"); };
const task = (id: string): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [],
});

describe("haptics preference", () => {
  it("is on by default and persists an opt-out", () => {
    const store = memory();
    const preference = hapticsPreference(() => store);
    expect(preference.enabled()).toBe(true);
    preference.set(false);
    expect(hapticsPreference(() => store).enabled()).toBe(false);
    preference.set(true);
    expect(preference.enabled()).toBe(true);
  });

  it("falls back to on without throwing when storage is unavailable", () => {
    const preference = hapticsPreference(broken);
    expect(preference.enabled()).toBe(true);
    expect(() => preference.set(false)).not.toThrow();
  });
});

describe("feedback adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("plays semantic events only while enabled", () => {
    const played: FeedbackEvent[] = [];
    let enabled = true;
    const adapter = feedback(async (event) => { played.push(event); }, () => enabled);
    adapter.play("taskCompleted");
    enabled = false;
    adapter.play("taskCompleted");
    expect(played).toEqual(["taskCompleted"]);
  });

  it("swallows unsupported or failing native feedback", async () => {
    expect(() => feedback(() => { throw new Error("no runtime"); }, () => true).play("taskCompleted")).not.toThrow();
    expect(() => feedback(() => Promise.reject(new Error("FEEDBACK_FAILED")), () => true).play("taskCompleted")).not.toThrow();
    expect(() => feedback(async () => {}, broken).play("taskCompleted")).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 0)); // no unhandled rejection
  });

  it("still plays under reduced motion: a haptic is not motion (iOS System Haptics governs it)", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
    const played: FeedbackEvent[] = [];
    feedback(async (event) => { played.push(event); }, () => true).play("taskCompleted");
    expect(played).toEqual(["taskCompleted"]);
  });
});

describe("completion feedback trigger", () => {
  const setup = (transport: Partial<TaskTransport>, play: (event: FeedbackEvent) => void) => {
    const cache = new QueryClient();
    cache.setQueryData(taskKeys.today("alice"), { openCount: 1, tasks: [task("a")] });
    return { cache, writes: taskMutations(transport as TaskTransport, cache, "alice", { play }) };
  };

  it("plays once when the completion is applied, before the server answers, even across retries", async () => {
    const played: FeedbackEvent[] = [];
    let calls = 0;
    let release!: (value: TaskDto) => void;
    const { cache, writes } = setup({
      complete: () => { calls += 1; if (calls === 1) return Promise.reject(new AccountTransportError("CONNECTION_FAILED")); return new Promise(resolve => { release = resolve; }); },
    }, (event) => played.push(event));
    const pending = new MutationObserver(cache, { ...writes.complete, retryDelay: 0 }).mutate(task("a"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(played).toEqual(["taskCompleted"]);
    await vi.waitFor(() => expect(calls).toBe(2));
    release({ ...task("a"), status: "done" });
    await pending;
    expect(played).toEqual(["taskCompleted"]);
  });

  it("never fails or blocks the completion when feedback throws", async () => {
    const native = feedback(() => { throw new Error("haptics broke"); }, () => true);
    const { cache, writes } = setup({ complete: async () => ({ ...task("a"), status: "done" }) }, native.play);
    await expect(new MutationObserver(cache, writes.complete).mutate(task("a"))).resolves.toMatchObject({ status: "done" });
  });

  it("does not play for create or delete", async () => {
    const played: FeedbackEvent[] = [];
    const { cache, writes } = setup({ create: async () => task("n"), remove: async () => true }, (event) => played.push(event));
    await new MutationObserver(cache, writes.create).mutate({ id: "n", title: "n", dueDate: null });
    await new MutationObserver(cache, writes.remove).mutate(task("a"));
    expect(played).toEqual([]);
  });
});
