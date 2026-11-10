import { describe, expect, it, vi } from "vitest";
import { defaultProjectDisplay } from "../../../packages/server/src/project-dto";
import { QueryClient } from "@tanstack/react-query";
import { begin, commit, settle } from "./optimistic";
import { createSync, deltaChanges, mergeById, type SyncDelta, type SyncTransport } from "./sync";
import { taskChanges, taskKeys, type TaskDto, type TodayDto } from "./tasks";
import { commentKeys } from "./comments";

const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: "2026-11-07T10:00:00.000Z", commentCount: 0, ...extra,
});
const delta = ({ deleted, ...extra }: Omit<Partial<SyncDelta>, "deleted"> & { deleted?: Partial<SyncDelta["deleted"]> } = {}): SyncDelta => ({
  cursor: "200", full: false, tasks: [], projects: [], labels: [], filters: [], comments: [], changed: [], ...extra,
  deleted: { task: [], project: [], label: [], filter: [], comment: [], ...deleted },
});
const today = (cache: QueryClient) => cache.getQueryData<TodayDto>(taskKeys.today("u"))!;

describe("mergeById", () => {
  const a = { id: "a", name: "A", v: 1 }, b = { id: "b", name: "B", v: 1 }, c = { id: "c", name: "C", v: 1 };
  it.each<[string, Parameters<typeof mergeById<typeof a>>, typeof a[]]>([
    ["replaces in place", [[a, b], [{ ...a, v: 2 }], []], [{ ...a, v: 2 }, b]],
    ["drops deleted rows", [[a, b], [], ["a"]], [b]],
    ["appends new rows", [[a], [c], []], [a, c]],
    ["a deleted row is never re-added", [[a], [b], ["b"]], [a]],
    ["keeps a newer cached row", [[a], [{ ...a, v: 0 }], [], { keep: (cached, incoming) => cached.v > incoming.v }], [a]],
    ["adds nothing when told not to", [[a], [c], [], { add: false }], [a]],
    ["re-sorts as the server orders", [[c, a], [{ ...b }], [], { order: (x, y) => x.name.localeCompare(y.name) }], [a, b, c]],
    ["unknown deletes are harmless", [[a], [], ["zzz"]], [a]],
  ])("%s", (_name, args, expected) => expect(mergeById(...args)).toEqual(expected));
});

describe("delta merge into the cache", () => {
  const seeded = () => {
    const cache = new QueryClient();
    cache.setQueryData(taskKeys.today("u"), { tasks: [task("keep"), task("edit"), task("drop")], openCount: 0 });
    cache.setQueryData(["user", "u", "project", "p1"], { project: { id: "p1", name: "P", color: null, description: null, favorite: false, archived: false, display: defaultProjectDisplay }, sections: [], tasks: [task("edit", { projectId: "p1" })] });
    cache.setQueryData(["user", "u", "projects"], [{ id: "p1", name: "Work", color: null }, { id: "p2", name: "Old", color: null }]);
    cache.setQueryData(commentKeys.task("u", "keep"), [{ id: "c1", taskId: "keep", body: "hi", createdAt: "2026-11-07T09:00:00.000Z", author: { name: "A", image: null } }]);
    return cache;
  };
  const apply = (cache: QueryClient, changes: ReturnType<typeof deltaChanges>["changes"]) => {
    for (const { filters, patch } of changes) for (const query of cache.getQueryCache().findAll(filters)) if (query.state.data !== undefined) cache.setQueryData(query.queryKey, patch(query.state.data, query.queryKey));
  };

  it("upserts and deletes tasks in every list, moving them between projects", () => {
    const cache = seeded();
    const { changes, refresh } = deltaChanges("u", delta({ tasks: [task("edit", { title: "Edited", projectId: "p2", updatedAt: "2026-11-07T11:00:00.000Z" }), task("added")], deleted: { task: ["drop"] } }));
    apply(cache, changes);
    expect(today(cache).tasks.map(row => [row.id, row.title])).toEqual([["keep", "keep"], ["edit", "Edited"], ["added", "added"]]);
    expect(cache.getQueryData<{ tasks: TaskDto[] }>(["user", "u", "project", "p1"])!.tasks).toEqual([]);
    expect(refresh).toContainEqual({ queryKey: ["user", "u", "search"] });
  });

  it("projects re-sort by name; comments merge into their own task's list; derived reads refetch", () => {
    const cache = seeded();
    const comment = { id: "c2", taskId: "keep", body: "later", createdAt: "2026-11-07T10:00:00.000Z", author: { name: "A", image: null } };
    const other = { ...comment, id: "c3", taskId: "edit" };
    const { changes, refresh } = deltaChanges("u", delta({
      projects: [{ id: "p3", name: "Alpha", color: null, description: null, favorite: false, archived: false, display: defaultProjectDisplay }], comments: [comment, other],
      deleted: { project: ["p2"] }, changed: ["goal", "section"],
    }));
    apply(cache, changes);
    expect(cache.getQueryData<{ name: string }[]>(["user", "u", "projects"])!.map(project => project.name)).toEqual(["Alpha", "Work"]);
    expect(cache.getQueryData<{ id: string }[]>(commentKeys.task("u", "keep"))!.map(row => row.id)).toEqual(["c1", "c2"]);
    expect(refresh).toEqual(expect.arrayContaining([{ queryKey: ["user", "u", "goals"] }, { queryKey: ["user", "u", "seasons"] }, { queryKey: ["user", "u", "project"] }, { queryKey: ["user", "u", "project", "p2"] }]));
  });
});

describe("createSync", () => {
  const transport = (...answers: SyncDelta[]) => { const changes = vi.fn<SyncTransport["changes"]>(); for (const answer of answers) changes.mockResolvedValueOnce(answer); return { changes }; };

  it("the first answer only starts the cursor; later pulls send it and merge", async () => {
    const cache = new QueryClient();
    cache.setQueryData(taskKeys.today("u"), { tasks: [task("a")], openCount: 0 });
    const fake = transport(delta({ full: true, cursor: "100" }), delta({ cursor: "150", tasks: [task("b")] }));
    const sync = createSync({ transport: fake, cache, userId: "u" });
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    await sync.pull();
    expect(invalidate).not.toHaveBeenCalled();
    await sync.pull();
    expect(fake.changes.mock.calls).toEqual([[null], ["100"]]);
    expect(today(cache).tasks.map(row => row.id)).toEqual(["a", "b"]);
  });

  it("a full answer to a known cursor (too old) refetches everything", async () => {
    const cache = new QueryClient();
    const sync = createSync({ transport: transport(delta({ full: true, cursor: "1" }), delta({ full: true, cursor: "900" })), cache, userId: "u" });
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    await sync.pull(); await sync.pull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["user", "u"] });
  });

  it("never clobbers a pending optimistic write: the delta lands after it settles, and an older copy loses", async () => {
    const cache = new QueryClient();
    cache.setQueryData(taskKeys.today("u"), { tasks: [task("t", { title: "Old" })], openCount: 0 });
    const sync = createSync({ transport: transport(delta({ full: true, cursor: "1" }), delta({ cursor: "2", tasks: [task("t", { title: "Stale server copy", updatedAt: "2026-11-07T10:00:00.000Z" }), task("other")] })), cache, userId: "u" });
    await sync.pull();
    // An edit is in flight (optimistic.ts): the screen shows its patch.
    const write = await begin(cache, taskChanges("u", tasks => tasks.map(row => row.id === "t" ? { ...row, title: "Mine" } : row)));
    const pulled = sync.pull();
    await tick();
    expect(sync.state).toBe("syncing");
    expect(today(cache).tasks.map(row => row.title)).toEqual(["Mine"]);
    // The server answers the edit with a newer version; then the write settles and the delta merges.
    commit(write, taskChanges("u", tasks => tasks.map(row => row.id === "t" ? { ...row, title: "Mine", updatedAt: "2026-11-07T12:00:00.000Z" } : row)));
    void settle(write);
    await pulled;
    expect(today(cache).tasks.map(row => [row.id, row.title])).toEqual([["t", "Mine"], ["other", "other"]]);
    expect(sync.state).toBe("synced");
  });

  it("pulls asked for during a pull coalesce into one more", async () => {
    const cache = new QueryClient();
    const fake = transport(delta({ full: true, cursor: "1" }), delta({ cursor: "2" }), delta({ cursor: "3" }));
    const sync = createSync({ transport: fake, cache, userId: "u" });
    await sync.pull();
    await Promise.all([sync.pull(), sync.pull(), sync.pull()]);
    expect(fake.changes.mock.calls).toEqual([[null], ["1"], ["2"]]);
  });

  it("reload (⌘R) restarts the cursor and refetches every read", async () => {
    const cache = new QueryClient();
    const fake = transport(delta({ full: true, cursor: "7" }), delta({ cursor: "8" }));
    const sync = createSync({ transport: fake, cache, userId: "u" });
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    await sync.reload();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["user", "u"] });
    await sync.pull();
    expect(fake.changes.mock.calls).toEqual([[null], ["7"]]);
  });
});
