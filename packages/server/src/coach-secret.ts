// Ticket 17: Coach API keys are AES-256-GCM encrypted at rest with
// COACH_SECRET_KEY (32 bytes, base64). Format: v1.<iv>.<tag>.<ciphertext>, base64.
// ponytail: one key, no rotation; add a key id to the prefix when rotating.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class CoachSecretError extends Error {}

function keyOf(secret: string | undefined) {
  const key = secret ? Buffer.from(secret, "base64") : null;
  if (key?.length !== 32) throw new CoachSecretError("COACH_SECRET_KEY must be 32 bytes, base64 encoded.");
  return key;
}

export function sealSecret(plain: string, secret = process.env.COACH_SECRET_KEY) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map(part => typeof part === "string" ? part : part.toString("base64")).join(".");
}

/** Throws on a wrong key or tampered value. */
export function openSecret(sealed: string, secret = process.env.COACH_SECRET_KEY) {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new CoachSecretError("Unreadable sealed secret.");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
