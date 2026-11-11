// File bytes for attachments. With R2 configured (R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY) the bytes go to the bucket and the row's `content` column keeps only
// "r2:<key>"; without it (local development, tests) the column keeps base64 as before. Older
// base64 rows stay readable either way, so nothing needs migrating.
import { AwsClient } from "aws4fetch";

const PREFIX = "r2:";

function bucket() {
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  const client = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
  return { client, url: (key: string) => `${R2_ENDPOINT.replace(/\/$/, "")}/${R2_BUCKET}/${key}` };
}

/** What a row's `content` column stores for these bytes. */
export async function storeFile(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const r2 = bucket();
  if (!r2) return Buffer.from(bytes).toString("base64");
  // ponytail: objects stay when their task is deleted (the row cascades, the object doesn't);
  // add a sweep of unreferenced keys when storage cost or account deletion needs it.
  const key = `attachments/${crypto.randomUUID()}`;
  const response = await r2.client.fetch(r2.url(key), { method: "PUT", body: bytes });
  if (!response.ok) throw new Error(`The file could not be stored (${response.status}).`);
  return PREFIX + key;
}

/** A row's bytes as base64, whether the column holds them or points into R2. */
export async function fileContent(content: string): Promise<string> {
  if (!content.startsWith(PREFIX)) return content;
  const r2 = bucket();
  if (!r2) throw new Error("This file is stored in R2, which is not configured here.");
  const response = await r2.client.fetch(r2.url(content.slice(PREFIX.length)));
  if (!response.ok) throw new Error(`The file could not be read (${response.status}).`);
  return Buffer.from(await response.arrayBuffer()).toString("base64");
}
