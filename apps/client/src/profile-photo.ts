// Settings › Account: the profile photo. The picked image is cropped to a centred square and
// shrunk to a small JPEG here, so the account stores a few kilobytes, never the original file.
import { invoke, isTauri } from "@tauri-apps/api/core";

const SIZE = 256;

/** A centred square crop of `file` as a JPEG data URL, SIZE px wide. */
export async function squarePhoto(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Saves (a data URL from squarePhoto) or clears (null) the photo. Native goes through Rust, which holds the token. */
export async function saveProfilePhoto(image: string | null): Promise<void> {
  if (isTauri()) {
    await invoke("set_profile_photo", { image });
    return;
  }
  const response = await fetch("/api/auth/update-user", {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ image }),
  });
  if (!response.ok) throw new Error("Your photo could not be saved.");
}
