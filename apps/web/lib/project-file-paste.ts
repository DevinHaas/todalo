import { validateAttachmentFiles } from "./attachment-limits";
import type { Platform } from "./keyboard";

interface PasteEvent {
  clipboardData: { files: ArrayLike<File> } | null;
  target: unknown; defaultPrevented: boolean; preventDefault(): void;
}
export function isPasteEditor(target: unknown) {
  return Boolean((target as { closest?: (selector: string) => unknown } | null)?.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"]'));
}
export class ProjectFilePasteController {
  composing = false;
  private busy = false;
  constructor(private readonly options: { platform: Platform; bindings(): string[]; upload(files: File[]): Promise<void>; error(message: string): void }) {}
  async upload(files: File[]) {
    if (this.busy) { this.options.error("Files are still saving. Please wait, then retry your paste."); return; }
    this.busy = true;
    try { validateAttachmentFiles(files); await this.options.upload(files); }
    catch (error) { this.options.error(error instanceof Error ? error.message : "Files could not save. Please retry."); }
    finally { this.busy = false; }
  }
  async paste(event: PasteEvent) {
    if (this.composing || event.defaultPrevented || isPasteEditor(event.target) || !this.options.bindings().includes(this.options.platform === "mac" ? "Meta+v" : "Ctrl+v")) return;
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    await this.upload(files);
  }
  async read(read?: () => Promise<{ types: readonly string[]; getType(type: string): Promise<Blob> }[]>) {
    if (this.composing || !this.options.bindings().length) return;
    if (!read) { this.options.error("This browser does not support file clipboard reads. Restore the default paste shortcut and paste a file in the project."); return; }
    let items;
    try { items = await read(); }
    catch { this.options.error("Clipboard permission was denied. Allow clipboard access and try the shortcut again, or restore the default and paste a file."); return; }
    try {
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find(type => !type.startsWith("text/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "bin";
        files.push(blob instanceof File ? blob : new File([blob], `Pasted ${type.startsWith("image/") ? "image" : "file"} ${files.length + 1}.${extension}`, { type }));
      }
      if (!files.length) throw new Error("The clipboard exposes no files. Copy a file and retry, or restore the default paste shortcut. Custom shortcuts depend on your browser's clipboard support.");
      await this.upload(files);
    } catch (error) { this.options.error(error instanceof Error ? error.message : "Clipboard files could not save. Please retry."); }
  }
}
