# 17: Coach basics

**What to build:** A user connects an AI provider with an API key or a local Ollama model; the Coach then explains each goal's status in plain words. Without a provider every other feature still works.

**Blocked by:** 15

**Status:** resolved

- [x] AI provider settings: API key for supported providers, Ollama endpoint
- [x] Provider-agnostic inference interface reusing Ramble's provider approach
- [x] Coach explanation shown on each goal's status
- [x] Tests use a fake provider with canned output
- [x] No provider: Coach UI hidden or prompts to connect, nothing else breaks
- [x] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [x] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
