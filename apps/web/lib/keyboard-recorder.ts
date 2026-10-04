import { bindingFromEvent, type KeyInput, type Platform } from "./keyboard";

type RecorderKey = KeyInput & { isComposing: boolean; preventDefault(): void; stopImmediatePropagation(): void };

// One completed chord ends the recording, even before React renders the new draft.
export function createShortcutRecorder(profile: "portable" | Platform, platform: Platform, onBinding: (binding: string) => void) {
  let captured = false;
  return (event: RecorderKey) => {
    if (captured) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || event.isComposing) return;
    const binding = bindingFromEvent(event);
    if (!binding) return;
    captured = true;
    onBinding(profile === "portable" ? binding.replace(platform === "mac" ? "Meta+" : "Ctrl+", "Primary+") : binding);
  };
}
