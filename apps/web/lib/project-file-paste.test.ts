import { expect, it, vi } from "vitest";
import { ProjectFilePasteController, isProjectPasteTarget } from "./project-file-paste";
it("allows default page focus and active project focus while excluding sidebar focus", () => {
  const body = {}; const projectControl = {}; const sidebar = {};
  const scope = { contains: (target: unknown) => target === projectControl };
  expect(isProjectPasteTarget(body, scope, body)).toBe(true);
  expect(isProjectPasteTarget(projectControl, scope, body)).toBe(true);
  expect(isProjectPasteTarget(sidebar, scope, body)).toBe(false);
});

function fixture(bindings = ["Meta+v"]) {
  const upload = vi.fn(async (files: File[]) => { void files; }); const error = vi.fn();
  const controller = new ProjectFilePasteController({ platform: "mac", bindings: () => bindings, upload, error });
  const preventDefault = vi.fn();
  const paste = (files: File[], editable = false) => controller.paste({ clipboardData: { files }, target: { closest: () => editable ? {} : null }, defaultPrevented: false, preventDefault });
  return { controller, upload, error, paste, preventDefault };
}
it("uploads native project file paste while leaving text and input paste untouched", async () => {
  const f = fixture(); const file = new File(["notes"], "notes.txt");
  await f.paste([file]); expect(f.upload).toHaveBeenCalledWith([file]); expect(f.preventDefault).toHaveBeenCalledOnce();
  f.upload.mockClear(); f.preventDefault.mockClear();
  await f.paste([]); await f.paste([file], true); expect(f.upload).not.toHaveBeenCalled(); expect(f.preventDefault).not.toHaveBeenCalled();
});
it("respects disabled or overridden bindings, composition and retryable upload errors", async () => {
  const file = new File(["notes"], "notes.txt");
  const disabled = fixture([]); await disabled.paste([file]); expect(disabled.upload).not.toHaveBeenCalled();
  const custom = fixture(["Meta+Shift+v"]); await custom.paste([file]); expect(custom.upload).not.toHaveBeenCalled();
  const f = fixture(); f.controller.composing = true; await f.paste([file]); expect(f.upload).not.toHaveBeenCalled();
  f.controller.composing = false; f.upload.mockRejectedValueOnce(new Error("Try again")); await f.paste([file]); expect(f.error).toHaveBeenCalledWith("Try again");
  await f.paste([file]); expect(f.upload).toHaveBeenCalledTimes(2);
});
it("custom shortcuts read clipboard files with permission and expose browser limits", async () => {
  const f = fixture(["Meta+Shift+v"]);
  await f.controller.read(undefined); expect(f.error).toHaveBeenLastCalledWith(expect.stringContaining("does not support"));
  await f.controller.read(async () => { throw new Error("NotAllowedError"); }); expect(f.error).toHaveBeenLastCalledWith(expect.stringContaining("permission"));
  await f.controller.read(async () => [{ types: ["text/plain"], getType: async () => new Blob(["text"]) }]); expect(f.upload).not.toHaveBeenCalled();
  await f.controller.read(async () => [{ types: ["image/png"], getType: async () => new Blob([new Uint8Array([0, 1])], { type: "image/png" }) }]);
  expect(f.upload.mock.calls[0][0][0].name).toBe("Pasted image 1.png");
});
