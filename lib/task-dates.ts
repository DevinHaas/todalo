// Pure date helpers with no server-only imports (db, env) — safe to import
// from client components. Keep DB-touching code out of this file.

type DueDated = { dueDate: Date | string | null };

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isDueToday(task: DueDated) {
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

export function isDueTodayOrOverdue(task: DueDated) {
  if (!task.dueDate) return false;
  return new Date(task.dueDate) < startOfToday() || isDueToday(task);
}

export function isOverdue(task: DueDated) {
  if (!task.dueDate) return false;
  return new Date(task.dueDate) < startOfToday() && !isDueToday(task);
}
