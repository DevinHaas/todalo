/** Streaming, mono PCM16 encoder. The fractional bucket carries between audio quanta. */
export function createPcm16Encoder(inputRate: number, outputRate = 16000, frameSize = 1600) {
  if (!Number.isFinite(inputRate) || inputRate < outputRate || outputRate <= 0 || !Number.isInteger(frameSize) || frameSize < 1) throw new Error("Unsupported microphone sample rate");
  const ratio = inputRate / outputRate;
  let weight = 0;
  let sum = 0;
  let frame = new Int16Array(frameSize);
  let cursor = 0;
  return (samples: Float32Array, emit: (buffer: ArrayBuffer) => void) => {
    for (const sample of samples) {
      let remaining = 1;
      while (remaining > 1e-8) {
        const take = Math.min(remaining, ratio - weight);
        sum += sample * take;
        weight += take;
        remaining -= take;
        if (weight >= ratio - 1e-8) {
          const value = Math.max(-1, Math.min(1, sum / ratio));
          frame[cursor++] = Math.round(value * (value < 0 ? 32768 : 32767));
          weight = 0;
          sum = 0;
          if (cursor === frameSize) {
            emit(frame.buffer);
            frame = new Int16Array(frameSize);
            cursor = 0;
          }
        }
      }
    }
  };
}

export interface RambleCapture {
  stop: () => void;
  deviceId: string;
}

/** Acquires only on a user gesture; every async step respects cancellation. */
export async function startRambleCapture({ deviceId, signal, onAudio, onEnded }: {
  deviceId?: string;
  signal: AbortSignal;
  onAudio: (buffer: ArrayBuffer) => void;
  onEnded: () => void;
}): Promise<RambleCapture> {
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
    throw new Error("Microphone capture needs a supported browser and a secure connection.");
  }
  const context = new AudioContext();
  if (!context.audioWorklet || typeof AudioWorkletNode === "undefined") {
    void context.close().catch(() => {});
    throw new Error("This browser does not support live microphone capture. Try a current browser.");
  }
  let stream: MediaStream | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let processor: AudioWorkletNode | undefined;
  let gain: GainNode | undefined;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal.removeEventListener("abort", stop);
    if (processor) processor.port.onmessage = null;
    processor?.disconnect();
    source?.disconnect();
    gain?.disconnect();
    stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    void context.close().catch(() => {});
  };
  signal.addEventListener("abort", stop, { once: true });
  const check = () => {
    if (signal.aborted || stopped) throw new DOMException("Capture cancelled", "AbortError");
  };
  try {
    check();
    // Start resuming in the click handler, before awaiting microphone permission.
    const resumed = context.resume();
    void resumed.catch(() => {});
    const script = `const encodeFactory = ${createPcm16Encoder.toString()};
class RambleProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.encode = encodeFactory(sampleRate); }
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (samples) {
      this.encode(samples, buffer => this.port.postMessage({ buffer }, [buffer]));
    }
    return true;
  }
}
registerProcessor('ramble-pcm16', RambleProcessor);`;
    const url = URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
    const moduleReady = context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    // Load the processor while the browser acquires permission/the device. If
    // either fails, a stream arriving later still releases its microphone.
    const microphoneReady = navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    } }).then((acquired) => {
      stream = acquired;
      if (stopped || signal.aborted) stream.getTracks().forEach((track) => track.stop());
      check();
    });
    await Promise.all([resumed, moduleReady, microphoneReady]);
    check();
    if (!stream) throw new Error("Microphone unavailable");
    processor = new AudioWorkletNode(context, "ramble-pcm16");
    processor.port.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer }>) => {
      if (stopped) return;
      if (event.data.buffer) onAudio(event.data.buffer);
    };
    source = context.createMediaStreamSource(stream);
    gain = context.createGain();
    gain.gain.value = 0;
    source.connect(processor).connect(gain).connect(context.destination);
    stream.getAudioTracks().forEach((track) => { track.onended = () => { stop(); onEnded(); }; });
    return { stop, deviceId: stream.getAudioTracks()[0]?.getSettings().deviceId ?? "" };
  } catch (error) {
    stop();
    throw error;
  }
}

export function rambleSocketUrl(location: Pick<Location, "protocol" | "host" | "hostname">, configured?: string) {
  if (process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(location.hostname)) {
    if (configured) {
      const url = new URL(configured);
      if (["ws:", "wss:"].includes(url.protocol) && ["localhost", "127.0.0.1"].includes(url.hostname)) return url.toString();
      throw new Error("The development Ramble address must be a local WebSocket URL.");
    }
    return `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:3001/api/ramble/ws`;
  }
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ramble/ws`;
}
