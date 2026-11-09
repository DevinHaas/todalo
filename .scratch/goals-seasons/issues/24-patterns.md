# 24: Patterns

**What to build:** The Coach records patterns it learns about the user (e.g. 'ships best in the mornings'). The user sees them in settings and can edit or delete any; the Coach only uses stored patterns.

**Blocked by:** 17

**Status:** resolved

- [x] Patterns stored with their supporting evidence
- [x] Settings list to view, edit and delete patterns
- [x] Coach prompts include only stored patterns
- [x] Learned from goal-linked tasks (completed, scheduled, time spent) and ratings
- [x] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [x] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.

## Decisions (built)

- **When patterns are learned:** one explicit model call, after the user finishes a Weekly review (client fires it when a provider is connected) and on Settings › Coach › Patterns › Learn now (`Alt+Shift+e`). No background learning.
- **From what:** this season's goal-linked tasks (when done, scheduled minutes kept by part of day, moves from `task_moves`) and progress ratings. Energy ratings join when ticket 26 lands.
- **Evidence and source:** each pattern stores the model's evidence sentence and a server-written source ("Season from 4 Oct, weeks 1–6: …"), plus "edited by you" once edited.
- **Coach only uses stored patterns:** `withPatterns` (packages/server/src/coach-patterns.ts) is the single place they enter prompts: explanations, recommendations, day/week/recommendation drafts and chat. Explanation/recommendation caches re-ask when patterns change.
- Limits: at most 3 new per learn, 20 kept; known patterns are sent so they are not repeated. A deleted pattern can be re-learned later (nothing hidden is kept to prevent it).
- Without a provider: Learn now is hidden; existing patterns stay visible, editable and deletable; with neither, the section is hidden.
