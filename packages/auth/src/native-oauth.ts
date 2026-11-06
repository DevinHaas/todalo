import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { deleteSessionCookie, setSessionCookie } from "better-auth/cookies";
import { generateState } from "better-auth/oauth2";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import * as z from "zod";

// Native Google handoff. The app opens `authorizeURL` in the system browser;
// Better Auth's existing /callback/google runs unchanged; the app only ever
// receives a short-lived, single-use code bound to its PKCE-style verifier.
// Every endpoint lives under /api/auth, so any host mounting auth.handler
// (legacy Next and Elysia) serves the browser leg next to the Google callback.

export const NATIVE_APP_REDIRECT = "app.todalo.client://oauth/callback";
const ATTEMPT_TTL_MS = 10 * 60_000; // matches Better Auth's OAuth state lifetime
const CODE_TTL_MS = 2 * 60_000; // long enough for a cold app launch
const token = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/);
const key = { attempt: (id: string) => `native-oauth:attempt:${id}`, started: (id: string) => `native-oauth:started:${id}`, code: (id: string) => `native-oauth:code:${id}` };

type Intent = "sign-in" | "link";
interface Attempt { intent: Intent; challenge: string; state: string; userId?: string; email?: string; startedAt?: number }
interface Handoff { intent: Intent; challenge: string; userId: string }

const random = () => randomBytes(32).toString("base64url");
const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Only safe, fixed codes reach the app; provider error text is never forwarded.
const appErrors: Record<string, string> = {
  access_denied: "cancelled",
  account_already_linked_to_different_user: "already_linked",
  // Better Auth refuses implicit linking to an unverified local account.
  account_not_linked: "not_linked",
};
const appError = (error: string) => appErrors[error] ?? "failed";

export function nativeOAuth(options: { appRedirect?: string } = {}) {
  const appRedirect = new URL(options.appRedirect ?? NATIVE_APP_REDIRECT);
  if (appRedirect.search || appRedirect.hash || ["http:", "javascript:", "data:"].includes(appRedirect.protocol)) {
    throw new Error("Native OAuth redirect must be a fixed app scheme or HTTPS universal link");
  }
  const toApp = (params: Record<string, string>) => `${appRedirect.href}?${new URLSearchParams(params)}`;
  // A page rather than a bare 302: the browser asks to open the app, and the
  // link stays tappable if that prompt is dismissed or the app was not running
  // (tao 0.37 drops the URL that cold-launches an iOS scene; a second tap
  // reaches the now-running app). The code is single-use and verifier-bound.
  const returnPage = (params: Record<string, string>) => {
    const href = toApp(params).replaceAll("&", "&amp;");
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="0;url=${href}"><title>Return to todalo</title><p><a id="return" href="${href}">Return to todalo</a></p>`, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'" },
    });
  };
  const unavailable = () => new Response("This sign-in link expired or was already used. Return to todalo and try again.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

  return {
    id: "native-oauth",
    endpoints: {
      nativeOAuthBegin: createAuthEndpoint("/native-oauth/begin", {
        method: "POST",
        body: z.object({ intent: z.enum(["sign-in", "link"]), challenge: token, state: token }),
      }, async (ctx) => {
        let link: Pick<Attempt, "userId" | "email"> = {};
        if (ctx.body.intent === "link") {
          // Linking is a native bearer operation; a browser cookie alone cannot
          // start it (the browser keeps using Better Auth's /link-social).
          if (!ctx.request?.headers.get("authorization")?.startsWith("Bearer ")) throw new APIError("UNAUTHORIZED");
          const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
          if (!session) throw new APIError("UNAUTHORIZED");
          link = { userId: session.user.id, email: session.user.email };
        }
        const id = random();
        const attempt: Attempt = { intent: ctx.body.intent, challenge: ctx.body.challenge, state: ctx.body.state, ...link };
        await ctx.context.internalAdapter.createVerificationValue({ identifier: key.attempt(id), value: JSON.stringify(attempt), expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS) });
        ctx.setHeader("cache-control", "no-store");
        return ctx.json({ authorizeURL: `${ctx.context.baseURL}/native-oauth/authorize?attempt=${id}` });
      }),

      nativeOAuthAuthorize: createAuthEndpoint("/native-oauth/authorize", {
        method: "GET",
        query: z.object({ attempt: token }),
      }, async (ctx) => {
        const row = await ctx.context.internalAdapter.consumeVerificationValue(key.attempt(ctx.query.attempt));
        if (!row) return unavailable();
        const attempt: Attempt = { ...JSON.parse(row.value), startedAt: Date.now() };
        const provider = ctx.context.socialProviders.find((item) => item.id === "google");
        if (!provider) throw new APIError("NOT_FOUND");
        await ctx.context.internalAdapter.createVerificationValue({ identifier: key.started(ctx.query.attempt), value: JSON.stringify(attempt), expiresAt: row.expiresAt });
        const complete = `${ctx.context.baseURL}/native-oauth/complete?attempt=${ctx.query.attempt}`;
        // Same state/cookie path as signInSocial/linkSocial; the state cookie
        // lands in this browser, where Google's callback will return.
        const { state, codeVerifier } = await generateState(
          { ...ctx, body: { callbackURL: complete, errorCallbackURL: complete } } as unknown as Parameters<typeof generateState>[0],
          attempt.intent === "link" ? { userId: attempt.userId!, email: attempt.email! } : undefined,
          undefined,
        );
        const url = await provider.createAuthorizationURL({ state, codeVerifier, redirectURI: `${ctx.context.baseURL}/callback/${provider.id}` });
        ctx.setHeader("cache-control", "no-store");
        throw ctx.redirect(url.toString());
      }),

      nativeOAuthComplete: createAuthEndpoint("/native-oauth/complete", {
        method: "GET",
        query: z.object({ attempt: token, error: z.string().max(200).optional() }),
      }, async (ctx) => {
        const row = await ctx.context.internalAdapter.consumeVerificationValue(key.started(ctx.query.attempt));
        if (!row) return unavailable();
        const attempt: Attempt = JSON.parse(row.value);
        ctx.setHeader("cache-control", "no-store");
        if (ctx.query.error) return returnPage({ state: attempt.state, error: appError(ctx.query.error) });
        let userId = attempt.userId;
        if (attempt.intent === "sign-in") {
          const browser = await getSessionFromCtx(ctx, { disableCookieCache: true });
          // Only the session Google's callback just created counts; a session
          // this browser already had must not be handed to the app.
          if (!browser || new Date(browser.session.createdAt).getTime() < attempt.startedAt!) {
            return returnPage({ state: attempt.state, error: "failed" });
          }
          userId = browser.user.id;
          // The app gets its own session; don't leave a new one in the browser.
          await ctx.context.internalAdapter.deleteSession(browser.session.token);
          deleteSessionCookie(ctx);
        } else {
          const accounts = await ctx.context.internalAdapter.findAccounts(userId!);
          if (!accounts.some((account) => account.providerId === "google")) return returnPage({ state: attempt.state, error: "failed" });
        }
        const code = random();
        const handoff: Handoff = { intent: attempt.intent, challenge: attempt.challenge, userId: userId! };
        await ctx.context.internalAdapter.createVerificationValue({ identifier: key.code(code), value: JSON.stringify(handoff), expiresAt: new Date(Date.now() + CODE_TTL_MS) });
        return returnPage({ state: attempt.state, code });
      }),

      nativeOAuthExchange: createAuthEndpoint("/native-oauth/exchange", {
        method: "POST",
        body: z.object({ code: token, verifier: token }),
      }, async (ctx) => {
        ctx.setHeader("cache-control", "no-store");
        // Consumed before verification: a wrong verifier also burns the code.
        const row = await ctx.context.internalAdapter.consumeVerificationValue(key.code(ctx.body.code));
        const handoff: Handoff | null = row ? JSON.parse(row.value) : null;
        if (!handoff || !sameText(challengeOf(ctx.body.verifier), handoff.challenge)) {
          throw new APIError("BAD_REQUEST", { code: "HANDOFF_INVALID", message: "Sign-in could not be completed. Try again." });
        }
        if (handoff.intent === "link") return ctx.json({ intent: "link" as const });
        const user = await ctx.context.internalAdapter.findUserById(handoff.userId);
        if (!user) throw new APIError("BAD_REQUEST", { code: "HANDOFF_INVALID", message: "Sign-in could not be completed. Try again." });
        const session = await ctx.context.internalAdapter.createSession(user.id);
        // The bearer plugin turns this session cookie into `set-auth-token`.
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ intent: "sign-in" as const });
      }),
    },
  } satisfies BetterAuthPlugin;
}
