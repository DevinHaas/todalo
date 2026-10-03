export async function copyTaskUrl(id: string, clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard, origin = window.location.origin) {
  if (!clipboard?.writeText) throw new Error("Clipboard access is unavailable. Open task details and copy the link manually.");
  try { await clipboard.writeText(`${origin}/tasks/${encodeURIComponent(id)}`); }
  catch { throw new Error("The browser blocked copying. Retry using Copy link or copy the task link manually."); }
}
