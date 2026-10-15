import { useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ArrowUp, Hash, Inbox, LoaderCircle, Mic, MicOff, Repeat2, X } from "lucide-react";
import type { RambleTodo } from "@todalo/ramble";
import { startRambleCapture } from "@todalo/ramble/audio";
import { AccountTransportError, nativeAccountError } from "./errors";
import { commitStaged, createRambleRecorder, type RambleRecorderDependencies, type RambleView } from "./ramble";
import { projectReads, queries, session } from "./runtime";
import { dueLabel, operationId } from "./tasks";
import { SmartDates } from "./composer";

const pad = (value: number) => String(value).padStart(2, "0");
const localDateTime = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
// A revoked session signs the UI out, as runtime.ts does for queries.
const signedOut = (error: unknown) => { if (error instanceof AccountTransportError && error.code === "UNAUTHENTICATED") void session.refresh(); throw error; };

function platform(options: { defaultDueDate: string | null; smartRecognition: boolean }): RambleRecorderDependencies {
  return {
    socketUrl: async () => {
      // Browser: same-origin socket, HttpOnly cookie + exact Origin check.
      if (!isTauri()) return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ramble/ws`;
      // Native: Rust mints a 30-second one-use ticket with the Keychain bearer;
      // the bearer itself never reaches JavaScript.
      try { return (await invoke<{ url: string }>("ramble_socket")).url; }
      catch (error) { return signedOut(nativeAccountError(error)); }
    },
    openSocket: (url) => new WebSocket(url),
    capture: (capture) => startRambleCapture(capture),
    // As the legacy modal: the server applies the account's smart-date setting.
    startOptions: () => ({
      smartRecognition: options.smartRecognition,
      referenceDate: localDateTime(new Date()),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      projectId: null, defaultDueDate: options.defaultDueDate,
    }),
    commit: (input) => commitStaged(input).catch(signedOut),
    operationId: () => operationId(),
  };
}

const STATUS = {
  connecting: "Connecting…", starting: "Starting microphone…", listening: "Listening", paused: "Microphone paused",
  error: "Capture paused", committing: "Adding tasks…", committed: "Tasks added",
} as const;
const BARS = [820, 960, 740, 1080, 880, 760, 1020, 900, 780];

/** Legacy Ramble modal (apps/web ramble-modal.tsx) as a screen. Leaving it discards unsaved tasks. */
export function RambleScreen() {
  const userId = useSyncExternalStore(session.subscribe, session.getSnapshot).account?.user.id ?? "";
  const smartRecognition = useContext(SmartDates);
  const [params] = useSearchParams();
  const date = params.get("date");
  const defaultDueDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const navigate = useNavigate();
  const { key } = useLocation();
  const close = () => { if (key !== "default") void navigate(-1); else void navigate("/today"); };
  const projects = useQuery({ ...projectReads.list(userId), enabled: Boolean(userId) }).data ?? [];
  const [view, setView] = useState<RambleView | null>(null);
  // ponytail: options are read once per screen visit; the setting changes elsewhere.
  const recorder = useMemo(() => createRambleRecorder(platform({ defaultDueDate, smartRecognition }), setView), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    recorder.open();
    // No background recording: stop as soon as the app is hidden or suspended.
    const hidden = () => { if (document.visibilityState === "hidden") recorder.interrupt(); };
    const leave = () => recorder.interrupt();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leave);
      recorder.dispose();
    };
  }, [recorder]);

  const committed = view?.status === "committed";
  useEffect(() => {
    if (!committed) return;
    // A batch can land in any view: refetch everything the user can see.
    void queries.invalidateQueries({ queryKey: ["user", userId] });
    close();
  }, [committed]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = view?.status === "committing" || committed;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { recorder.dispose(); close(); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view) return null;
  const todos = view.state?.todos ?? [];
  const active = view.status === "listening";
  const status = busy ? STATUS[view.status] : view.pending > 0 ? "Understanding tasks…" : STATUS[view.status];
  const count = `${todos.length} ${todos.length === 1 ? "task" : "tasks"}`;

  function card(todo: RambleTodo, nested = false) {
    const project = projects.find((item) => item.id === todo.projectId);
    const due = todo.dueDate ? new Date(`${todo.dueDate}T${todo.startTime ?? "00:00"}:00`) : null;
    return <li key={todo.id} className={nested ? "ramble-card nested" : "ramble-card"}>
      <div className="ramble-card-title">
        <p>{todo.title}</p>
        <button type="button" className="icon-button" disabled={busy || !view!.connected} aria-label={`Remove ${todo.title}`} onClick={() => recorder.remove(todo.id)}><X /></button>
      </div>
      <div className="task-meta">
        {due && <span className="pill">{dueLabel(due.toISOString())}</span>}
        {todo.endTime && <span className="pill">until {todo.endTime}</span>}
        {todo.recurrence && <span className="pill repeat"><Repeat2 />Every {todo.recurrence.n > 1 ? `${todo.recurrence.n} ${todo.recurrence.unit}s` : todo.recurrence.unit}</span>}
        <span className="pill project">{project ? <Hash /> : <Inbox />}{project?.name ?? "Inbox"}</span>
      </div>
    </li>;
  }

  return <section className="ramble-capture" aria-labelledby="ramble-title" aria-describedby="ramble-help">
    <header>
      <h1 id="ramble-title">Ramble</h1>
      <div className="ramble-controls">
        <div className="ramble-wave" data-active={active} aria-hidden="true">
          {BARS.map((duration, index) => <span key={index} style={{ animationDuration: `${duration}ms`, animationDelay: `${index * -130}ms` }} />)}
        </div>
        <button type="button" className="icon-button" aria-label={active ? "Pause listening" : "Resume listening"} title={status}
          disabled={!view.connected || busy || view.understandingFailed || view.status === "starting"} onClick={() => recorder.toggle()}>
          {view.status === "connecting" || view.status === "starting" ? <LoaderCircle className="spin" /> : active ? <Mic /> : <MicOff />}
        </button>
      </div>
    </header>
    <p id="ramble-help" className="sr-only">Speak your tasks. Say “sub-task” to nest tasks, “top level” to return, “undo” to go back, or “done” to add everything. Leaving discards unsaved tasks.</p>
    <span role="status" aria-live="polite" className="sr-only">{status}</span>
    {view.error && <div className="ramble-error">
      <p role="alert">{view.error}</p>
      {view.understandingFailed && view.connected
        ? <button type="button" className="button outline" disabled={view.pending > 0} onClick={() => recorder.retryUnderstanding()}>Retry understanding</button>
        : !view.connected && !busy && <button type="button" className="button outline" onClick={() => recorder.open()}>Start a new session</button>}
    </div>}
    {view.state?.mode === "sub-task" && <p className="ramble-mode">Capturing sub-tasks</p>}
    <div className="ramble-staged" aria-label="Staged tasks">
      {todos.length
        ? <ul>{todos.filter((todo) => !todo.parentId).flatMap((todo) => [card(todo), ...todos.filter((child) => child.parentId === todo.id).map((child) => card(child, true))])}</ul>
        : <div className="ramble-empty"><p>Try saying</p><p>“Buy groceries tomorrow at 17:00”</p></div>}
    </div>
    <footer className="ramble-footer">
      <p>{status}{todos.length > 0 && ` · ${count}`}</p>
      <div>
        <button type="button" className="icon-button" aria-label="Discard and close Ramble" title="Discard and close" disabled={busy} onClick={() => { recorder.dispose(); close(); }}><X /></button>
        <button type="button" className="icon-button ramble-add" aria-label={`Add ${count}`} title="Add tasks" disabled={busy || !todos.length} onClick={() => recorder.commit()}>
          {busy ? <LoaderCircle className="spin" /> : <ArrowUp />}
        </button>
      </div>
    </footer>
  </section>;
}
