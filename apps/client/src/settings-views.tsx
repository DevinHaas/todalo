import type { ReadState } from "./views";
import type { SettingsDto } from "./settings";

/** Legacy General's bordered row: title and hint on the left, a switch on the right. */
export function SettingSwitch({ title, hint, checked, disabled, onChange }: {
  title: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  return <label className="setting-card">
    <span><span className="setting-title">{title}</span>{hint && <span className="setting-hint">{hint}</span>}</span>
    <input type="checkbox" checked={checked} role="switch" className="switch" disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

/** Legacy General › Smart date recognition, on the Account screen (ticket 12). */
export function SmartDatesSetting({ state, onRetry, onChange, pending, error }: {
  state: ReadState<SettingsDto>; onRetry: () => void; onChange: (enabled: boolean) => void; pending: boolean; error: string | null;
}) {
  if (state.status === "pending") return <p className="state" role="status">Loading preferences…</p>;
  if (!state.data) return <p className="error" role="alert">Your preferences could not be loaded. <button type="button" className="text-action" onClick={onRetry}>Try again</button></p>;
  return <>
    <SettingSwitch title="Smart date recognition" checked={state.data.smartDateRecognition} disabled={pending} onChange={onChange}
      hint={'Recognize dates, times, and recurrence typed into a task title, like "call mom tomorrow at 4pm".'} />
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}
