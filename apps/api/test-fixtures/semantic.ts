import { interpretSegment } from "@todalo/ramble";
import type { SemanticOperation, SemanticProcessor } from "@todalo/ramble/semantic";

export function operation(fields: Partial<SemanticOperation>): SemanticOperation {
  return { type: "ignore", targetId: null, text: null, parentId: null, dueDate: null,
    startTime: null, endTime: null, projectId: null, recurrence: null, clearFields: [], ...fields };
}

// Only a deterministic injected provider for transport/lifecycle tests. This
// doesn't measure model quality and is never selected by production code.
export const fixtureSemanticProcessor: SemanticProcessor = {
  assertConfigured() {},
  async process({ text, state }) {
    const { action } = interpretSegment(text, state);
    if (action.type === "create-todo" || action.type === "create-sub-task") return [operation({ type: "create", text })];
    const commands: Record<string, SemanticOperation["type"]> = { "enter-sub-task": "sub-task", "exit-sub-task": "top-level", undo: "undo", end: "end" };
    return [operation({ type: commands[action.type] ?? "ignore" })];
  },
};
