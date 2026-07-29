# 01 — Unified recurrence shape

**What to build:** Replace the `Recurrence` discriminated union (`daily`/`weekly`/`monthly`/`every_n_days`) with the single general shape `{ n: number, unit: "day" | "week" | "month" | "year", basedOn: "scheduled" | "completed", until?: Date | null }` in `lib/recurrence.ts`, its zod schema, and `getNextDueDate`. This is a prefactor — no user-visible behavior yet, but every later recurrence ticket depends on this shape existing.

See ADR `0001-unified-recurrence-shape`. No existing recurring-task data needs migrating.

**Blocked by:** None — can start immediately.

- [x] `Recurrence` type and zod schema use the unified `{n, unit, basedOn, until}` shape
- [x] `getNextDueDate` computes the next date from `n`/`unit` for the unified shape
- [x] Existing callers (`app/(app)/tasks/actions.ts`) compile against the new shape (old literal values like `daily` map to `{n: 1, unit: "day"}` at call sites, adjusted as needed)
- [x] `basedOn` and `until` fields exist on the type but are not yet enforced anywhere (enforcement is ticket 07)
