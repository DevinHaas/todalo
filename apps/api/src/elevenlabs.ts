export interface SpeechCallbacks {
  ready(): void;
  transcript(text: string, final: boolean): void;
  error(message: string): void;
}

export interface SpeechConnection {
  audio(bytes: Uint8Array): void;
  finish(): Promise<void>;
  close(): void;
}

// This module runs exclusively in Bun. The credential stays in a header on
// the server-to-provider connection, never in a browser URL or message.
export function connectElevenLabs(callbacks: SpeechCallbacks): SpeechConnection {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Voice capture is not configured on this server.");
  const url = new URL("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
  url.search = new URLSearchParams({
    model_id: "scribe_v2_realtime",
    audio_format: "pcm_16000",
    commit_strategy: "vad",
    vad_silence_threshold_secs: "1.0",
    include_timestamps: "false",
  }).toString();
  const socket = new WebSocket(url.toString(), { headers: { "xi-api-key": key } });
  let closed = false;
  let ready = false;
  let pendingSpeech = false;
  let finishResolve: (() => void) | undefined;
  const connectionTimer = setTimeout(() => {
    if (!ready && !closed) {
      callbacks.error("The speech service took too long to connect. Try again.");
      close();
    }
  }, 15_000);

  function close() {
    closed = true;
    ready = false;
    clearTimeout(connectionTimer);
    finishResolve?.();
    socket.close();
  }

  function audio(bytes: Uint8Array) {
    if (!ready || closed) return;
    if (socket.bufferedAmount > 512_000) {
      callbacks.error("The speech connection is too slow. Please try again.");
      close();
      return;
    }
    socket.send(JSON.stringify({
      message_type: "input_audio_chunk",
      audio_base_64: Buffer.from(bytes).toString("base64"),
      sample_rate: 16000,
    }));
  }

  socket.addEventListener("message", (event) => {
    if (closed) return;
    try {
      const message = JSON.parse(String(event.data)) as { message_type?: string; text?: string; error?: string };
      if (message.message_type === "session_started") {
        ready = true;
        clearTimeout(connectionTimer);
        callbacks.ready();
      } else if (message.message_type === "committed_transcript" || message.message_type === "partial_transcript") {
        const final = message.message_type === "committed_transcript";
        pendingSpeech = !final && Boolean(message.text?.trim());
        if (message.text?.trim()) callbacks.transcript(message.text, final);
        if (final) finishResolve?.();
      } else if (message.error || message.message_type?.endsWith("_error") || message.message_type === "rate_limited") {
        // Provider errors may contain account details; return a safe message.
        callbacks.error("The speech service could not continue. Check its configuration or try again.");
        close();
      }
    } catch {
      callbacks.error("The speech service returned an invalid response.");
      close();
    }
  });
  socket.addEventListener("error", () => {
    if (!closed) callbacks.error("Could not connect to the speech service. Try again.");
    close();
  });
  socket.addEventListener("close", () => {
    if (!closed) callbacks.error("The speech connection ended. You can save the captured tasks or discard them.");
    closed = true;
    ready = false;
    clearTimeout(connectionTimer);
    finishResolve?.();
  });

  return {
    audio,
    async finish() {
      if (!ready || closed) return;
      // Give VAD a final pause so clicking Add tasks also captures the phrase
      // currently being spoken. Await its finalized segment before persisting.
      await new Promise<void>((resolve) => {
        let settled = false;
        const timer = setTimeout(done, 2200);
        function done() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          finishResolve = undefined;
          resolve();
        }
        finishResolve = done;
        audio(new Uint8Array(48_000));
      });
      if (pendingSpeech) throw new Error("The last phrase has not finished transcribing.");
    },
    close,
  };
}
