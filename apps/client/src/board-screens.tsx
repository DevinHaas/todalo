// Board layout (ticket 17) for Today, Upcoming and projects: the legacy status
// board over the screen's tasks. Drops go through bulkMutations().reorder (one
// owner-checked command: place and/or status), optimistic with rollback.
import { useState } from "react";
import type { Account } from "./session";
import { useEditorExtras, useTaskWrites } from "./task-writes";
import { useReorder } from "./bulk-screens";
import { StatusBoard } from "./board-views";
import { TaskEditor } from "./views";
import type { TaskDto } from "./tasks";

export function BoardScreen({ account, tasks }: { account: Account; tasks: TaskDto[] }) {
  const writes = useTaskWrites(account.user.id);
  const order = useReorder(account.user.id);
  const [editing, setEditing] = useState<string | null>(null);
  // The editor follows the latest cached copy, as the schedule layouts do.
  const task = editing ? tasks.find(item => item.id === editing) : undefined;
  const extras = useEditorExtras(account.user.id, task?.id ?? null);
  return <>
    {order.error && <p role="alert" className="form-error">{order.error}</p>}
    <StatusBoard tasks={tasks} onOpen={(open) => setEditing(open.id)} onMove={order.move} />
    {task && <TaskEditor key={task.id} task={task} labels={extras.labels} shareUrl={extras.shareUrl} onClose={() => setEditing(null)}
      onSave={async (details) => { await writes.update.mutateAsync({ id: task.id, details }); setEditing(null); }} />}
  </>;
}
