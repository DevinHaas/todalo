import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { ATTACHMENT_LIMIT_HINT, type AttachmentDto, type CreatedFileTask, type SavedFile } from "./attachments";
import { AccountTransportError } from "./errors";
import { Failure, type ReadState } from "./views";

// Pure attachment views (legacy ProjectFilePaste / TaskAttachments): no runtime imports.

// Same targets the legacy paste skips: typing surfaces keep their own paste.
const isEditor = (target: EventTarget | null) => Boolean((target as Element | null)?.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"]'));

/** Paste (outside text fields), drop or choose files; each becomes a task in the project. */
export function ProjectFiles({ upload }: { upload: (files: File[]) => Promise<CreatedFileTask[]> }) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<File[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = useRef(false);
  const send = useCallback(async (files: File[]) => {
    // A cancelled picker or a clipboard without files changes nothing.
    if (!files.length) return;
    if (busy.current) { setError("Files are still saving. Please wait, then retry your paste."); return; }
    busy.current = true; setPending(true); setError(""); setStatus("");
    try {
      const tasks = await upload(files);
      setRetry(null);
      setStatus(`${tasks.length} file ${tasks.length === 1 ? "task" : "tasks"} created.`);
    } catch (reason) {
      // Only an interrupted or failed save is worth retrying; a rejected batch is not.
      const final = !(reason instanceof AccountTransportError) || ["INVALID_INPUT", "FILES_TOO_LARGE", "PROJECT_NOT_FOUND", "UNAUTHENTICATED"].includes(reason.code);
      setRetry(final ? null : files);
      setError(reason instanceof Error ? reason.message : "Files could not save. Please retry.");
    } finally { busy.current = false; setPending(false); }
  }, [upload]);

  useEffect(() => {
    const dialogOpen = () => Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]'));
    const paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isEditor(event.target) || dialogOpen()) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      void send(files);
    };
    const over = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files") || dialogOpen()) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    };
    const leave = (event: DragEvent) => { if (!event.relatedTarget) setDragging(false); };
    const drop = (event: DragEvent) => {
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!files.length || dialogOpen()) return;
      event.preventDefault();
      void send(files);
    };
    document.addEventListener("paste", paste);
    document.addEventListener("dragover", over);
    document.addEventListener("dragleave", leave);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("paste", paste);
      document.removeEventListener("dragover", over);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("drop", drop);
    };
  }, [send]);

  return <section className={dragging ? "project-files dragging" : "project-files"} aria-label="Files">
    <div className="project-files-row">
      {/* A label keeps the picker a direct user gesture in WKWebView. */}
      <label className="button outline" aria-disabled={pending || undefined}>
        <Paperclip />Add files
        <input className="file-input" type="file" multiple disabled={pending} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void send(files); }} />
      </label>
      <p className="hint">{dragging ? "Drop files to add them as tasks." : `Paste, drop or choose files to add them as tasks. ${ATTACHMENT_LIMIT_HINT}`}</p>
    </div>
    {pending && <p role="status" className="state">Saving files…</p>}
    {status && <p role="status" className="state">{status}</p>}
    {error && <p role="alert" className="form-error">{error}{retry && <> Check the project before retrying if the connection was interrupted. <button type="button" className="text-action" disabled={pending} onClick={() => void send(retry)}>Retry upload</button></>}</p>}
  </section>;
}

export type SaveState = { pending: boolean; saved: SavedFile | null; error: string | null };

/** Browser: plain download links (cookie session). Native: Rust saves the file. */
export function TaskAttachments({ state, onRetry, href, onSave, saving }: {
  state: ReadState<AttachmentDto[] | null>; onRetry: () => void; href?: (id: string) => string; onSave?: (attachment: AttachmentDto) => void; saving?: SaveState;
}) {
  let body;
  if (state.status === "pending") body = <p role="status" className="state">Loading attachments…</p>;
  else if (state.status === "error") body = <Failure error={state.error} onRetry={onRetry} />;
  else if (!state.data?.length) body = <p className="state">No attachments</p>;
  else body = <ul className="attachment-list">{state.data.map(attachment => {
    const label = <>{attachment.name} <span className="pill">({Math.max(1, Math.ceil(attachment.byteSize / 1024))} KB)</span></>;
    return <li key={attachment.id}>{href
      ? <a href={href(attachment.id)} download={attachment.name}>{label}</a>
      : <button type="button" className="text-action" disabled={saving?.pending} onClick={() => onSave?.(attachment)}>{label}</button>}</li>;
  })}</ul>;
  return <section aria-label="Attachments" className="attachments">
    <h2 className="section-heading">Attachments</h2>
    {body}
    {saving?.pending && <p role="status" className="state">Downloading…</p>}
    {saving?.saved && <p role="status" className="state">Saved {saving.saved.name} to {saving.saved.location}.</p>}
    {saving?.error && <p role="alert" className="form-error">{saving.error}</p>}
  </section>;
}
