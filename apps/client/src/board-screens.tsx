// Board layout (ticket 17) for Today, Upcoming and projects: the legacy status
// board over the screen's tasks. Drops go through bulkMutations().reorder (one
// owner-checked command: place and/or status), optimistic with rollback.
import { useContext } from "react";
import type { Account } from "./session";
import { useReorder } from "./bulk-screens";
import { StatusBoard } from "./board-views";
import { TaskDialogs } from "./views";
import type { TaskDto } from "./tasks";

export function BoardScreen({ account, tasks }: { account: Account; tasks: TaskDto[] }) {
  const order = useReorder(account.user.id);
  // The shell's full task sheet (sub-tasks, comments, goals, milestone), as list rows open it.
  const dialog = useContext(TaskDialogs);
  return <StatusBoard tasks={tasks} onOpen={(open) => dialog?.open(open.id)} onMove={order.move} />;
}
