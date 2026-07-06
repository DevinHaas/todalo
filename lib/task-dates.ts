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

export function hasDueTime(date: Date) {
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

// Combines a calendar date with an "HH:mm" time string (from a native
// <input type="time">), keeping the date's y/m/d and applying the time.
export function combineDateAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}
