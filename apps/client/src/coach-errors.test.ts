import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoachErrorDto } from "../../../packages/server/src/coach";
import { coachActionLabels, coachToast, noticeCoachState, reportCoachError } from "./coach-errors";
import { toasts } from "./toasts";

const error = (code: CoachErrorDto["code"], provider: CoachErrorDto["provider"] = "openai"): CoachErrorDto =>
  ({ code, provider, retryable: ["rate_limited", "overloaded", "network"].includes(code), message: "Why it failed." });

describe("coachToast", () => {
  // [code, provider, asked by the user (with Retry) → action, background read → action or "none"]
  it.each([
    ["auth_expired", "chatgpt", "sign-in", "sign-in"],
    ["bad_key", "openai", "update-key", "update-key"],
    ["bad_key", "ollama", "settings", "settings"],
    ["no_credit", "anthropic", "settings", "settings"],
    ["rate_limited", "openrouter", "retry", "none"],
    ["overloaded", "anthropic", "retry", "none"],
    ["network", "ollama", "retry", "none"],
    ["refused", "chatgpt", "settings", "none"],
    ["invalid", "openai", "settings", "none"],
  ] as const)("%s from %s: %s when asked, %s in the background", (code, provider, asked, background) => {
    expect(coachToast(error(code, provider), { retry: true })?.action).toBe(asked);
    const quiet = coachToast(error(code, provider), { background: true });
    expect(quiet === null ? "none" : quiet.action).toBe(background);
  });

  it("names the provider and says the server already tried 5 times", () => {
    expect(coachToast(error("bad_key", "anthropic"))!.title).toBe("Anthropic rejected the API key");
    expect(coachToast(error("auth_expired", "chatgpt"))!.title).toBe("ChatGPT sign-in expired");
    expect(coachToast(error("overloaded"), { retry: true })!.description).toBe("Why it failed. todalo tried 5 times.");
    // Without a way to run it again, a transient failure toasts without Retry.
    expect(coachToast(error("network"))!.action).toBeNull();
  });
});

describe("reportCoachError", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("shows one toast per error kind at a time, with the action's label", () => {
    const add = vi.spyOn(toasts, "add").mockReturnValue("id");
    const retry = vi.fn();
    expect(reportCoachError(error("rate_limited"), { retry })).toBe(true);
    expect(reportCoachError(error("rate_limited"), { retry })).toBe(true);
    expect(add).toHaveBeenCalledTimes(1);
    const shown = add.mock.calls[0]![0];
    expect(shown).toMatchObject({ id: "coach-error-rate_limited", type: "error", title: "The Coach is rate limited" });
    expect(shown.actionProps?.children).toBe(coachActionLabels.retry);
    vi.spyOn(toasts, "close").mockImplementation(() => {});
    (shown.actionProps!.onClick as () => void)();
    expect(retry).toHaveBeenCalledOnce();
    // Once it is gone, the same kind can toast again.
    shown.onRemove!();
    reportCoachError(error("rate_limited"), { retry });
    expect(add).toHaveBeenCalledTimes(2);
  });

  it("says nothing without an error or for a quiet background failure", () => {
    const add = vi.spyOn(toasts, "add").mockReturnValue("id");
    expect(reportCoachError(undefined)).toBe(false);
    expect(reportCoachError(error("overloaded"), { background: true })).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it("announces an expired ChatGPT sign-in once, only when nothing took over", () => {
    const add = vi.spyOn(toasts, "add").mockReturnValue("id");
    const state = { selected: "chatgpt" as const, providers: [], chatgpt: { status: "expired" as const, email: null, model: "gpt-5.5" } };
    noticeCoachState({ ...state, provider: { provider: "openai", model: "m", baseUrl: null, keyHint: "1234" } });
    expect(add).not.toHaveBeenCalled();
    noticeCoachState({ ...state, provider: null });
    noticeCoachState({ ...state, provider: null });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]![0]).toMatchObject({ id: "coach-error-auth_expired", title: "ChatGPT sign-in expired" });
  });
});
