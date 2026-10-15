//! Google sign-in/linking through the system browser and an app-scheme return.
//!
//! The webview only starts, awaits or cancels a flow and receives account
//! identity. Rust owns the verifier, state and handoff code: the verifier and
//! state live in Apple Keychain while the browser is open (so a cold launch can
//! finish the flow), the returned link is accepted once and only for the
//! matching state, and the single-use code is exchanged over the API transport
//! for a signed session that goes straight to Keychain. Nothing here logs.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use tokio::sync::{Mutex, Notify};
use zeroize::Zeroizing;

use crate::auth::{Account, NativeAuth};
use crate::credentials;

pub const SCHEME: &str = "app.todalo.client";
const AUTHORIZE_PATH: &str = "/api/auth/native-oauth/authorize";
/// Matches the server attempt lifetime (and Better Auth's OAuth state).
const PENDING_SECS: u64 = 600;

const UNAVAILABLE: &str = "Cannot open Google sign-in. Try again.";
const CANCELLED: &str = "Google sign-in was cancelled.";
const EXPIRED: &str = "Google sign-in took too long. Try again.";
const NOT_LINKED: &str = "This email already has a todalo account. Sign in with your password, then link Google from your account.";
const ALREADY_LINKED: &str = "That Google account is already linked to a different todalo account.";
const FAILED: &str = "Google sign-in could not be completed. Try again.";
const NO_SESSION: &str = "Your account could not be loaded. Try signing in again.";

#[derive(Clone, Copy, PartialEq, Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Intent {
    SignIn,
    Link,
}

#[derive(Deserialize, Serialize)]
struct Pending {
    intent: Intent,
    state: String,
    verifier: String,
    expires_at: u64,
}

#[derive(Serialize)]
pub struct Outcome {
    account: Account,
    linked: bool,
}

/// `POST /api/auth/native-oauth/begin` response.
#[derive(Deserialize)]
struct Begin {
    #[serde(rename = "authorizeURL")]
    authorize_url: String,
}

#[derive(Debug, PartialEq)]
enum Returned {
    Code(String),
    Error(String),
}

#[derive(Debug, PartialEq)]
struct Callback {
    state: String,
    returned: Returned,
}

#[derive(Default)]
pub struct GoogleFlow {
    outcome: Mutex<Option<Result<Outcome, &'static str>>>,
    changed: Notify,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

fn random_token() -> Result<String, &'static str> {
    let mut bytes = Zeroizing::new([0u8; 32]);
    getrandom::fill(bytes.as_mut()).map_err(|_| UNAVAILABLE)?;
    Ok(URL_SAFE_NO_PAD.encode(bytes.as_ref()))
}

fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn is_token(value: &str) -> bool {
    (43..=128).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn same(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0, |acc, (x, y)| acc | (x ^ y))
            == 0
}

/// Accepts only `app.todalo.client://oauth/callback?state=…&(code=…|error=…)`.
fn parse_callback(raw: &str) -> Option<Callback> {
    let url = Url::parse(raw).ok()?;
    if url.scheme() != SCHEME
        || url.host_str() != Some("oauth")
        || url.path() != "/callback"
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.port().is_some()
    {
        return None;
    }
    let (mut state, mut code, mut error) = (None, None, None);
    for (name, value) in url.query_pairs() {
        let slot = match name.as_ref() {
            "state" => &mut state,
            "code" => &mut code,
            "error" => &mut error,
            _ => return None,
        };
        if slot.replace(value.into_owned()).is_some() {
            return None;
        }
    }
    let state = state.filter(|value| is_token(value))?;
    let returned = match (code, error) {
        (Some(code), None) if is_token(&code) => Returned::Code(code),
        (None, Some(error))
            if error.len() <= 32 && error.bytes().all(|b| b.is_ascii_lowercase() || b == b'_') =>
        {
            Returned::Error(error)
        }
        _ => return None,
    };
    Some(Callback { state, returned })
}

/// The browser may only be sent to the server's authorize endpoint.
fn authorize_url(raw: &str, development: bool) -> Result<Url, &'static str> {
    let url = Url::parse(raw).map_err(|_| UNAVAILABLE)?;
    let loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    let attempt = url.query_pairs().collect::<Vec<_>>();
    let allowed_scheme =
        url.scheme() == "https" || (development && loopback && url.scheme() == "http");
    if !allowed_scheme
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != AUTHORIZE_PATH
        || url.fragment().is_some()
        || attempt.len() != 1
        || attempt[0].0 != "attempt"
        || !is_token(&attempt[0].1)
    {
        return Err(UNAVAILABLE);
    }
    Ok(url)
}

fn returned_error(code: &str) -> &'static str {
    match code {
        "cancelled" => CANCELLED,
        "not_linked" => NOT_LINKED,
        "already_linked" => ALREADY_LINKED,
        _ => FAILED,
    }
}

fn pending_key(origin: &str) -> String {
    format!("{origin}#google-pending")
}

fn read_pending(origin: &str) -> Result<Option<Pending>, &'static str> {
    Ok(credentials::read(&pending_key(origin))?
        .and_then(|value| serde_json::from_str::<Pending>(&value).ok()))
}

fn clear_pending(origin: &str) -> Result<(), &'static str> {
    credentials::clear(&pending_key(origin))
}

impl GoogleFlow {
    async fn publish(&self, outcome: Option<Result<Outcome, &'static str>>) {
        *self.outcome.lock().await = outcome;
        self.changed.notify_waiters();
    }

    pub async fn start(
        &self,
        auth: &NativeAuth,
        app: &AppHandle,
        intent: Intent,
    ) -> Result<(), &'static str> {
        use tauri_plugin_opener::OpenerExt;
        let origin = auth.origin()?;
        let (state, verifier) = (random_token()?, Zeroizing::new(random_token()?));
        let mut request = auth
            .client
            .post(auth.url("/api/auth/native-oauth/begin")?)
            .json(&serde_json::json!({ "intent": intent, "challenge": challenge(&verifier), "state": state }));
        if intent == Intent::Link {
            let token = credentials::read(&origin)?.ok_or(NO_SESSION)?;
            request = request.bearer_auth(&*token);
        }
        let response = request.send().await.map_err(|_| UNAVAILABLE)?;
        if !response.status().is_success() {
            return Err(UNAVAILABLE);
        }
        let begin = response.json::<Begin>().await.map_err(|_| UNAVAILABLE)?;
        let url = authorize_url(&begin.authorize_url, cfg!(debug_assertions))?;
        let pending = Zeroizing::new(
            serde_json::to_string(&Pending {
                intent,
                state,
                verifier: verifier.to_string(),
                expires_at: now() + PENDING_SECS,
            })
            .map_err(|_| UNAVAILABLE)?,
        );
        // Replaces any earlier flow; its waiters see the new one.
        credentials::write(&pending_key(&origin), &pending)?;
        self.publish(None).await;
        app.opener()
            .open_url(url.as_str(), None::<&str>)
            .map_err(|_| UNAVAILABLE)
    }

    /// Waits for the pending flow's result; `None` when nothing is pending.
    pub async fn finish(&self, auth: &NativeAuth) -> Result<Option<Outcome>, &'static str> {
        let origin = auth.origin()?;
        loop {
            let changed = self.changed.notified();
            let mut changed = std::pin::pin!(changed);
            changed.as_mut().enable();
            if let Some(outcome) = self.outcome.lock().await.take() {
                return outcome.map(Some);
            }
            let Some(pending) = read_pending(&origin)? else {
                return Ok(None);
            };
            let remaining = pending.expires_at.saturating_sub(now());
            if remaining == 0 {
                clear_pending(&origin)?;
                return Err(EXPIRED);
            }
            let _ = tokio::time::timeout(Duration::from_secs(remaining), changed).await;
        }
    }

    pub async fn cancel(&self, auth: &NativeAuth) -> Result<(), &'static str> {
        clear_pending(&auth.origin()?)?;
        self.publish(None).await;
        Ok(())
    }

    /// Handles one returned app link. Forged, stale or replayed links (no
    /// pending flow or a different state) are ignored without side effects.
    async fn returned(&self, auth: &NativeAuth, raw: &str) {
        let Some(callback) = parse_callback(raw) else {
            return;
        };
        let _gate = auth.gate.lock().await;
        let Ok(origin) = auth.origin() else { return };
        let Ok(pending) = read_pending(&origin) else {
            return;
        };
        let decision = decide(pending.as_ref(), &callback, now());
        let Some(pending) = pending.filter(|_| decision != Decision::Ignore) else {
            return;
        };
        // Single use on this device before any network work.
        if clear_pending(&origin).is_err() {
            return;
        }
        let outcome = match decision {
            Decision::Exchange(code) => exchange(auth, &origin, &pending, code).await,
            Decision::Fail(error) => Err(error),
            Decision::Ignore => unreachable!(),
        };
        self.publish(Some(outcome)).await;
    }
}

#[derive(Debug, PartialEq)]
enum Decision<'a> {
    /// No flow, or another flow's state: replayed, stale or forged.
    Ignore,
    Fail(&'static str),
    Exchange(&'a str),
}

fn decide<'a>(pending: Option<&Pending>, callback: &'a Callback, now: u64) -> Decision<'a> {
    match pending {
        Some(pending) if same(&pending.state, &callback.state) => {
            if pending.expires_at <= now {
                Decision::Fail(EXPIRED)
            } else {
                match &callback.returned {
                    Returned::Error(code) => Decision::Fail(returned_error(code)),
                    Returned::Code(code) => Decision::Exchange(code),
                }
            }
        }
        _ => Decision::Ignore,
    }
}

async fn exchange(
    auth: &NativeAuth,
    origin: &str,
    pending: &Pending,
    code: &str,
) -> Result<Outcome, &'static str> {
    let response = auth
        .client
        .post(auth.url("/api/auth/native-oauth/exchange")?)
        .json(&serde_json::json!({ "code": code, "verifier": pending.verifier }))
        .send()
        .await
        .map_err(|_| FAILED)?;
    if !response.status().is_success() {
        return Err(FAILED);
    }
    if pending.intent == Intent::Link {
        let token = credentials::read(origin)?.ok_or(NO_SESSION)?;
        let account = auth.identity(&token).await?.ok_or(NO_SESSION)?;
        return Ok(Outcome {
            account,
            linked: true,
        });
    }
    let token = Zeroizing::new(
        response
            .headers()
            .get("set-auth-token")
            .and_then(|value| value.to_str().ok())
            .filter(|value| value.contains('.'))
            .ok_or(FAILED)?
            .to_owned(),
    );
    drop(response);
    let Ok(Some(account)) = auth.identity(&token).await else {
        let _ = auth.revoke(&token).await;
        return Err(FAILED);
    };
    if let Err(error) = credentials::write(origin, &token) {
        let _ = auth.revoke(&token).await;
        return Err(error);
    }
    Ok(Outcome {
        account,
        linked: false,
    })
}

/// Deep-link entry point for both cold launch (`get_current`) and warm returns.
pub fn handle(app: &AppHandle, urls: Vec<String>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        for url in urls {
            app.state::<GoogleFlow>()
                .returned(&app.state::<NativeAuth>(), &url)
                .await;
        }
    });
}

#[tauri::command]
pub async fn google_start(
    app: AppHandle,
    auth: State<'_, NativeAuth>,
    flow: State<'_, GoogleFlow>,
    intent: Intent,
) -> Result<(), String> {
    let _gate = auth.gate.lock().await;
    flow.start(&auth, &app, intent).await.map_err(str::to_owned)
}

#[tauri::command]
pub async fn google_finish(
    auth: State<'_, NativeAuth>,
    flow: State<'_, GoogleFlow>,
) -> Result<Option<Outcome>, String> {
    // Deliberately not gated: the returning link needs the gate to finish.
    flow.finish(&auth).await.map_err(str::to_owned)
}

#[tauri::command]
pub async fn google_cancel(
    auth: State<'_, NativeAuth>,
    flow: State<'_, GoogleFlow>,
) -> Result<(), String> {
    let _gate = auth.gate.lock().await;
    flow.cancel(&auth).await.map_err(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    const STATE: &str = "s0000000000000000000000000000000000000000000";
    const CODE: &str = "c0000000000000000000000000000000000000000000";

    #[test]
    fn verifier_challenge_matches_the_server_s256_encoding() {
        // RFC 7636 appendix B test vector.
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        let token = random_token().unwrap();
        assert!(is_token(&token));
        assert_ne!(token, random_token().unwrap());
    }

    #[test]
    fn accepts_only_the_registered_callback_shape() {
        let ok = format!("{SCHEME}://oauth/callback?state={STATE}&code={CODE}");
        assert_eq!(
            parse_callback(&ok),
            Some(Callback {
                state: STATE.into(),
                returned: Returned::Code(CODE.into())
            })
        );
        let cancelled = format!("{SCHEME}://oauth/callback?state={STATE}&error=cancelled");
        assert_eq!(
            parse_callback(&cancelled).map(|c| c.returned),
            Some(Returned::Error("cancelled".into()))
        );
        for bad in [
            format!("https://oauth/callback?state={STATE}&code={CODE}"),
            format!("{SCHEME}://evil/callback?state={STATE}&code={CODE}"),
            format!("{SCHEME}://oauth/other?state={STATE}&code={CODE}"),
            format!("{SCHEME}://oauth/callback?code={CODE}"),
            format!("{SCHEME}://oauth/callback?state={STATE}"),
            format!("{SCHEME}://oauth/callback?state={STATE}&code={CODE}&error=failed"),
            format!("{SCHEME}://oauth/callback?state={STATE}&code={CODE}&code={CODE}"),
            format!("{SCHEME}://oauth/callback?state={STATE}&code={CODE}&token=x"),
            format!("{SCHEME}://oauth/callback?state=short&code={CODE}"),
            format!("{SCHEME}://oauth/callback?state={STATE}&error=Raw%20Provider%20Text"),
            format!("{SCHEME}://oauth/callback?state={STATE}&code={CODE}#frag"),
        ] {
            assert_eq!(parse_callback(&bad), None, "{bad}");
        }
    }

    #[test]
    fn browser_is_only_sent_to_the_authorize_endpoint() {
        let attempt = format!("attempt={CODE}");
        assert!(
            authorize_url(
                &format!("https://todalo.example/api/auth/native-oauth/authorize?{attempt}"),
                false
            )
            .is_ok()
        );
        assert!(
            authorize_url(
                &format!("http://localhost:5173/api/auth/native-oauth/authorize?{attempt}"),
                true
            )
            .is_ok()
        );
        for bad in [
            format!("http://localhost:5173/api/auth/native-oauth/authorize?{attempt}"),
            format!("http://todalo.example/api/auth/native-oauth/authorize?{attempt}"),
            format!("https://todalo.example/api/auth/sign-out?{attempt}"),
            format!("https://u:p@todalo.example/api/auth/native-oauth/authorize?{attempt}"),
            format!("https://todalo.example/api/auth/native-oauth/authorize?{attempt}&x=1"),
            "javascript:alert(1)".to_owned(),
        ] {
            assert!(authorize_url(&bad, false).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_returned_link_is_bound_to_the_pending_state_and_expiry() {
        let pending = Pending {
            intent: Intent::SignIn,
            state: STATE.into(),
            verifier: CODE.into(),
            expires_at: 1_000,
        };
        let back = |state: &str, returned| Callback {
            state: state.into(),
            returned,
        };
        let ok = back(STATE, Returned::Code(CODE.into()));
        assert_eq!(decide(Some(&pending), &ok, 999), Decision::Exchange(CODE));
        // Replay after the pending flow was consumed, or no flow at all.
        assert_eq!(decide(None, &ok, 999), Decision::Ignore);
        // A link for some other flow (or forged) never touches this one.
        let other = back(CODE, Returned::Code(CODE.into()));
        assert_eq!(decide(Some(&pending), &other, 999), Decision::Ignore);
        assert_eq!(decide(Some(&pending), &ok, 1_000), Decision::Fail(EXPIRED));
        let cancelled = back(STATE, Returned::Error("cancelled".into()));
        assert_eq!(
            decide(Some(&pending), &cancelled, 999),
            Decision::Fail(CANCELLED)
        );
    }

    #[test]
    fn reads_the_server_begin_response() {
        let begin: Begin =
            serde_json::from_str(r#"{"authorizeURL":"https://a.example/x"}"#).unwrap();
        assert_eq!(begin.authorize_url, "https://a.example/x");
    }

    #[test]
    fn pending_flow_serializes_the_server_intent_names() {
        let json = serde_json::to_string(&Intent::SignIn).unwrap();
        assert_eq!(json, "\"sign-in\"");
        assert_eq!(serde_json::to_string(&Intent::Link).unwrap(), "\"link\"");
    }

    #[test]
    fn returned_errors_map_to_fixed_copy_only() {
        assert_eq!(returned_error("cancelled"), CANCELLED);
        assert_eq!(returned_error("not_linked"), NOT_LINKED);
        assert_eq!(returned_error("already_linked"), ALREADY_LINKED);
        assert_eq!(returned_error("anything_else"), FAILED);
        assert!(same(STATE, STATE));
        assert!(!same(STATE, CODE));
        assert!(!same(STATE, "s"));
    }
}
