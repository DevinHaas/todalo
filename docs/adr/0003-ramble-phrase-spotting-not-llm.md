# Ramble mode uses phrase-spotting, not an LLM, to interpret speech

Todoist's own Ramble feature (the direct reference for this feature) is LLM-powered: it interprets freeform corrections like "Actually, I meant…" and "Remove that," decides task-vs-edit-vs-delete from natural phrasing, and explicitly does not support sub-tasks.

We deliberately built a smaller thing instead: sub-task capture (which Ramble doesn't have), driven by fixed trigger phrases (`sub-task`, `remove last`, `that's all`, etc.) matched against each finalized STT segment, with no second AI call to interpret intent. This trades away natural, freeform correction phrasing (only the exact trigger phrases work) for a system with one fewer moving part — no LLM latency or cost per utterance, and deterministic behavior instead of an LLM's judgment call on what you meant. A future reader expecting this to work like "real" Ramble (arbitrary natural corrections) will be surprised that only specific phrases are recognized.
