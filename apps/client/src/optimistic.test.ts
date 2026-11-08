import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { begin, change, commit, optimisticWrite, rollback, settle } from "./optimistic";
import { AccountTransportError } from "./errors";
import { taskMutations, editAction, type TaskDto, type TaskTransport, type TodayDto } from "./tasks";
import { bulkMutations, type BulkTransport } from "./bulk";
import { seasonMutations, seasonKeys, type CurrentSeasonDto, type SeasonTransport } from "./seasons";
import { writeFailure } from "./toasts";

const key = ["user", "u", "list"];
const add = (item: string) => change<string[] | undefined>(key, list => list && [...list, item]);
const read = (cache: QueryClient) => cache.getQueryData<string[]>(key);
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe("optimistic writes", () => {
  it("applies at once and rolls back exactly", async () => {
    const cache = new QueryClient();
    cache.setQueryData(key, ["a"]);
    const write = await begin(cache, [add("b")]);
    expect(read(cache)).toEqual(["a", "b"]);
    rollback(write);
    expect(read(cache)).toEqual(["a"]);
  });

  it("skips reads that were never loaded", async () => {
    const cache = new QueryClient();
    await begin(cache, [add("b")]);
    expect(read(cache)).toBeUndefined();
  });

  it("rolling back one of two concurrent writes keeps the other's change", async () => {
    const cache = new QueryClient();
    cache.setQueryData(key, ["a"]);
    const first = await begin(cache, [add("b")]);
    const second = await begin(cache, [add("c")]);
    rollback(first);
    expect(read(cache)).toEqual(["a", "c"]);
    commit(second);
    expect(read(cache)).toEqual(["a", "c"]);
  });

  it("rolling back after a later write succeeded keeps the server's result", async () => {
    const cache = new QueryClient();
    cache.setQueryData(key, ["a"]);
    const first = await begin(cache, [add("b")]);
    const second = await begin(cache, [add("c?")]);
    commit(second, [change<string[]>(key, list => list.map(item => item === "c?" ? "c" : item))]);
    expect(read(cache)).toEqual(["a", "b", "c"]);
    rollback(first);
    expect(read(cache)).toEqual(["a", "c"]);
  });

  it("reloads a read a refetch replaced mid-write instead of guessing", async () => {
    const cache = new QueryClient();
    cache.setQueryData(key, ["a"]);
    const write = await begin(cache, [add("b")]);
    cache.setQueryData(key, ["server"]);
    rollback(write);
    expect(read(cache)).toEqual(["server"]);
    expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("refreshes reads only once no write is in flight", async () => {
    const cache = new QueryClient();
    cache.setQueryData(key, ["a"]);
    cache.setQueryData(["other"], 1);
    const first = await begin(cache, [add("b")]);
    const second = await begin(cache, [add("c")]);
    commit(first); await settle(first, [{ queryKey: key }]);
    expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
    rollback(second); await settle(second, [{ queryKey: ["other"] }]);
    expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
    expect(cache.getQueryState(["other"])?.isInvalidated).toBe(true);
  });

  it("optimisticWrite applies, rolls back on failure and rethrows", async () => {
    const cache = new QueryClient();
    cache.setQueryData(key, ["a"]);
    const save = deferred<string>();
    const writing = optimisticWrite(cache, [add("b")], () => save.promise);
    await tick();
    expect(read(cache)).toEqual(["a", "b"]);
    save.reject(new AccountTransportError("CONNECTION_FAILED"));
    await expect(writing).rejects.toThrow();
    expect(read(cache)).toEqual(["a"]);
  });
});

const task = (id: string, patch: Partial<TaskDto> = {}): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: "v1", ...patch,
});
const details = (title: string, dueDate: string | null) => ({ updatedAt: "v1", title, description: "", priority: 4, deadline: null, dueDate, dueDateEnd: null, recurrence: null });
const run = <V,>(cache: QueryClient, options: object, input: V) => cache.getMutationCache().build(cache, options as never).execute(input as never);

describe("task, reorder and season writes", () => {
  it("a task move shows at once; a failed one is undone without touching another in-flight edit", async () => {
    const cache = new QueryClient();
    cache.setQueryData<TodayDto>(["user", "u", "today"], { tasks: [task("milk"), task("eggs")], openCount: 0 });
    const saves = new Map<string, ReturnType<typeof deferred<TaskDto>>>([["milk", deferred()], ["eggs", deferred()]]);
    const transport = { update: (id: string) => saves.get(id)!.promise } as unknown as TaskTransport;
    const { update } = taskMutations(transport, cache, "u");
    const tuesday = "2026-11-10T09:00:00.000Z";
    const moving = run(cache, { ...update, retry: false }, { id: "milk", details: details("milk", tuesday) });
    const renaming = run(cache, { ...update, retry: false }, { id: "eggs", details: details("eggs!", null) });
    await tick();
    const tasks = () => cache.getQueryData<TodayDto>(["user", "u", "today"])!.tasks;
    expect(tasks().map(item => [item.title, item.dueDate])).toEqual([["milk", tuesday], ["eggs!", null]]);
    saves.get("milk")!.reject(new AccountTransportError("CONNECTION_FAILED"));
    await expect(moving).rejects.toThrow();
    expect(tasks().map(item => [item.title, item.dueDate])).toEqual([["milk", null], ["eggs!", null]]);
    saves.get("eggs")!.resolve(task("eggs", { title: "eggs!", updatedAt: "v2" }));
    await renaming;
    expect(tasks()[1]).toMatchObject({ title: "eggs!", updatedAt: "v2" });
    expect(editAction(task("milk"), details("milk", tuesday), new Date("2026-11-07T12:00:00Z"))).toBe('move "milk" to Tuesday 10:00'.replace("10:00", new Date(tuesday).toTimeString().slice(0, 5)));
  });

  it("a reorder moves the row at once and back on failure", async () => {
    const cache = new QueryClient();
    cache.setQueryData<TodayDto>(["user", "u", "today"], { tasks: [task("a"), task("b"), task("c")], openCount: 0 });
    const transport = { reorder: async () => { throw new AccountTransportError("SAVE_FAILED"); } } as unknown as BulkTransport;
    const { reorder } = bulkMutations(transport, cache, "u");
    const ids = () => cache.getQueryData<TodayDto>(["user", "u", "today"])!.tasks.map(item => item.id);
    const moving = run(cache, { ...reorder, retry: false }, { task: task("c"), anchorId: "a", position: "before" });
    await tick();
    expect(ids()).toEqual(["c", "a", "b"]);
    await expect(moving).rejects.toThrow();
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("a season goal's tier toggles at once and back on failure", async () => {
    const cache = new QueryClient();
    const goal = { id: "sg", goalId: "g", title: "Run", color: "blue" as const, icon: "target" as const, archived: false, tier: "primary" as const, target: "", carriedFromId: null };
    cache.setQueryData<CurrentSeasonDto>(seasonKeys.current("u"), { season: { id: "s", startDate: "2026-11-01", lengthDays: 84, endedAt: null, goals: [goal], progress: {} as never, statuses: {} } });
    const save = deferred<null>();
    const writes = seasonMutations({ updateGoal: () => save.promise } as unknown as SeasonTransport, cache, "u");
    const tier = () => cache.getQueryData<CurrentSeasonDto>(seasonKeys.current("u"))!.season!.goals[0]!.tier;
    const toggling = writes.updateGoal("s", "g", { tier: "secondary" });
    await tick();
    expect(tier()).toBe("secondary");
    save.resolve(null);
    await expect(toggling).rejects.toThrow();
    expect(tier()).toBe("primary");
  });
});

describe("failure toast copy", () => {
  const error = (code: ConstructorParameters<typeof AccountTransportError>[0]) => new AccountTransportError(code);
  it.each([
    [error("CONNECTION_FAILED"), false, "You're offline. Your change was undone.", true],
    [error("CONNECTION_FAILED"), true, "todalo can't be reached right now. Your change was undone.", true],
    [error("TASK_CHANGED"), true, "It was changed on another device, so the latest version is shown. Your change was undone.", false],
    [error("TASK_NOT_FOUND"), true, "It no longer exists; it may have been deleted on another device. Your change was undone.", false],
    [error("INVALID_INPUT"), true, "todalo didn't accept that value. Check it and try again. Your change was undone.", false],
    [error("SAVE_FAILED"), true, "Something went wrong on todalo's side. Your change was undone.", true],
    [new TypeError("boom"), true, "Something went wrong on todalo's side. Your change was undone.", true],
  ])("%s (online %s)", (failure, online, description, retry) => {
    expect(writeFailure(failure, 'move "Buy milk" to Tuesday', online)).toEqual({ title: 'Couldn\'t move "Buy milk" to Tuesday', description, retry });
  });
  it("stays quiet for a cancelled criteria confirm and a lost session", () => {
    expect(writeFailure(error("CRITERIA_OPEN"), "complete it")).toBeNull();
    expect(writeFailure(error("UNAUTHENTICATED"), "complete it")).toBeNull();
  });
});
