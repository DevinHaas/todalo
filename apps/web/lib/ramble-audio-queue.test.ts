import { describe, expect, it, vi } from "vitest";
import { createRambleAudioQueue } from "./ramble-audio-queue";

describe("audio while the speech socket connects", () => {
  it("retains the first words in order and sends each frame only once", () => {
    const queue = createRambleAudioQueue(); const send = vi.fn();
    const first = new ArrayBuffer(3200); const second = new ArrayBuffer(3200);
    expect(queue.push(first)).toBe(true); expect(queue.push(second)).toBe(true);
    queue.flush(send); queue.flush(send);
    expect(send.mock.calls).toEqual([[first], [second]]);
  });
  it("bounds waiting audio without discarding earlier speech or reordering it", () => {
    const queue = createRambleAudioQueue(6400); const send = vi.fn();
    const first = new ArrayBuffer(3200); const second = new ArrayBuffer(3200);
    queue.push(first); queue.push(second);
    expect(queue.push(new ArrayBuffer(3200))).toBe(false);
    queue.flush(send); expect(send.mock.calls).toEqual([[first], [second]]);
    expect(queue.push(new ArrayBuffer(3200))).toBe(true);
  });
  it("does not send waiting audio after capture is cancelled", () => {
    const queue = createRambleAudioQueue(); const send = vi.fn();
    queue.push(new ArrayBuffer(3200)); queue.clear(); queue.flush(send);
    expect(send).not.toHaveBeenCalled();
  });
});
