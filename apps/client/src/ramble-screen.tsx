import { useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { startRambleCapture } from "@todalo/ramble/audio";
import { nativeAccountError } from "./errors";
import { createRambleRecorder, type RambleRecorderDependencies, type RambleView } from "./ramble";

const pad = (value: number) => String(value).padStart(2, "0");
const localDateTime = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const platform: RambleRecorderDependencies = {
  socketUrl: async () => {
    // Browser: same-origin socket, HttpOnly cookie + exact Origin check.
    if (!isTauri()) return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ramble/ws`;
    // Native: Rust mints a 30-second one-use ticket with the Keychain bearer;
    // the bearer itself never reaches JavaScript.
    try { return (await invoke<{ url: string }>("ramble_socket")).url; }
    catch (error) { throw nativeAccountError(error); }
  },
  openSocket: (url) => new WebSocket(url),
  capture: (options) => startRambleCapture(options),
  startOptions: () => ({
    referenceDate: localDateTime(new Date()),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    projectId: null, defaultDueDate: null,
  }),
};

const STATUS = { idle: "Microphone off", starting: "Starting microphone…", listening: "Listening", error: "Recording stopped" } as const;

export function RambleScreen() {
  const [view, setView] = useState<RambleView>({ status: "idle", finals: [], partial: "", error: null });
  const recorder = useMemo(() => createRambleRecorder(platform, setView), []);
  useEffect(() => {
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

  const active = view.status === "starting" || view.status === "listening";
  return <section className="ramble-capture" aria-labelledby="ramble-title">
    <header><h1 id="ramble-title">Ramble</h1><p>Speak a few tasks. Transcription appears below; saving tasks comes later.</p></header>
    <p className="ramble-status" role="status" aria-live="polite" data-status={view.status}>{STATUS[view.status]}</p>
    {view.error && <p className="error" role="alert">{view.error}</p>}
    <div className="ramble-actions">
      {active
        ? <button type="button" onClick={() => recorder.stop()}>Stop</button>
        : <button type="button" onClick={() => void recorder.start()}>{view.status === "error" ? "Try again" : view.finals.length ? "Record again" : "Start recording"}</button>}
    </div>
    <ol className="ramble-transcript" aria-label="Transcription">
      {view.finals.map((text, index) => <li key={index}>{text}</li>)}
      {view.partial && <li className="partial">{view.partial}</li>}
    </ol>
  </section>;
}
