// Test/QA-only stand-in for Google's two network legs. Better Auth's real
// Google provider still builds the authorization URL, runs /callback/google
// and decodes the ID token; only accounts.google.com consent and the token
// endpoint are simulated. Never imported by production entry points.

export interface FakeGoogleProfile { sub: string; email: string; name: string }

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** What Google would redirect the browser to after consent (or cancellation). */
export function fakeGoogleConsent(authorizationURL: string, outcome: FakeGoogleProfile | "cancel") {
  const url = new URL(authorizationURL);
  if (url.origin + url.pathname !== GOOGLE_AUTHORIZE) throw new Error("Not a Google authorization URL");
  const back = new URL(url.searchParams.get("redirect_uri")!);
  back.searchParams.set("state", url.searchParams.get("state")!);
  if (outcome === "cancel") back.searchParams.set("error", "access_denied");
  else back.searchParams.set("code", `fake.${encode(outcome)}`);
  return back.toString();
}

const CONSENT_PATH = "/api/fake-google/authorize";
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Manual-QA HTTP wrapper: serves a local consent page and points every
 * Google authorization redirect/URL at it instead of accounts.google.com.
 */
export function withFakeGoogleConsent(handle: (request: Request) => Promise<Response> | Response) {
  return async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === CONSENT_PATH) {
      const google = `${GOOGLE_AUTHORIZE}${url.search}`;
      const choice = (label: string, outcome: FakeGoogleProfile | "cancel") => `<p><a href="${escape(fakeGoogleConsent(google, outcome))}">${escape(label)}</a></p>`;
      return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>Fake Google</title><h1>Fake Google (QA only)</h1>
${choice("Continue as Google QA User (google-qa@example.test)", { sub: "google-qa", email: "google-qa@example.test", name: "Google QA User" })}
${choice("Continue as existing@example.test", { sub: "google-existing", email: "existing@example.test", name: "Development User" })}
${choice("Cancel", "cancel")}`, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    const response = await handle(request);
    const location = response.headers.get("location");
    const social = /\/(sign-in\/social|link-social)$/.test(url.pathname);
    if (!location?.startsWith(GOOGLE_AUTHORIZE) && !social) return response;
    // Social sign-in answers with both a Location header and a JSON `url`.
    const local = (value: string) => value.replaceAll(GOOGLE_AUTHORIZE, CONSENT_PATH);
    const headers = new Headers(response.headers);
    if (location) headers.set("location", local(location));
    headers.delete("content-length");
    return new Response(social ? local(await response.text()) : response.body, { status: response.status, headers });
  };
}

/** Wraps fetch so Google's token endpoint returns an unsigned ID token for the consented profile. */
export function fakeGoogleFetch(real: typeof fetch): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== TOKEN_ENDPOINT) return real(input, init);
    const code = new URLSearchParams(String(init?.body ?? "")).get("code") ?? "";
    if (!code.startsWith("fake.")) return Response.json({ error: "invalid_grant" }, { status: 400 });
    const profile = JSON.parse(Buffer.from(code.slice(5), "base64url").toString()) as FakeGoogleProfile;
    const idToken = `${encode({ alg: "none", typ: "JWT" })}.${encode({ ...profile, email_verified: true, iss: "https://accounts.google.com" })}.`;
    return Response.json({ access_token: `fake-google-access-${profile.sub}`, refresh_token: `fake-google-refresh-${profile.sub}`, id_token: idToken, expires_in: 3600, token_type: "Bearer", scope: "openid email profile" });
  }) as typeof fetch;
}
