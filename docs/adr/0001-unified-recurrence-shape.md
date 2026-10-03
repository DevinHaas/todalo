# Unified recurrence shape instead of per-type variants

`Recurrence` was a discriminated union with one literal variant per type (`daily`, `weekly`, `monthly`, `every_n_days`). Adding Custom Repeat (arbitrary `n` of `day`/`week`/`month`/`year`, an anchor date of scheduled-vs-completed, and an optional end date) would have meant a growing set of variants, each hand-written.

We replaced it with one general shape: `{ n: number, unit: "day" | "week" | "month" | "year", basedOn: "scheduled" | "completed", until?: Date | null }`. The old variants are just specific values of this shape (`daily` = `{n: 1, unit: "day"}`). This is a breaking change to the stored `jsonb` column shape — no migration was needed since no recurring-task data existed yet, but it means the old literal shapes are no longer valid and any future variant (e.g. a day-of-week filter like "every weekday") still won't fit without another change.
