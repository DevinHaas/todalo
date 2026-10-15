import { useSyncExternalStore } from "react";
import type { GoogleIntent } from "./session";
import { session } from "./runtime";

/** Google sign-in or linking through the system browser, with a cancel while it is open. */
export function GoogleButton({ intent, disabled }: { intent: GoogleIntent; disabled?: boolean }) {
  const waiting = useSyncExternalStore(session.subscribe, session.getGooglePending);
  const error = useSyncExternalStore(session.subscribe, session.getGoogleError);
  if (waiting) return <p className="switch-mode" role="status">Continue in your browser, then return to todalo. <button className="text-button" onClick={() => void session.cancelGoogle()}>Cancel</button></p>;
  return <>
    {error && <p className="error" role="alert">{error}</p>}
    <button type="button" disabled={disabled} onClick={() => void session.continueWithGoogle(intent)}>{intent === "link" ? "Link Google account" : "Continue with Google"}</button>
  </>;
}
