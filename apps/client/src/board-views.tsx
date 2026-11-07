// Legacy BoardView (ticket 17): To do / In progress / Done columns over the
// screen's tasks. Pure view (no runtime imports): the screen opens the editor
// and persists drops. Cards drag by their grip handle (pointer: mouse and touch,
// or keyboard: Space/Enter picks up, arrows move between cards and columns,
// Space drops, Escape cancels), so swiping elsewhere still scrolls the board.
import { useContext, useState, type ReactNode } from "react";
import { DndContext, DragOverlay, closestCorners, pointerWithin, useDroppable, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { boardColumns, boardDrop, columnId, type ReorderInput, type TaskStatus } from "./bulk";
import { SortableRow, dragAnnouncements, useDragSensors } from "./bulk-views";
import { treeOrder, type TaskDto } from "./tasks";
import { MilestoneTasks } from "./task-tree";
import { MilestoneMark } from "./views";

// The card under the pointer wins over its column; keyboard drags (no pointer) take the nearest corners.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const cards = hits.filter(hit => !String(hit.id).startsWith("column:"));
  return cards.length ? cards : hits.length ? hits : closestCorners(args);
};

function Column({ status, label, target, children }: { status: TaskStatus; label: string; target: boolean; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: columnId(status) });
  return <section className="board-column" data-task-column={status} data-target={target || undefined} aria-label={label}>
    <h2 className="board-column-title">{label}</h2>
    <div ref={setNodeRef} className="board-cards">{children}</div>
  </section>;
}

function Card({ task, onOpen }: { task: TaskDto; onOpen?: (task: TaskDto) => void }) {
  const milestone = useContext(MilestoneTasks).has(task.id);
  return <div className={task.parentId ? "board-card sub-task" : "board-card"} data-task-id={task.id}>
    <button type="button" className="board-card-title" onClick={() => onOpen?.(task)}>{task.title}{milestone && <MilestoneMark />}</button>
  </div>;
}

export function StatusBoard({ tasks, onOpen, onMove }: {
  tasks: TaskDto[]; onOpen: (task: TaskDto) => void;
  /** A drop that changes something (boardDrop); without it cards are not draggable. */
  onMove?: (task: TaskDto, move: ReorderInput) => void;
}) {
  const sensors = useDragSensors();
  const [active, setActive] = useState<string | null>(null);
  const [target, setTarget] = useState<TaskStatus | null>(null);
  const statusOf = (id: string) => tasks.find(task => task.id === id)?.status ?? boardColumns.find(column => columnId(column.status) === id)?.status ?? null;
  const label = (id: string) => boardColumns.find(column => columnId(column.status) === id)?.label ?? tasks.find(task => task.id === id)?.title ?? "task";
  const reset = () => { setActive(null); setTarget(null); };
  function end({ active: dragged, over, activatorEvent }: DragEndEvent) {
    reset();
    if (!over) return;
    const task = tasks.find(item => item.id === dragged.id);
    const move = boardDrop(tasks, String(dragged.id), String(over.id));
    if (!task || !move) return;
    onMove?.(task, move);
    // A card that changed column remounts there; keep keyboard focus on its grip.
    if (activatorEvent instanceof KeyboardEvent) requestAnimationFrame(() =>
      document.querySelector(`[data-task-id="${CSS.escape(task.id)}"]`)?.closest(".sortable-row")?.querySelector<HTMLElement>(".drag-handle")?.focus());
  }
  const dragged = tasks.find(task => task.id === active);
  return <DndContext sensors={sensors} collisionDetection={collision} accessibility={{ announcements: dragAnnouncements(label) }}
    onDragStart={({ active: start }) => setActive(String(start.id))} onDragOver={({ over }) => setTarget(over ? statusOf(String(over.id)) : null)}
    onDragCancel={reset} onDragEnd={end}>
    <div className="board" aria-label="Board view">
      {boardColumns.map(column => {
        const cards = treeOrder(tasks.filter(task => task.status === column.status));
        return <Column key={column.status} status={column.status} label={column.label} target={target === column.status && dragged?.status !== column.status}>
          <SortableContext items={cards.map(task => task.id)} strategy={verticalListSortingStrategy}>
            {cards.map(task => onMove
              ? <SortableRow key={task.id} id={task.id} title={task.title}><Card task={task} onOpen={onOpen} /></SortableRow>
              : <Card key={task.id} task={task} onOpen={onOpen} />)}
          </SortableContext>
        </Column>;
      })}
    </div>
    {/* Follows the pointer across columns; the original stays as the placeholder. */}
    <DragOverlay dropAnimation={null}>{dragged && <div className="board-card-overlay"><Card task={dragged} /></div>}</DragOverlay>
  </DndContext>;
}
