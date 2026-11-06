# 18: ChatGPT sign-in for the Coach

**What to build:** A user signs in with their ChatGPT account and the Coach runs on that subscription (ADR 0007). API keys and Ollama remain as fallbacks.

**Blocked by:** 17

**Status:** ready-for-agent

- [ ] ChatGPT OAuth sign-in from AI provider settings on web, Mac and iPhone
- [ ] Tokens stored securely (Keychain on native)
- [ ] Sign-out and expiry handled; the Coach falls back to another configured provider
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
