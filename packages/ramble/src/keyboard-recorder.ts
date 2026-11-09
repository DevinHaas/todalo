import { bindingFromEvent, type KeyInput, type Platform } from "./keyboard";

type RecorderKey = KeyInput & { isComposing: boolean; preventDefault(): void; stopImmediatePropagation(): void };
interface RecorderOptions { onStep?: (partial: string) => void; onCancel?: () => void; wait?: number }

/**
 * Records one shortcut, swallowing every key so no command runs meanwhile.
 * A chord with ⌘/Ctrl/⌥ ends it at once; a plain key waits `wait` ms (the
 * dispatcher's sequence window) for a next step, up to three ("g then t").
 * Escape cancels; call `cancel()` to stop a pending sequence.
 */
export function createShortcutRecorder(profile: "portable" | Platform, platform: Platform, onBinding: (binding: string) => void, { onStep, onCancel, wait = 1000 }: RecorderOptions = {}) {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const steps: string[] = [];
  const finish = () => { if (done) return; done = true; clearTimeout(timer); onBinding(steps.join(" then ")); };
  const record = (event: RecorderKey) => {
    if (done) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || event.isComposing) return;
    if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) { record.cancel(); onCancel?.(); return; }
    const binding = bindingFromEvent(event);
    if (!binding) return;
    clearTimeout(timer);
    steps.push(profile === "portable" ? binding.replace(platform === "mac" ? "Meta+" : "Ctrl+", "Primary+") : binding);
    if (/^(Meta|Ctrl|Alt)\+/.test(binding) || steps.length === 3) return finish();
    onStep?.(steps.join(" then "));
    timer = setTimeout(finish, wait);
  };
  record.cancel = () => { done = true; clearTimeout(timer); };
  return record;
}
