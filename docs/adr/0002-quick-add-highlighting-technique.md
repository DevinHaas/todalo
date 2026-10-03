# Backdrop-overlay input instead of contenteditable for quick-add highlighting

Smart quick-add needs to highlight recognized date/time/recurrence phrases inline, inside the text, while the user is still typing. The obvious way to do that is a `contenteditable` element with injected `<span>` highlights — but re-rendering spans into a `contenteditable` on every keystroke is a known source of cursor-jump bugs (the caret resets to the start on re-render), and it opts out of the browser's native input handling.

Instead, the task title field is a transparent `<input>`/`<textarea>` (native caret, selection, and IME input, unmodified) stacked exactly on top of a styled backdrop `<div>` that mirrors the same text with highlighted spans, kept in sync on every keystroke. This trades away rich-text-editor generality (which isn't needed — it's a single-line title, not a document) for a caret and IME that just work.
