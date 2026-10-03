"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowUp, ChevronDown, LoaderCircle, Mic, MicOff, Repeat2, X } from "lucide-react";
import type { RambleSessionState, RambleTodo } from "@todalo/ramble";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DatePill, ProjectPill } from "@/components/tasks/task-pills";
import { useSmartDateRecognition } from "@/components/settings/smart-date-recognition";
import { rambleSocketUrl, startRambleCapture, type RambleCapture } from "@/lib/ramble-audio";
import { createRambleAudioQueue } from "@/lib/ramble-audio-queue";
import type { RambleDefaults, RambleProject } from "@/components/ramble/ramble-provider";
import waveStyles from "./ramble-wave.module.css";

type Phase = "connecting" | "idle" | "starting" | "listening" | "paused" | "error" | "committing";

export function RambleModal({ defaults, projects, onClose }: {
  defaults: RambleDefaults;
  projects: RambleProject[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { enabled } = useSmartDateRecognition();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [state, setState] = useState<RambleSessionState | null>(null);
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [connected, setConnected] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [pendingUnderstanding, setPendingUnderstanding] = useState(0);
  const [understandingFailed, setUnderstandingFailed] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<RambleCapture | null>(null);
  const waitingAudio = useRef(createRambleAudioQueue());
  const abortRef = useRef<AbortController | null>(null);
  const providerReady = useRef(false);
  const providerStarted = useRef(false);
  const committing = useRef(false);
  const callbacks = useRef({ onClose, router });
  // Current callbacks are read only by external socket events.
  useEffect(() => { callbacks.current = { onClose, router }; }, [onClose, router]);
  const startOnConnect = useEffectEvent(() => { startProvider(); });
  const prepareCapture = useEffectEvent(() => { void startCapture(); });
  const speechBecameReady = useEffectEvent(() => {
    providerReady.current = true;
    waitingAudio.current.flush(sendAudio);
    if (captureRef.current) setPhase("listening");
  });

  function stopCapture() {
    abortRef.current?.abort();
    abortRef.current = null;
    captureRef.current?.stop();
    captureRef.current = null;
    waitingAudio.current.clear();
  }

  useEffect(() => {
    let disposed = false;
    const audioQueue = waitingAudio.current;
    let socket: WebSocket;
    try {
      socket = new WebSocket(rambleSocketUrl(window.location, process.env.NEXT_PUBLIC_RAMBLE_WS_URL));
    } catch (cause) {
      queueMicrotask(() => { if (!disposed) { setError(cause instanceof Error ? cause.message : "Could not connect to Ramble."); setPhase("error"); } });
      return () => { disposed = true; };
    }
    socketRef.current = socket;
    const heartbeat = window.setInterval(() => {
      if (!disposed && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
    }, 30000);
    const timeout = window.setTimeout(() => {
      if (!disposed && socket.readyState === WebSocket.CONNECTING) {
        setError("Ramble could not connect. Check your connection and try again.");
        setPhase("error");
        socket.close();
      }
    }, 12000);
    socket.onopen = () => {
      if (disposed) return;
      clearTimeout(timeout);
      setConnected(true);
      startOnConnect();
    };
    socket.onmessage = (event) => {
      if (disposed || typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === "state") {
          setState(message.state);
          if (message.state.readyToCommit) {
            committing.current = true;
            stopCapture();
            setPhase("committing");
          }
        } else if (message.type === "ready") {
          speechBecameReady();
        } else if (message.type === "processing") {
          setPendingUnderstanding(typeof message.pending === "number" ? message.pending : 0);
        } else if (message.type === "understanding_recovered") {
          setUnderstandingFailed(false);
          setError("");
          setPhase("paused");
        } else if (message.type === "committed") {
          committing.current = false;
          stopCapture();
          callbacks.current.router.refresh();
          callbacks.current.onClose();
        } else if (message.type === "error") {
          committing.current = false;
          setUnderstandingFailed(message.code === "understanding_failed");
          if (message.code === "speech_unavailable" || message.code === "save_failed" || message.code?.startsWith("understanding_")) {
            providerReady.current = false;
            providerStarted.current = false;
          }
          stopCapture();
          setError(message.message || "Ramble could not continue. Try again.");
          setPhase("error");
        }
      } catch {
        stopCapture();
        setError("Ramble received an unexpected response. Please reconnect.");
        setPhase("error");
      }
    };
    socket.onerror = () => {
      if (disposed) return;
      setError("Could not connect to Ramble. Check your connection and try again.");
    };
    socket.onclose = () => {
      if (disposed) return;
      stopCapture();
      setConnected(false);
      setPhase("error");
      setError(committing.current
        ? "Connection lost while adding tasks. Check your task list before starting again."
        : "Connection lost. Unsaved tasks remain here for review, but this session cannot be saved. Start a new session to continue.");
    };
    // Permission/device startup and the authenticated socket can run together.
    // The speech provider only starts once the microphone actually exists.
    prepareCapture();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      clearInterval(heartbeat);
      abortRef.current?.abort();
      captureRef.current?.stop();
      audioQueue.clear();
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [connectionAttempt]);

  useEffect(() => {
    let disposed = false;
    const media = navigator.mediaDevices;
    const enumerate = async () => {
      try {
        const available = await media?.enumerateDevices();
        if (!disposed) setDevices((available ?? []).filter((device) => device.kind === "audioinput"));
      } catch { /* Opening Ramble requests permission through audio capture. */ }
    };
    void enumerate();
    media?.addEventListener("devicechange", enumerate);
    return () => { disposed = true; media?.removeEventListener("devicechange", enumerate); };
  }, []);

  function send(message: object) {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function startProvider() {
    if (!captureRef.current || providerStarted.current || committing.current) return;
    providerStarted.current = send({ type: "start", options: {
      smartRecognition: enabled,
      defaultDueDate: defaults.defaultDueDate ?? null,
      projectId: defaults.projectId ?? null,
      referenceDate: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    } });
  }

  function sendAudio(buffer: ArrayBuffer) {
    const socket = socketRef.current;
    if (!abortRef.current || committing.current) return;
    if (!providerReady.current || socket?.readyState !== WebSocket.OPEN) {
      if (waitingAudio.current.push(buffer)) return;
    } else if (socket.bufferedAmount <= 256000) {
      socket.send(buffer);
      return;
    }
    stopCapture();
    setError("Your connection is too slow for live audio. Try listening again.");
    setPhase("error");
  }

  async function startCapture(nextDeviceId = deviceId) {
    const socket = socketRef.current;
    if (!socket || socket.readyState >= WebSocket.CLOSING || committing.current) return;
    stopCapture();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setPhase("starting");
    const microphoneTimeout = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      stopCapture();
      setError("Microphone permission has not completed. Allow microphone access in browser or system settings, then retry.");
      setPhase("error");
    }, 30000);
    const clearMicrophoneTimeout = () => window.clearTimeout(microphoneTimeout);
    controller.signal.addEventListener("abort", clearMicrophoneTimeout, { once: true });
    try {
      const capture = await startRambleCapture({
        deviceId: nextDeviceId || undefined,
        signal: controller.signal,
        onAudio: sendAudio,
        onEnded: () => { setError("The microphone disconnected. Select a microphone and try again."); setPhase("error"); },
      });
      if (controller.signal.aborted) { capture.stop(); return; }
      clearMicrophoneTimeout();
      captureRef.current = capture;
      if (capture.deviceId) setDeviceId(capture.deviceId);
      // Acquire permission and a running audio graph before starting the
      // provider, so a browser permission prompt cannot expire its connection.
      startProvider();
      if (providerReady.current) setPhase("listening");
      // Labels become available after permission; refreshing the menu must not
      // delay listening or block on slow device enumeration.
      void navigator.mediaDevices.enumerateDevices().then((available) => {
        if (!controller.signal.aborted) setDevices(available.filter((device) => device.kind === "audioinput"));
      }).catch(() => {});
    } catch (cause) {
      if (controller.signal.aborted) return;
      stopCapture();
      setError(cause instanceof Error && cause.name === "NotAllowedError"
        ? "Microphone access was denied. Allow microphone access in your browser and try again."
        : cause instanceof Error ? cause.message : "Could not start the microphone. Try again.");
      setPhase("error");
    } finally {
      clearMicrophoneTimeout();
      controller.signal.removeEventListener("abort", clearMicrophoneTimeout);
    }
  }

  function discard() {
    if (committing.current) return;
    stopCapture();
    send({ type: "discard" });
    onClose();
  }

  function commit() {
    if (committing.current || !state?.todos.length) return;
    if (!send({ type: "commit" })) return;
    committing.current = true;
    stopCapture();
    setPhase("committing");
    setError("");
  }

  function reconnect() {
    stopCapture();
    providerReady.current = false;
    providerStarted.current = false;
    committing.current = false;
    setState(null);
    setError("");
    setUnderstandingFailed(false);
    setPendingUnderstanding(0);
    setPhase("connecting");
    setConnectionAttempt((value) => value + 1);
  }

  const todos = state?.todos ?? [];
  const active = phase === "listening";
  const busy = phase === "committing";
  const status = busy ? "Adding tasks…" : pendingUnderstanding > 0 ? "Understanding tasks…" : phase === "connecting" ? "Connecting…" : phase === "starting" ? "Starting microphone…" : active ? "Listening" : phase === "paused" ? "Microphone paused" : phase === "error" ? "Capture paused" : "Microphone off";
  const selectedMicrophone = devices.find((device) => device.deviceId === deviceId)?.label || "Default microphone";

  function toggleCapture() {
    if (active) {
      // VAD needs silence to finalize the last phrase when capture pauses.
      if (providerReady.current && socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(new ArrayBuffer(48000));
      stopCapture();
      setPhase("paused");
    } else void startCapture();
  }
  function card(todo: RambleTodo, nested = false) {
    const project = projects.find((item) => item.id === todo.projectId);
    const dueDate = todo.dueDate ? new Date(`${todo.dueDate}T${todo.startTime ?? "00:00"}:00`) : null;
    return <li key={todo.id} className={`rounded-lg border bg-background p-3 ${nested ? "ml-6" : ""}`}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 break-words font-medium">{todo.title}</p>
        <Button variant="ghost" size="icon-sm" disabled={busy || !connected} aria-label={`Remove ${todo.title}`} onClick={() => send({ type: "remove", id: todo.id })}>
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {dueDate && <DatePill dueDate={dueDate} />}
        {todo.endTime && <span className="text-xs text-muted-foreground">until {todo.endTime}</span>}
        {todo.recurrence && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Repeat2 className="size-3.5" />Every {todo.recurrence.n > 1 ? `${todo.recurrence.n} ${todo.recurrence.unit}s` : todo.recurrence.unit}</span>}
        <ProjectPill name={project?.name} color={project?.color} />
      </div>
    </li>;
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !committing.current) discard(); }}>
    <DialogContent className="gap-0 p-6 sm:max-w-2xl" showCloseButton={false}>
      <div className="flex items-center justify-between gap-4">
        <DialogTitle className="text-xl font-semibold">Ramble</DialogTitle>
        <div className="flex items-center gap-1">
          <div className="mr-2 flex h-6 items-center gap-0.5 text-brand" data-active={active} aria-hidden="true">
            {[820, 960, 740, 1080, 880, 760, 1020, 900, 780].map((duration, index) => <span key={index} className={`${waveStyles.bar} w-0.5 rounded-full bg-current`} style={{ animationDuration: `${duration}ms`, animationDelay: `${index * -130}ms` }} />)}
          </div>
          <Button variant="ghost" size="icon" aria-label={active ? "Pause listening" : "Resume listening"} title={`${status} · ${selectedMicrophone}`} disabled={!connected || busy || understandingFailed || phase === "starting"} onClick={toggleCapture}>
            {phase === "connecting" || phase === "starting" ? <LoaderCircle className="size-5 animate-spin" /> : active ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Choose microphone" title={selectedMicrophone} disabled={busy || understandingFailed || phase === "starting"} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
              <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-3rem)]">
              <DropdownMenuRadioGroup value={deviceId} onValueChange={(value) => {
                setDeviceId(value);
                if (active || phase === "error") void startCapture(value);
              }}>
                <DropdownMenuRadioItem value="">Default microphone</DropdownMenuRadioItem>
                {devices.filter((device) => device.deviceId).map((device, index) => <DropdownMenuRadioItem key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <DialogDescription className="sr-only">Speak your tasks. Say “sub-task” to nest tasks, “top level” to return, “undo” to go back, or “done” to add everything. Closing discards unsaved tasks.</DialogDescription>
      <span role="status" aria-live="polite" className="sr-only">{status}</span>
      {error && <div className="mt-4 text-sm text-destructive"><p role="alert">{error}</p>{understandingFailed && connected ? <Button className="mt-2" variant="outline" disabled={pendingUnderstanding > 0} onClick={() => send({ type: "retry-understanding" })}>Retry understanding</Button> : !connected && <Button className="mt-2" variant="outline" onClick={reconnect}>Start a new session</Button>}</div>}
      {state?.mode === "sub-task" && <p className="mt-3 text-xs text-muted-foreground">Capturing sub-tasks</p>}
      <div className="my-6 max-h-[40vh] min-h-48 overflow-y-auto" aria-label="Staged tasks">
        {todos.length ? <ul className="space-y-2">{todos.filter((todo) => !todo.parentId).flatMap((todo) => [card(todo), ...todos.filter((child) => child.parentId === todo.id).map((child) => card(child, true))])}</ul> :
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-3 text-center text-brand"><p className="text-sm">Try saying</p><p className="max-w-md text-lg font-medium">“Buy groceries tomorrow at 17:00”</p></div>}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{status}{todos.length > 0 && ` · ${todos.length} ${todos.length === 1 ? "task" : "tasks"}`}</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Discard and close Ramble" title="Discard and close" disabled={busy} onClick={discard}><X className="size-5" /></Button>
          <Button size="icon" className="bg-brand text-white hover:bg-brand/90" aria-label={`Add ${todos.length} ${todos.length === 1 ? "task" : "tasks"}`} title="Add tasks" disabled={busy || !connected || !todos.length} onClick={commit}>{busy ? <LoaderCircle className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
