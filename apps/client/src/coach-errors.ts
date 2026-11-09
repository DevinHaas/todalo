// Goals ticket 17d: one place that turns a failed Coach model call (the API's
// `error: { code, provider, retryable, message }`) into a toast with the step
// that helps: Retry, Sign in again (ChatGPT), Update key, or Open Coach settings.
// The server already retried transient failures 5 times (coach.ts coachRetry),
// so nothing here retries on its own; Retry is the user's.
import type { QueryClient } from "@tanstack/react-query";
import { coachProviderInfo, type CoachErrorDto, type CoachModelKind } from "../../../packages/server/src/coach";
import type { CoachDto, CoachTransport } from "./coach";
import { toasts } from "./toasts";

export type CoachToastAction = "retry" | "sign-in" | "update-key" | "settings";
export interface CoachToast { title: string; description: string; action: CoachToastAction | null }
export const coachActionLabels: Record<CoachToastAction, string> = { retry: "Retry", "sign-in": "Sign in again", "update-key": "Update key", settings: "Open Coach settings" };

const keyed = (provider: CoachModelKind | null): provider is "openai" | "anthropic" | "openrouter" => provider === "openai" || provider === "anthropic" || provider === "openrouter";
const named = (provider: CoachModelKind | null) => provider ? coachProviderInfo[provider].label : "The provider";

/**
 * The toast for a failed Coach call, or null for none. `background`: a read the
 * user did not ask for (explanations, recommendations, capacity, goal
 * suggestions, the model list). Those already fall back inline (no text, the
 * rules' suggestions, the curated models), so only failures that need the
 * user (sign-in, key, credit) toast, without Retry; the next read asks again.
 * `retry`: whether the caller can run the same request again.
 */
export function coachToast(error: CoachErrorDto, { background = false, retry = false }: { background?: boolean; retry?: boolean } = {}): CoachToast | null {
  const again = retry && !background ? "retry" as const : null;
  const tried = "todalo tried 5 times.";
  switch (error.code) {
    case "auth_expired": return { title: "ChatGPT sign-in expired", description: "Sign in again to keep the Coach on your ChatGPT plan.", action: "sign-in" };
    case "bad_key": return { title: `${named(error.provider)} rejected the API key`, description: keyed(error.provider) ? "Enter a new key for it in Settings › Coach." : error.message, action: keyed(error.provider) ? "update-key" : "settings" };
    case "no_credit": return { title: `${named(error.provider)} is out of credit`, description: "Add credit with the provider, or switch the Coach to another one.", action: "settings" };
    case "rate_limited": return background ? null : { title: "The Coach is rate limited", description: `${error.message} ${tried}`, action: again };
    case "overloaded": return background ? null : { title: "The Coach's model is busy", description: `${error.message} ${tried}`, action: again };
    case "network": return background ? null : { title: "Couldn't reach the Coach's model", description: `${error.message} ${tried}`, action: again };
    case "refused": return background ? null : { title: "The model declined", description: error.message, action: "settings" };
    case "invalid": return background ? null : { title: "The Coach couldn't use the answer", description: error.message, action: "settings" };
  }
}

/** Settings › Coach with that provider's card open (null: just the page); `press`: a control in the card, e.g. its Sign in button. */
type OpenCoachCard = (kind: CoachModelKind | null, press?: string) => void;
let wiring: { cache: QueryClient; userId: string; transport: CoachTransport; openCard: OpenCoachCard } | null = null;
/** The signed-in shell connects the helper (keyboard-screens.tsx); returns the disconnect. */
export function connectCoachErrors(next: NonNullable<typeof wiring>) { wiring = next; return () => { if (wiring === next) wiring = null; }; }

const open = new Set<string>();
/**
 * Shows the toast for `error` (nothing when undefined or when the mapping says
 * none). At most one toast per error kind at a time: a second failure of the
 * same kind while one shows adds nothing.
 */
export function reportCoachError(error: CoachErrorDto | undefined, { retry, background }: { retry?: () => void; background?: boolean } = {}) {
  const shown = error && coachToast(error, { background, retry: Boolean(retry) });
  if (!error || !shown) return false;
  const id = `coach-error-${error.code}`;
  if (open.has(id)) return true;
  open.add(id);
  const act: Record<CoachToastAction, () => void> = {
    retry: () => retry?.(),
    "sign-in": () => void signInAgain(retry),
    "update-key": () => wiring?.openCard(error.provider),
    settings: () => wiring?.openCard(null),
  };
  toasts.add({
    id, type: "error", priority: "high", title: shown.title, description: shown.description,
    onRemove: () => { open.delete(id); },
    // Reached with F6 then Tab, like every toast action (ui toast.tsx).
    ...(shown.action && { actionProps: { children: coachActionLabels[shown.action], onClick: () => { toasts.close(id); act[shown.action!](); } } }),
  });
  return true;
}

/**
 * The ChatGPT sign-in straight from the toast, as the card's Sign in button: the
 * Mac app opens the browser and waits on its loopback listener; the web on
 * localhost opens a tab and rereads the Coach until it is signed in. The web
 * elsewhere needs the pasted address, so its card opens and starts there.
 * Once signed in, the failed request runs again.
 */
async function signInAgain(retry?: () => void) {
  if (!wiring) return;
  const { transport, cache, userId, openCard } = wiring;
  const started = await transport.startChatgpt().catch(() => null);
  if (!started?.authorizeUrl || !started.mode || started.mode === "paste") return openCard("chatgpt", started?.mode === "paste" ? "chatgpt-sign-in" : undefined);
  if (started.mode !== "loopback") transport.openChatgpt(started.authorizeUrl);
  toasts.add({ id: "coach-signing-in", title: "Finish signing in to ChatGPT", description: "Sign in on OpenAI's page in your browser; todalo continues when you are done.", timeout: 0 });
  const signedIn = started.mode === "loopback"
    ? (await transport.finishChatgpt().catch(() => null))?.status === "signed_in"
    : await signedInSoon(transport);
  toasts.close("coach-signing-in");
  await cache.invalidateQueries({ queryKey: ["user", userId, "coach"] });
  if (!signedIn) {
    toasts.add({ type: "error", title: "ChatGPT sign-in didn't finish", description: "Try again from Settings › Coach.", actionProps: { children: coachActionLabels.settings, onClick: () => openCard("chatgpt") } });
    return;
  }
  expiryShown = false;
  toasts.add({ title: "Signed in to ChatGPT", description: retry ? "Trying again…" : "The Coach runs on your ChatGPT plan again." });
  retry?.();
}

/** Web on localhost: the API's callback page signs in; this rereads the Coach every 2 s, for up to 10 minutes. */
async function signedInSoon(transport: CoachTransport) {
  for (let waited = 0; waited < 10 * 60_000; waited += 2_000) {
    await new Promise(resolve => setTimeout(resolve, 2_000));
    if ((await transport.get().catch(() => null))?.chatgpt?.status === "signed_in") return true;
  }
  return false;
}

let expiryShown = false;
/**
 * The ChatGPT sign-in is found expired when the Coach state is read (the server
 * refreshes the token there). When ChatGPT is the user's pick and no other
 * provider took over, the Coach is off: say so once per app run, with Sign in
 * again. When another provider took over, Settings' quiet note stays the only sign.
 */
export function noticeCoachState(state: CoachDto) {
  if (state.chatgpt?.status === "signed_in") { expiryShown = false; return; }
  if (expiryShown || state.selected !== "chatgpt" || state.chatgpt?.status !== "expired" || state.provider) return;
  expiryShown = reportCoachError({ code: "auth_expired", provider: "chatgpt", retryable: false, message: "ChatGPT signed you out." });
}
