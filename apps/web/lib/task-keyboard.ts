export function taskTreeOrder<T extends { id: string; parentId: string | null }>(tasks: T[]): T[] {
  const ids = new Set(tasks.map(task => task.id));
  return tasks.filter(task => !task.parentId || !ids.has(task.parentId)).flatMap(task => [task, ...tasks.filter(child => child.parentId === task.id)]);
}

/** Public visible-task interaction seam. DOM views supply their rendered order. */
export class TaskFocusController {
  visible: string[] = [];
  focused: string | null = null;
  selected = new Set<string>();
  setVisible(ids: string[]) {
    const index = this.focused ? this.visible.indexOf(this.focused) : 0;
    this.visible = ids;
    this.selected = new Set([...this.selected].filter(id => ids.includes(id)));
    if (this.focused && !ids.includes(this.focused)) this.focused = ids[Math.min(Math.max(0, index), ids.length - 1)] ?? null;
  }
  focus(id: string) { if (this.visible.includes(id)) this.focused = id; }
  move(direction: number) {
    const index = this.focused ? this.visible.indexOf(this.focused) : -1;
    this.focused = this.visible[Math.max(0, Math.min(this.visible.length - 1, index < 0 ? (direction > 0 ? 0 : this.visible.length - 1) : index + direction))] ?? null;
    return this.focused;
  }
  toggleSelection() {
    if (!this.focused) return;
    if (this.selected.has(this.focused)) this.selected.delete(this.focused); else this.selected.add(this.focused);
  }
  moveColumn(columns: string[][], direction: number) {
    const nonEmpty = columns.filter(column => column.length);
    const current = nonEmpty.findIndex(column => this.focused !== null && column.includes(this.focused));
    if (current < 0) return this.move(direction);
    const row = nonEmpty[current].indexOf(this.focused!);
    const target = nonEmpty[Math.max(0, Math.min(nonEmpty.length - 1, current + direction))];
    this.focused = target[Math.min(row, target.length - 1)] ?? null;
    return this.focused;
  }
  targets() { return this.selected.size ? this.visible.filter(id => this.selected.has(id)) : this.focused ? [this.focused] : []; }
  resolveTargets(activeId: string | null, selectionToolbar = false) {
    if (!selectionToolbar && (!activeId || !this.visible.includes(activeId))) return [];
    if (this.selected.size) return this.visible.filter(id => this.selected.has(id));
    return activeId && this.visible.includes(activeId) ? [activeId] : [];
  }
  remove(ids: string[]) {
    const index = this.focused ? this.visible.indexOf(this.focused) : 0;
    this.visible = this.visible.filter(id => !ids.includes(id));
    this.selected = new Set([...this.selected].filter(id => !ids.includes(id)));
    this.focused = this.visible[Math.min(Math.max(0, index), this.visible.length - 1)] ?? null;
    return this.focused;
  }
}
