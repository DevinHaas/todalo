import { describe, expect, it } from "vitest";
import { CoachModelError } from "./coach";
import { chatMessages, parseChatReply } from "./coach-chat";
import { weekPlan, type DraftTask } from "./drafts";

// Zurich, Monday 9 Feb 2026, 09:10 local.
const zone = "Europe/Zurich";
const now = new Date("2026-02-09T08:10:00Z");
const task = (id: string, extra: Partial<DraftTask> = {}): DraftTask =>
  ({ id, title: id, status: "todo", projectId: null, parentId: null, dueDate: null, dueDateEnd: null, updatedAt: now, ...extra });
const plan = weekPlan({ zone, now, start: "2026-02-09", context: {
  tasks: [task("run"), task("talk", { dueDate: new Date("2026-02-09T13:00:00Z"), dueDateEnd: new Date("2026-02-09T14:00:00Z") })],
  goals: [{ goalId: "fit", title: "Fit", tier: "primary" }], links: { projects: [], tasks: [{ goalId: "fit", taskId: "talk" }] }, fixedTaskIds: [],
} });
const item = (op: string, extra: Record<string, unknown>) => ({ op, task: "", title: "", day: "", start: "", minutes: 0, goal: "", reason: "r", ...extra });
const reply = (items: unknown[], text = "Sure.") => JSON.stringify({ reply: text, summary: "s", items });

describe("parseChatReply", () => {
  it.each([
    ["no items: just the reply", reply([]), "Sure.", 0],
    ["a valid add: a draft", reply([item("add", { task: "t2", day: "2026-02-10", start: "08:00", minutes: 30 })]), "Sure.", 1],
    ["an unknown ref: reply with a note", reply([item("add", { task: "t9", day: "2026-02-10", start: "08:00", minutes: 30 })]), /^Sure\.\n\n\(.*cannot add t9.*Ask again/, null],
    ["removing primary-goal work: reply with a note", reply([item("remove", { task: "t1" })]), /primary-goal work/, null],
  ])("%s", (_, content, text, count) => {
    const result = parseChatReply(content, plan);
    if (typeof text === "string") expect(result.reply).toBe(text); else expect(result.reply).toMatch(text);
    expect(result.draft?.items.length ?? null).toBe(count || null);
  });

  it("ticket 28: overflow alone is a draft (nothing placed)", () => {
    const content = JSON.stringify({ reply: "Your week is full.", summary: "s", items: [], overflow: [{ task: "t2", title: "", minutes: 30, goal: "", reason: "No room." }] });
    expect(parseChatReply(content, plan).draft).toMatchObject({ items: [], overflow: [{ taskId: "run", minutes: 30 }] });
  });

  it.each([["not JSON", "nope"], ["an empty reply", reply([], "  ")], ["a wrong shape", JSON.stringify({ text: "hi" })]])("rejects %s", (_, content) => {
    expect(() => parseChatReply(content, plan)).toThrow(CoachModelError);
  });
});

describe("chatMessages", () => {
  it("puts the prompt and facts first, then the last 20 turns and the new message", () => {
    const history = Array.from({ length: 25 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: `m${index}` }));
    const messages = chatMessages({ facts: true } as never, history, "now?");
    expect(messages.slice(0, 2).map(message => message.role)).toEqual(["system", "system"]);
    expect(messages[1]!.content).toBe('Facts: {"facts":true}');
    expect(messages.slice(2, -1).map(message => message.content)).toEqual(history.slice(5).map(message => message.content));
    expect(messages.at(-1)).toEqual({ role: "user", content: "now?" });
  });
});
