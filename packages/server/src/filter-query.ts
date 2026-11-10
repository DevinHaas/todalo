// Todoist-style filter queries (todoist.com/help/articles/introduction-to-filters-V98wIH),
// parsed and evaluated in pure code (no database) so the API, the legacy web
// page and the client's live preview all agree. Supported and unsupported
// operators are listed in docs/filter-queries.md.

export const FILTER_QUERY_MAX = 1024;

type DateLike = Date | string | null | undefined;
type Unit = "minute" | "hour" | "day" | "week" | "month" | "year";

/** A day (or, for times and hours, an instant) relative to the evaluation time. */
export type DateSpec =
  | { kind: "day"; offset: number }
  | { kind: "weekday"; day: number }
  | { kind: "calendar"; month: number; day: number; year: number | null }
  | { kind: "nextWeek" }
  | { kind: "firstDay" }
  | { kind: "shift"; n: number; unit: Unit; from: DateSpec | "now" }
  | { kind: "at"; base: DateSpec; minutes: number };

export type DateField = "date" | "due" | "deadline" | "created";

export type FilterTerm =
  | { kind: "all" }
  | { kind: "overdue" }
  | { kind: "noDate" }
  | { kind: "noDeadline" }
  | { kind: "noTime" }
  | { kind: "recurring" }
  | { kind: "subtask" }
  | { kind: "noLabels" }
  | { kind: "priority"; value: number }
  | { kind: "date"; field: DateField; op: "on" | "before" | "after"; spec: DateSpec }
  | { kind: "nextDays"; days: number }
  | { kind: "label"; pattern: string }
  | { kind: "project"; pattern: string; withSubprojects: boolean }
  | { kind: "section"; pattern: string }
  | { kind: "search"; words: string[] };

export type FilterExpr =
  | { op: "and" | "or"; left: FilterExpr; right: FilterExpr }
  | { op: "not"; expr: FilterExpr }
  | { op: "term"; term: FilterTerm };

/** One comma-separated part: Todoist shows each as its own list, titled by its text. */
export interface FilterGroup { source: string; expr: FilterExpr }
export type ParsedFilter = { ok: true; groups: FilterGroup[] } | { ok: false; error: string };

// ---------------------------------------------------------------- tokenizer

type Token = { type: "op"; value: "&" | "|" | "!" | "(" | ")" | ","; at: number } | { type: "term"; value: string; at: number; end: number };

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let text = ""; let start = 0;
  const flush = (end: number) => { if (text.trim()) tokens.push({ type: "term", value: text.trim(), at: start, end }); text = ""; };
  for (let i = 0; i < query.length; i++) {
    const char = query[i]!;
    // `\` makes the next character part of a name (Todoist: #One \& Two).
    if (char === "\\" && i + 1 < query.length) { if (!text.trim()) start = i; text += query[++i]; continue; }
    // `!` is NOT only before a term; inside a name it is a character.
    if ("&|(),".includes(char) || (char === "!" && !text.trim())) {
      flush(i);
      tokens.push({ type: "op", value: char as "&", at: i });
      continue;
    }
    if (!text.trim()) start = i;
    text += char;
  }
  flush(query.length);
  return tokens;
}

// ---------------------------------------------------------------- dates

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const UNIT = "(min|mins|minute|minutes|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)";
const unitOf = (word: string): Unit => word.startsWith("min") ? "minute" : word.startsWith("h") ? "hour" : word.replace(/s$/, "") as Unit;
/** "jan", "sept", "january"; "sat", "thurs", "saturday": any prefix of three letters or more. */
const prefixOf = (names: string[], word: string) => word.length >= 3 ? names.findIndex(name => name.startsWith(word)) : -1;
const month = (word: string) => prefixOf(MONTHS, word);

/** A Todoist date phrase ("today", "Jan 3", "sat", "next week", "+4 hours", "1 week after next week", "today at 2pm"), or null. */
export function parseDateSpec(raw: string): DateSpec | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;
  if (text === "today" || text === "tod") return { kind: "day", offset: 0 };
  if (text === "tomorrow" || text === "tom") return { kind: "day", offset: 1 };
  if (text === "yesterday") return { kind: "day", offset: -1 };
  if (text === "next week") return { kind: "nextWeek" };
  if (text === "first day") return { kind: "firstDay" };
  let match = /^(.+?) at (\d{1,2})(?::(\d{2}))? ?(am|pm)?$/.exec(text);
  if (match) {
    const base = parseDateSpec(match[1]!);
    let hours = Number(match[2]); const minutes = Number(match[3] ?? 0);
    if (!base || hours > 23 || minutes > 59 || (match[4] && (hours < 1 || hours > 12))) return null;
    if (match[4] === "pm" && hours < 12) hours += 12;
    if (match[4] === "am" && hours === 12) hours = 0;
    return { kind: "at", base, minutes: hours * 60 + minutes };
  }
  match = new RegExp(`^([+-]) ?(\\d+) ?${UNIT}$`).exec(text);
  if (match) return { kind: "shift", n: Number(match[2]) * (match[1] === "-" ? -1 : 1), unit: unitOf(match[3]!), from: "now" };
  match = new RegExp(`^in (\\d+) ${UNIT}$`).exec(text);
  if (match) return { kind: "shift", n: Number(match[1]), unit: unitOf(match[2]!), from: "now" };
  match = new RegExp(`^(\\d+) ${UNIT} (after|before) (.+)$`).exec(text);
  if (match) {
    const from = parseDateSpec(match[4]!);
    return from && { kind: "shift", n: Number(match[1]) * (match[3] === "before" ? -1 : 1), unit: unitOf(match[2]!), from };
  }
  match = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(text);
  if (match && month(match[1]!) >= 0) return calendar(month(match[1]!), Number(match[2]), match[3]);
  match = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?:,? (\d{4}))?$/.exec(text);
  if (match && month(match[2]!) >= 0) return calendar(month(match[2]!), Number(match[1]), match[3]);
  // Numeric dates are month/day (Todoist follows the account's date format; todalo has none).
  match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(text);
  if (match) return calendar(Number(match[1]) - 1, Number(match[2]), match[3] && (match[3].length === 2 ? `20${match[3]}` : match[3]));
  match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return calendar(Number(match[2]) - 1, Number(match[3]), match[1]);
  const day = prefixOf(WEEKDAYS, text);
  if (day >= 0) return { kind: "weekday", day };
  return null;
}

function calendar(monthIndex: number, day: number, year?: string | null): DateSpec | null {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  return { kind: "calendar", month: monthIndex, day, year: year ? Number(year) : null };
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());

function shift(date: Date, n: number, unit: Unit) {
  switch (unit) {
    case "minute": return new Date(date.getTime() + n * 60_000);
    case "hour": return new Date(date.getTime() + n * 3_600_000);
    case "day": return addDays(date, n);
    case "week": return addDays(date, 7 * n);
    case "month": return new Date(date.getFullYear(), date.getMonth() + n, date.getDate(), date.getHours(), date.getMinutes());
    case "year": return new Date(date.getFullYear() + n, date.getMonth(), date.getDate(), date.getHours(), date.getMinutes());
  }
}

/** A resolved spec: a whole local day [start, end), or one instant (start === end). */
interface Resolved { start: Date; end: Date; instant: boolean }
const wholeDay = (date: Date): Resolved => { const start = startOfDay(date); return { start, end: addDays(start, 1), instant: false }; };

function resolve(spec: DateSpec | "now", now: Date): Resolved {
  if (spec === "now") return { start: now, end: now, instant: true };
  switch (spec.kind) {
    case "day": return wholeDay(addDays(now, spec.offset));
    case "weekday": return wholeDay(addDays(now, (spec.day - now.getDay() + 7) % 7));
    case "calendar": return wholeDay(new Date(spec.year ?? now.getFullYear(), spec.month, spec.day));
    case "nextWeek": return wholeDay(addDays(now, ((1 - now.getDay() + 7) % 7) || 7));
    case "firstDay": return wholeDay(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    case "at": { const at = new Date(resolve(spec.base, now).start.getTime() + spec.minutes * 60_000); return { start: at, end: at, instant: true }; }
    case "shift": {
      const from = resolve(spec.from, now);
      // Hours and minutes stay instants; days and longer from now become days.
      if (spec.unit === "hour" || spec.unit === "minute") { const at = shift(from.start, spec.n, spec.unit); return { start: at, end: at, instant: true }; }
      return wholeDay(shift(from.start, spec.n, spec.unit));
    }
  }
}

// ---------------------------------------------------------------- terms

/** Todoist operators that need data todalo does not have (one user, no shared projects, workspaces or uncompletable tasks). */
const UNSUPPORTED: [RegExp, string][] = [
  [/^assigned( (to|by) ?:.*)?$/, "Assignees aren't supported: todalo has no shared projects"],
  [/^added by ?:/, "“added by:” isn't supported: every task is yours"],
  [/^shared$/, "“shared” isn't supported: todalo has no shared projects"],
  [/^workspace ?:/, "Workspaces aren't supported"],
  [/^uncompletable$/, "“uncompletable” isn't supported: every todalo task can be completed"],
];

function parseTerm(raw: string): FilterTerm | string {
  const text = raw.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const name = (prefix: number) => text.slice(prefix).trim();
  if (lower.startsWith("##")) return name(2) ? { kind: "project", pattern: name(2), withSubprojects: true } : "Add a project name after ##.";
  if (lower.startsWith("#")) return name(1) ? { kind: "project", pattern: name(1), withSubprojects: false } : "Add a project name after #.";
  // Todoist writes labels as @name (and, since 2025, %name).
  if (lower.startsWith("@") || lower.startsWith("%")) return name(1) ? { kind: "label", pattern: name(1) } : "Add a label name after @.";
  if (lower.startsWith("/")) return name(1) ? { kind: "section", pattern: name(1) } : "Add a section name after /.";
  for (const [pattern, message] of UNSUPPORTED) if (pattern.test(lower)) return `${message} (“${text}”).`;
  if (lower === "all" || lower === "view all") return { kind: "all" };
  if (lower === "overdue" || lower === "over due" || lower === "od") return { kind: "overdue" };
  if (lower === "no date" || lower === "no due date") return { kind: "noDate" };
  if (lower === "no deadline") return { kind: "noDeadline" };
  if (lower === "no time") return { kind: "noTime" };
  if (lower === "recurring") return { kind: "recurring" };
  if (lower === "subtask" || lower === "subtasks") return { kind: "subtask" };
  if (lower === "no labels" || lower === "no label") return { kind: "noLabels" };
  if (lower === "no priority") return { kind: "priority", value: 4 };
  let match = /^p([1-4])$/.exec(lower);
  if (match) return { kind: "priority", value: Number(match[1]) };
  match = /^search ?:(.*)$/.exec(lower);
  if (match) { const words = match[1]!.trim().split(" ").filter(Boolean); return words.length ? { kind: "search", words } : "Add a word after search:."; }
  match = /^(?:next )?(\d+) days?$/.exec(lower);
  if (match) return { kind: "nextDays", days: Number(match[1]) };
  match = /^(date|due|deadline|created)( before| after)? ?:(.*)$/.exec(lower);
  if (match) {
    const spec = parseDateSpec(match[3]!);
    if (!spec) return `“${match[3]!.trim() || "(empty)"}” isn't a date todalo understands.`;
    return { kind: "date", field: match[1] as DateField, op: match[2] ? match[2].trim() as "before" | "after" : "on", spec };
  }
  // A bare date ("Jan 3", "saturday", "today at 2pm") means due on that day.
  const spec = parseDateSpec(lower);
  if (spec) return { kind: "date", field: "due", op: "on", spec };
  return `Unknown filter “${text}”.`;
}

// ---------------------------------------------------------------- parser

/**
 * Parses a query into its comma-separated lists. Precedence: `!` binds
 * tightest, then `&`, then `|`; parentheses group. Errors are user-facing.
 */
export function parseFilterQuery(query: string): ParsedFilter {
  if (!query.trim()) return { ok: false, error: "Enter a query." };
  if (query.length > FILTER_QUERY_MAX) return { ok: false, error: `Queries are at most ${FILTER_QUERY_MAX} characters.` };
  const tokens = tokenize(query);
  let pos = 0;
  const fail = (error: string): never => { throw new QueryError(error); };
  const peek = () => tokens[pos];
  const isOp = (value: string) => { const token = peek(); return token?.type === "op" && token.value === value; };

  function primary(): FilterExpr {
    const token = tokens[pos++];
    if (!token) return fail("The query ends early: add a filter after the last operator.");
    if (token.type === "term") {
      const term = parseTerm(token.value);
      return typeof term === "string" ? fail(term) : { op: "term", term };
    }
    if (token.value === "!") return { op: "not", expr: primary() };
    if (token.value === "(") {
      const expr = or();
      if (!isOp(")")) return fail(isOp(",") ? "Commas separate lists and can't be inside parentheses." : "Close the parenthesis with ).");
      pos++;
      return expr;
    }
    return fail(`Expected a filter before “${token.value}”.`);
  }
  function and(): FilterExpr {
    let left = primary();
    while (isOp("&")) { pos++; left = { op: "and", left, right: primary() }; }
    return left;
  }
  function or(): FilterExpr {
    let left = and();
    while (isOp("|")) { pos++; left = { op: "or", left, right: and() }; }
    return left;
  }

  try {
    const groups: FilterGroup[] = [];
    let from = 0;
    for (;;) {
      const expr = or();
      const next = peek();
      if (next && !(next.type === "op" && next.value === ",")) {
        fail(next.type === "op" && next.value === ")" ? "There is a ) without a matching (." : `Join “${next.type === "term" ? next.value : next.value}” with & or |.`);
      }
      const to = next?.at ?? query.length;
      groups.push({ source: query.slice(from, to).trim(), expr });
      if (!next) break;
      pos++; from = next.at + 1;
    }
    return { ok: true, groups };
  } catch (error) {
    if (error instanceof QueryError) return { ok: false, error: error.message };
    throw error;
  }
}

class QueryError extends Error {}

/** null when the query is valid, else the message to show. */
export const filterQueryError = (query: string) => { const parsed = parseFilterQuery(query); return parsed.ok ? null : parsed.error; };

// ---------------------------------------------------------------- evaluation

export interface FilterTask {
  title: string; description: string | null; status: string; priority: number;
  projectId: string | null; sectionId?: string | null; parentId: string | null;
  dueDate: DateLike; deadline: DateLike; createdAt?: DateLike; recurrence?: unknown; labelIds: string[];
}
type Named = { id: string; name: string };
export interface FilterContext { now: Date; labels: Named[]; projects: Named[]; sections: Named[] }

const patterns = new Map<string, RegExp>();
/** Case-insensitive whole-name match; `*` is a wildcard (Todoist: @home*, #*Work, /*). */
function nameMatches(pattern: string, name: string | undefined) {
  if (name === undefined) return false;
  let regex = patterns.get(pattern);
  if (!regex) {
    regex = new RegExp(`^${pattern.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
    patterns.set(pattern, regex);
  }
  return regex.test(name.trim());
}

const toDate = (value: DateLike) => value == null ? null : new Date(value);
const hasTime = (date: Date) => date.getHours() !== 0 || date.getMinutes() !== 0;

interface Prepared { now: Date; today: Date; labels: Map<string, string>; projects: Map<string, string>; sections: Map<string, string> }

function compare(date: Date | null, op: "on" | "before" | "after", spec: DateSpec, now: Date) {
  if (!date) return false;
  const target = resolve(spec, now);
  if (op === "before") return date < target.start;
  if (op === "after") return target.instant ? date > target.start : date >= target.end;
  const day = target.instant ? wholeDay(target.start) : target;
  return date >= day.start && date < day.end;
}

function matchTerm(term: FilterTerm, task: FilterTask, context: Prepared): boolean {
  const due = toDate(task.dueDate);
  switch (term.kind) {
    case "all": return true;
    case "overdue": {
      // Todoist's due: the date, else the deadline. A timed task is overdue once its time passes.
      const when = due ?? toDate(task.deadline);
      return when !== null && (hasTime(when) ? when < context.now : when < context.today);
    }
    case "noDate": return due === null;
    case "noDeadline": return task.deadline == null;
    case "noTime": return due !== null && !hasTime(due);
    case "recurring": return task.recurrence != null;
    case "subtask": return task.parentId !== null;
    case "noLabels": return task.labelIds.length === 0;
    case "priority": return task.priority === term.value;
    case "nextDays": { const when = due ?? toDate(task.deadline); return when !== null && when >= context.today && when < addDays(context.today, term.days); }
    case "date": {
      const date = term.field === "date" ? due : term.field === "deadline" ? toDate(task.deadline) : term.field === "created" ? toDate(task.createdAt) : due ?? toDate(task.deadline);
      return compare(date, term.op, term.spec, context.now);
    }
    case "label": return task.labelIds.some(id => nameMatches(term.pattern, context.labels.get(id)));
    // No sub-projects in todalo, so ## matches like #. #Inbox is the task without a project.
    case "project": return task.projectId === null ? nameMatches(term.pattern, "Inbox") : nameMatches(term.pattern, context.projects.get(task.projectId));
    case "section": return task.sectionId != null && nameMatches(term.pattern, context.sections.get(task.sectionId));
    case "search": {
      const text = `${task.title}\n${task.description ?? ""}`.toLowerCase();
      return term.words.every(word => text.includes(word));
    }
  }
}

function matchExpr(expr: FilterExpr, task: FilterTask, context: Prepared): boolean {
  switch (expr.op) {
    case "and": return matchExpr(expr.left, task, context) && matchExpr(expr.right, task, context);
    case "or": return matchExpr(expr.left, task, context) || matchExpr(expr.right, task, context);
    case "not": return !matchExpr(expr.expr, task, context);
    case "term": return matchTerm(expr.term, task, context);
  }
}

/**
 * Each list's open tasks (Todoist filters never show completed ones), in the
 * given order. Days are the evaluating process's local days.
 */
export function evaluateFilter<T extends FilterTask>(groups: FilterGroup[], tasks: readonly T[], context: FilterContext): { title: string; tasks: T[] }[] {
  const prepared: Prepared = {
    now: context.now, today: startOfDay(context.now),
    labels: new Map(context.labels.map(item => [item.id, item.name])),
    projects: new Map(context.projects.map(item => [item.id, item.name])),
    sections: new Map(context.sections.map(item => [item.id, item.name])),
  };
  const open = tasks.filter(task => task.status !== "done");
  return groups.map(group => ({ title: group.source, tasks: open.filter(task => matchExpr(group.expr, task, prepared)) }));
}

/** Parses then evaluates; an invalid query lists nothing. */
export function runFilterQuery<T extends FilterTask>(query: string, tasks: readonly T[], context: FilterContext) {
  const parsed = parseFilterQuery(query);
  return parsed.ok ? evaluateFilter(parsed.groups, tasks, context) : [];
}

/** A name written into a query: operator characters are escaped with `\`. */
export const queryName = (name: string) => name.trim().replace(/[\\&|!(),]/g, "\\$&");

/**
 * The query equivalent of a ticket-14 structured definition, for the editor.
 * Legacy rows keep evaluating with their own rules until re-saved; the only
 * difference after re-saving is that queries never list completed tasks.
 */
export function definitionToQuery(definition: { priority?: number | null; labelId?: string | null; projectId?: string | null; due?: string }, names: { labels: Named[]; projects: Named[] }) {
  const parts: string[] = [];
  if (definition.priority) parts.push(`p${definition.priority}`);
  if (definition.labelId) parts.push(`@${queryName(names.labels.find(label => label.id === definition.labelId)?.name ?? "Deleted label")}`);
  if (definition.projectId) parts.push(`#${queryName(names.projects.find(project => project.id === definition.projectId)?.name ?? "Deleted project")}`);
  if (definition.due === "today") parts.push("today");
  if (definition.due === "overdue") parts.push("overdue");
  if (definition.due === "undated") parts.push("no date");
  return parts.join(" & ") || "all";
}
