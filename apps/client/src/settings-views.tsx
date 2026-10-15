import type { ReadState } from "./views";
import type { SettingsDto } from "./settings";

/** Legacy General › Smart date recognition, on the Account screen (ticket 12). */
export function SmartDatesSetting({ state, onRetry, onChange, pending, error }: {
  state: ReadState<SettingsDto>; onRetry: () => void; onChange: (enabled: boolean) => void; pending: boolean; error: string | null;
}) {
  if (state.status === "pending") return <p className="state" role="status">Loading preferences…</p>;
  if (!state.data) return <p className="error" role="alert">Your preferences could not be loaded. <button type="button" className="text-action" onClick={onRetry}>Try again</button></p>;
  return <>
    <label className="setting">
      <input type="checkbox" checked={state.data.smartDateRecognition} disabled={pending} onChange={(event) => onChange(event.target.checked)} />
      <span><span className="setting-title">Smart date recognition</span><span className="setting-hint">Recognize dates, times, and recurrence typed into a task title, like &quot;call mom tomorrow at 4pm&quot;.</span></span>
    </label>
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}
