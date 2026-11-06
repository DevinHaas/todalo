// End-to-end Ramble transport check against the disposable QA API only:
//   QA_API_PORT=3019 bun --no-env-file scripts/auth-smoke-server.ts
//   QA_API_PORT=3019 bun --no-env-file scripts/ramble-smoke.ts
// Exercises the native path (bearer -> one-use ticket -> socket) and the browser
// path (cookie + exact Origin) with 48 kHz audio run through the shared encoder.
import assert from "node:assert/strict";
import { createPcm16Encoder } from "@todalo/ramble/audio";

const port = Number(process.env.QA_API_PORT ?? 3009);
const http = `http://127.0.0.1:${port}`;
const ws = `ws://127.0.0.1:${port}/api/ramble/ws`;
const origin = "http://localhost:5173";

const signIn = await fetch(`${http}/api/auth/sign-in/email`, {
  method: "POST", headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ email: "existing@example.test", password: "dev-password-123" }),
});
assert.equal(signIn.status, 200);
const bearer = signIn.headers.get("set-auth-token");
const cookie = signIn.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
assert.ok(bearer && cookie);

async function rejected(url: string, headers: Record<string, string> = {}) {
  const socket = new WebSocket(url, { headers });
  const opened = await new Promise<boolean>((resolve) => {
    socket.onopen = () => resolve(true);
    socket.onerror = socket.onclose = () => resolve(false);
  });
  socket.close();
  assert.equal(opened, false, `${url} must not open`);
}

async function capture(url: string, headers: Record<string, string>) {
  const socket = new WebSocket(url, { headers });
  socket.binaryType = "arraybuffer";
  const messages: { type: string; text?: string; final?: boolean }[] = [];
  const next = (predicate: (message: (typeof messages)[number]) => boolean) => new Promise<(typeof messages)[number]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout; got ${JSON.stringify(messages.map((m) => m.type))}`)), 5000);
    const check = () => { const found = messages.find(predicate); if (found) { clearTimeout(timer); resolve(found); } else setTimeout(check, 10); };
    check();
  });
  socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)));
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.send(JSON.stringify({ type: "start", options: { referenceDate: "2026-10-15T09:00:00", timeZone: "Europe/Zurich", projectId: null, defaultDueDate: null } }));
  await next((message) => message.type === "ready");
  // Two seconds of a 440 Hz tone at 48 kHz in uneven 128-sample render quanta.
  const encode = createPcm16Encoder(48_000);
  const tone = Float32Array.from({ length: 96_000 }, (_, index) => 0.5 * Math.sin(2 * Math.PI * 440 * index / 48_000));
  for (let offset = 0; offset < tone.length; offset += 128) encode(tone.subarray(offset, offset + 128), (frame) => socket.send(frame));
  socket.send(new ArrayBuffer(48_000));
  const final = await next((message) => message.type === "transcript" && message.final === true);
  socket.send(JSON.stringify({ type: "discard" }));
  socket.close();
  return final.text;
}

const ticket = async () => {
  const response = await fetch(`${http}/api/ramble/ticket`, { method: "POST", headers: { authorization: `Bearer ${bearer}` } });
  assert.equal(response.status, 200);
  return (await response.json() as { ticket: string }).ticket;
};
assert.equal((await fetch(`${http}/api/ramble/ticket`, { method: "POST", headers: { cookie, origin } })).status, 401);

const nativeTicket = await ticket();
const nativeUrl = `${ws}?ticket=${nativeTicket}`;
const nativeText = await capture(nativeUrl, { origin: "tauri://localhost" });
assert.equal(nativeText, "QA transcription: 2.0 s of 16 kHz PCM16 in 20 frames, peak 50%");
await rejected(nativeUrl);
await rejected(`${ws}?ticket=${"x".repeat(43)}`);

const browserText = await capture(ws, { origin, cookie });
assert.equal(browserText, nativeText);
await rejected(ws, { cookie });
await rejected(ws, { origin: "https://untrusted.example", cookie });
console.log(`Ramble smoke passed: ticket + cookie paths; "${nativeText}"`);
