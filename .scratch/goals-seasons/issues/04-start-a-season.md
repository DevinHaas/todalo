# 04: Start a season

**What to build:** A user starts a season (12 weeks, 4 weeks or custom days), adds goals to it as primary or secondary with a target in words, and sees the season's day count. There is one current season at a time.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Create a season with start date and length (12 weeks, 4 weeks, custom days)
- [ ] Only one current season at a time
- [ ] Add goals to the season with tier (primary/secondary) and target text
- [ ] Move a goal's target mid-season
- [ ] Warn when more than three primary goals are set
- [ ] Season page shows 'Day X of Y' and days left
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
