# Filter queries

Saved filters use Todoist's query language
([Introduction to filters](https://www.todoist.com/help/articles/introduction-to-filters-V98wIH)),
parsed and evaluated by `packages/server/src/filter-query.ts` (tests:
`filter-query.test.ts`). Filters list open tasks only, as Todoist's do. Days
are the evaluating process's local days (the API server for a filter page, the
viewer's device for the dialog preview).

## Supported

| Kind | Syntax |
| --- | --- |
| Operators | `&` and, `\|` or, `!` not, `( )`, `,` separate lists (each shown under its own heading). Precedence `!` > `&` > `\|`. `\` escapes a character in a name (`#One \& Two`). |
| Dates (due: the date, else the deadline) | `today`/`tod`, `tomorrow`/`tom`, `yesterday`, `overdue`/`over due`/`od`, `no date`, `no time`, `recurring`, `N days`/`next N days`, bare dates (`Jan 3`, `3 Jan 2027`, `5/5`, `2026-12-03`, `saturday`/`sat`, `today at 2pm`) |
| Field dates | `date:`, `due:`, `deadline:`, `created:`, each also with ` before:` / ` after:`; values as above plus `next week` (next Monday), `first day` (of next month), `+4 hours`, `-365 days`, `in 7 days`, `1 week after next week` |
| Deadlines | `no deadline`, `deadline before: in 7 days` |
| Priority | `p1`–`p4`, `no priority` (= `p4`) |
| Labels | `@name` or `%name`, `no labels`, wildcards `@home*` |
| Projects | `#Work`, `#*work`, `#Inbox` (tasks without a project). `##Work` matches like `#Work`: todalo has no sub-projects. |
| Sections | `/Meetings`, `/*` (any section), `!/*` |
| Other | `search: words` (title and description, all words), `subtask`, `!subtask`, `all`/`view all` |

Names are case-insensitive. A name that matches nothing (a deleted label, say)
is not an error; it matches no task.

## Unsupported (rejected with a message)

Todalo has one user, no shared projects, workspaces or uncompletable tasks, so
these parse but are refused rather than guessed: `assigned`, `assigned to:`,
`assigned by:`, `added by:`, `shared`, `workspace:`, `uncompletable`.
Numeric dates are always month/day (Todoist follows the account's date format);
`next week` is always Monday (Todoist's is a setting); a date without a year is
in the current year.
