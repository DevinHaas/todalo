import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ArrowUp, Hash, Inbox, LoaderCircle, Mic, MicOff, Repeat2, X } from "lucide-react";
import type { RambleTodo } from "@todalo/ramble";
import { startRambleCapture } from "@todalo/ramble/audio";
import { AccountTransportError, nativeAccountError } from "./errors";
import { commitStaged, createRambleRecorder, detailsAsTodo, PERMISSION_DENIED, todoAsTask, type RambleRecorderDependencies, type RambleView } from "./ramble";
import { projectReads, queries, session } from "./runtime";
import { dueLabel, operationId } from "./tasks";
import { Composer, SmartDates } from "./composer";
import { playCue } from "./sounds";

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
const WAVE_BARS = 24;
const WAVE_TICK_MS = 50;
const deadlineLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** A scrolling loudness history (legacy RambleWave): newest on the right, so silence reads as silence. */
function RambleWave({ analyser }: { analyser: AnalyserNode | null }) {
  const barsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bars = Array.from(barsRef.current?.children ?? []) as HTMLElement[];
    if (!analyser) { bars.forEach((bar) => { bar.style.transform = ""; }); return; }
    const samples = new Float32Array(analyser.fftSize);
    const history: number[] = Array(WAVE_BARS).fill(0);
    let frame = 0;
    let last = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < WAVE_TICK_MS) return;
      last = now;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      // Map -55 dBFS (room noise) .. -15 dBFS (loud speech) to 0..1.
      const db = 10 * Math.log10(sum / samples.length || 1e-10);
      history.shift();
      history.push(Math.max(0, Math.min(1, (db + 55) / 40)));
      bars.forEach((bar, index) => { bar.style.transform = `scaleY(${0.15 + history[index] * 0.85})`; });
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analyser]);
  return <div ref={barsRef} className="ramble-wave" data-active={!!analyser} aria-hidden="true">
    {Array.from({ length: WAVE_BARS }, (_, index) => <span key={index} />)}
  </div>;
}

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
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  // The staged card being edited by hand, with its draft text.
  const [editing, setEditing] = useState<string | null>(null);
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

  // Labels are empty until permission is granted, so list again once listening.
  const listening = view?.status === "listening";
  useEffect(() => {
    let disposed = false;
    const media = navigator.mediaDevices;
    const enumerate = () => media?.enumerateDevices()
      .then((devices) => { if (!disposed) setMicrophones(devices.filter((device) => device.kind === "audioinput" && device.deviceId)); })
      .catch(() => {});
    void enumerate();
    media?.addEventListener("devicechange", enumerate);
    return () => { disposed = true; media?.removeEventListener("devicechange", enumerate); };
  }, [listening]);

  // Sound cues: the microphone is ready, a task was added, the tasks were saved.
  const phase = view?.status;
  const staged = view?.state?.todos.length ?? 0;
  const seen = useRef({ phase, staged });
  useEffect(() => {
    const before = seen.current;
    if (phase === "listening" && before.phase !== "listening" && before.phase !== "paused") playCue("ramble-ready");
    else if (phase === "committed" && before.phase !== "committed") playCue("ramble-saved");
    else if (staged > before.staged) playCue("ramble-added");
    seen.current = { phase, staged };
  }, [phase, staged]);

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
  const microphone = microphones.find((device) => device.deviceId === view.deviceId)?.label || "Default microphone";

  function card(todo: RambleTodo, nested = false) {
    const project = projects.find((item) => item.id === todo.projectId);
    const due = todo.dueDate ? new Date(`${todo.dueDate}T${todo.startTime ?? "00:00"}:00`) : null;
    // A local guess the model has not confirmed yet: dimmed and not removable.
    const provisional = view!.provisionalIds.includes(todo.id);
    const editable = !busy && view!.connected && !provisional;
    // The quick add card, as ⌘E edits a task; ✓ sends the whole card back to the session.
    if (editing === todo.id) return <li key={todo.id} className={`ramble-card-edit${nested ? " nested" : ""}`}>
      <div className="dialog quick-add inline-quick-add" aria-label={`Edit ${todo.title}`}>
        <Composer startOpen quick editing={todoAsTask(todo)} dueDate={() => todoAsTask(todo).dueDate} projectId={todo.projectId}
          onCancel={() => setEditing(null)} onUpdate={async (details, projectId) => { recorder.edit(detailsAsTodo(todo, details, projectId)); }} />
      </div>
    </li>;
    return <li key={todo.id} aria-busy={provisional} className={`ramble-card${nested ? " nested" : ""}${provisional ? " provisional" : ""}`}>
      <div className="ramble-card-title">
        <button type="button" className="ramble-card-text" disabled={!editable} aria-label={`Edit ${todo.title}`}
          onClick={() => setEditing(todo.id)}>
          <p>{todo.title}</p>
          {todo.description && <p className="ramble-card-description">{todo.description}</p>}
        </button>
        <button type="button" className="icon-button" disabled={busy || !view!.connected || provisional} aria-label={`Remove ${todo.title}`} onClick={() => recorder.remove(todo.id)}><X /></button>
      </div>
      <div className="task-meta">
        {due && <span className="pill">{dueLabel(due.toISOString())}</span>}
        {todo.endTime && <span className="pill">until {todo.endTime}</span>}
        {todo.recurrence && <span className="pill repeat"><Repeat2 />Every {todo.recurrence.n > 1 ? `${todo.recurrence.n} ${todo.recurrence.unit}s` : todo.recurrence.unit}</span>}
        {todo.priority < 4 && <span className="pill priority" aria-label={`Priority ${todo.priority}`}>P{todo.priority}</span>}
        {todo.deadline && <span className="pill">Deadline {deadlineLabel(todo.deadline)}</span>}
        {todo.labelIds.length > 0 && <span className="pill">{todo.labelIds.length} label{todo.labelIds.length > 1 ? "s" : ""}</span>}
        <span className="pill project">{project ? <Hash /> : <Inbox />}{project?.name ?? "Inbox"}</span>
      </div>
    </li>;
  }

  return <section className="ramble-capture" aria-labelledby="ramble-title" aria-describedby="ramble-help">
    <header>
      <h1 id="ramble-title">Ramble</h1>
      <div className="ramble-controls">
        <RambleWave analyser={active ? view.analyser : null} />
        <button type="button" className="icon-button" aria-label={active ? "Pause listening" : "Resume listening"} title={`${status} · ${microphone}`}
          disabled={!view.connected || busy || view.understandingFailed || view.status === "starting"} onClick={() => recorder.toggle()}>
          {view.status === "connecting" || view.status === "starting" ? <LoaderCircle className="spin" /> : active ? <Mic /> : <MicOff />}
        </button>
        <select aria-label="Choose microphone" title={microphone} value={view.deviceId}
          disabled={busy || view.understandingFailed || view.status === "starting"} onChange={(event) => recorder.selectMicrophone(event.target.value)}>
          <option value="">Default microphone</option>
          {microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
        </select>
      </div>
    </header>
    <p id="ramble-help" className="sr-only">Speak your tasks. Say “sub-task” to nest tasks, “top level” to return, “undo” to go back, or “done” to add everything. Leaving discards unsaved tasks.</p>
    <span role="status" aria-live="polite" className="sr-only">{status}</span>
    {view.error && <div className="ramble-error">
      <p role="alert">{view.error}</p>
      {view.error === PERMISSION_DENIED && isTauri() && <button type="button" className="button outline" onClick={() => void invoke("open_microphone_settings")}>Open System Settings</button>}
      {view.understandingFailed && view.connected
        ? <button type="button" className="button outline" disabled={view.pending > 0} onClick={() => recorder.retryUnderstanding()}>Retry understanding</button>
        : !view.connected && !busy && <button type="button" className="button outline" onClick={() => recorder.open()}>Start a new session</button>}
    </div>}
    {view.state?.mode === "sub-task" && <p className="ramble-mode">Capturing sub-tasks</p>}
    <div className="ramble-staged" aria-label="Staged tasks">
      {todos.length
        ? <ul>{todos.filter((todo) => !todo.parentId).flatMap((todo) => [card(todo), ...todos.filter((child) => child.parentId === todo.id).map((child) => card(child, true))])}</ul>
        : view.status === "connecting" || view.status === "starting"
          ? <div role="status" className="ramble-empty ramble-loading">
            <LoaderCircle className="spin" aria-hidden="true" />
            <p>{status}</p>
            {view.status === "starting" && <p>Allow microphone access if your browser asks.</p>}
          </div>
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
