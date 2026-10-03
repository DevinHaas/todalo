export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PASTE_BYTES = 10 * 1024 * 1024;
export const MAX_PASTE_FILES = 5;
export const ATTACHMENT_LIMIT_HINT = "Up to 5 files, 5 MB each and 10 MB per paste.";
export function validateAttachmentFiles(files: readonly File[]) {
  if (!files.length || files.length > MAX_PASTE_FILES) throw new Error("Paste between 1 and 5 files.");
  if (files.some(file => !file.size || file.size > MAX_FILE_BYTES)) throw new Error("Files must contain content and be at most 5 MB each.");
  if (files.reduce((total, file) => total + file.size, 0) > MAX_PASTE_BYTES) throw new Error("A paste batch must be at most 10 MB.");
  if (files.some(file => !file.name.trim() || file.name.length > 255 || /[\x00-\x1f\x7f/\\]/.test(file.name))) throw new Error("File names must be 1–255 characters without control characters or paths.");
  if (files.some(file => file.type && !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(file.type))) throw new Error("Invalid file type.");
}
