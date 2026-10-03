/** Keep the first words while the authenticated speech socket becomes ready. */
export function createRambleAudioQueue(maxBytes = 256000) {
  let frames: ArrayBuffer[] = [];
  let bytes = 0;
  return {
    push(frame: ArrayBuffer) {
      if (bytes + frame.byteLength > maxBytes) return false;
      frames.push(frame);
      bytes += frame.byteLength;
      return true;
    },
    flush(send: (frame: ArrayBuffer) => void) {
      const pending = frames;
      frames = [];
      bytes = 0;
      for (const frame of pending) send(frame);
    },
    clear() { frames = []; bytes = 0; },
  };
}
