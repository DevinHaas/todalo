import { afterEach, describe, expect, it, vi } from "vitest";

const played: string[] = [];
class FakeAudio { volume = 1; preload = ""; currentTime = 0; constructor(public src: string) {} play() { played.push(this.src); return Promise.resolve(); } }

afterEach(() => { played.length = 0; vi.unstubAllGlobals(); vi.resetModules(); });

async function load(stored: string | null = null) {
  const store = new Map<string, string>(stored ? [["todalo.sounds", stored]] : []);
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
  return import("./sounds");
}

describe("sound cues", () => {
  it("plays each cue from public/sounds, unless the device turned sounds off", async () => {
    const { playCue, sounds } = await load();
    playCue("complete"); playCue("coach"); playCue("ramble-ready");
    expect(played).toEqual(["/sounds/complete/plop.mp3", "/sounds/coach/magic.mp3", "/sounds/ramble-ready.mp3"]);
    sounds.set(false);
    playCue("complete");
    expect(played).toHaveLength(3);
  });

  it("plays the sound chosen for a slot; an unknown choice falls back to the default", async () => {
    const { playCue, sounds } = await load();
    sounds.choose("complete", "fizz-pop"); playCue("complete");
    sounds.choose("coach", "gone-in-an-update"); playCue("coach");
    expect(played).toEqual(["/sounds/complete/fizz-pop.mp3", "/sounds/coach/magic.mp3"]);
    // None silences only that slot
    sounds.choose("complete", "none"); sounds.choose("coach", "none");
    playCue("complete"); playCue("coach"); playCue("ramble-saved");
    expect(played.slice(2)).toEqual(["/sounds/ramble-saved.mp3"]);
  });

  it("ships a file for every choice", async () => {
    const { SOUND_CHOICES } = await load();
    const { existsSync } = await import("node:fs");
    const missing = Object.entries(SOUND_CHOICES).flatMap(([slot, choices]) => choices.filter(c => c.id !== "none").map(c => `${slot}/${c.id}.mp3`)).filter(f => !existsSync(new URL(`../public/sounds/${f}`, import.meta.url)));
    expect(missing).toEqual([]);
  });

});
