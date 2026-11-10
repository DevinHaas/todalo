// Filter Assist: the Coach's model turns a description into a filter query.
// Pure (prompt, schema, reply check); the route supplies the model. The reply
// is only offered when filter-query.ts accepts it.
import type { CoachMessage, CoachSchema } from "./coach";
import { filterQueryError, queryName } from "./filter-query";

export const FILTER_ASSIST_SYSTEM_PROMPT = `You write Todoist-style filter queries for the todalo task app. Reply with JSON {"query": "..."} only.
Syntax: & (and), | (or), ! (not), parentheses, and a comma to show separate lists.
Terms: today, tomorrow, yesterday, overdue, no date, no time, no deadline, recurring, subtask, no labels, all,
p1 (highest) p2 p3 p4 (no priority), "N days" (due in the next N days), weekday names, dates like "Jan 3",
date: X, date before: X, date after: X (also due:, deadline:, created: with before/after), where X is a date,
"next week", "first day", "+4 hours", "-30 days", "in 7 days", "1 week after next week" or "today at 2pm",
@label (wildcards: @home*), #Project (#Inbox for tasks without a project), /Section, search: words.
Escape &, |, !, (, ), and , inside names with a backslash. Never use assigned, added by, shared or workspace:
todalo has one user and no shared projects. Use only the labels, projects and sections listed.`;

export const filterAssistSchema: CoachSchema = {
  name: "filter_query",
  schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
};

export function filterAssistMessages(description: string, names: { labels: string[]; projects: string[]; sections: string[] }): CoachMessage[] {
  const list = (prefix: string, items: string[]) => items.length ? items.map(item => prefix + queryName(item)).join(", ") : "none";
  return [
    { role: "system", content: FILTER_ASSIST_SYSTEM_PROMPT },
    { role: "user", content: `Labels: ${list("@", names.labels)}\nProjects: ${list("#", names.projects)}\nSections: ${list("/", names.sections)}\n\nThe filter I want: ${description}` },
  ];
}

/** The model's query when the parser accepts it, else why it can't be used. */
export function parseFilterAssist(content: string): { query: string } | { query: null; message: string } {
  let query: unknown;
  try { query = (JSON.parse(content) as { query?: unknown }).query; } catch { /* below */ }
  if (typeof query !== "string" || !query.trim()) return { query: null, message: "The Coach didn't suggest a query. Try describing it differently." };
  const error = filterQueryError(query.trim());
  return error ? { query: null, message: `The Coach suggested “${query.trim()}”, which todalo can't use: ${error}` } : { query: query.trim() };
}
