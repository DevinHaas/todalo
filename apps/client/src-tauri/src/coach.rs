// Narrow Coach commands (goals ticket 17): one fixed method and path each; the
// provider body is rebuilt from typed fields so the webview cannot add a user
// ID or reach another path. The API key passes through to the server, which
// encrypts it; it is never stored here or returned.
use crate::auth::NativeAuth;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const INVALID: &str = "Check your entry and try again.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoachProvider {
    provider: String,
    model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_key: Option<String>,
}

const KEYED: [&str; 4] = ["openai", "anthropic", "openrouter", "ollama"];

/// Ticket 17c: `?provider=<kind>` for one provider's card; only a known kind
/// (and "chatgpt" where allowed), so the webview cannot change the path.
fn named(path: &str, provider: Option<String>, chatgpt: bool) -> Result<String, String> {
    match provider {
        None => Ok(path.to_owned()),
        Some(kind) if KEYED.contains(&kind.as_str()) || (chatgpt && kind == "chatgpt") => {
            Ok(format!("{path}?provider={kind}"))
        }
        Some(_) => Err(INVALID.to_owned()),
    }
}

fn provider_body(provider: CoachProvider) -> Result<Value, &'static str> {
    if !KEYED.contains(&provider.provider.as_str())
        || provider.model.trim().is_empty()
        || provider.model.len() > 200
        || provider
            .base_url
            .as_ref()
            .is_some_and(|url| url.len() > 500)
        || provider.api_key.as_ref().is_some_and(|key| key.len() > 500)
    {
        return Err(INVALID);
    }
    serde_json::to_value(provider).map_err(|_| INVALID)
}

/// The connected provider (key shown only as its last four characters), or null.
#[tauri::command]
pub async fn coach(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/coach")
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[tauri::command]
pub async fn save_coach_provider(
    state: tauri::State<'_, NativeAuth>,
    provider: CoachProvider,
) -> Result<Value, String> {
    let body = provider_body(provider)?;
    state
        .write(Method::PUT, "/api/v1/coach/provider", Some(body))
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// One provider (ticket 17c), or every keyed one when `provider` is omitted.
#[tauri::command]
pub async fn disconnect_coach(
    state: tauri::State<'_, NativeAuth>,
    provider: Option<String>,
) -> Result<Value, String> {
    state
        .write(
            Method::DELETE,
            &named("/api/v1/coach/provider", provider, false)?,
            None,
        )
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// `{ ok, message? }` for the active provider or the named one; null (404) when it is not connected.
#[tauri::command]
pub async fn test_coach(
    state: tauri::State<'_, NativeAuth>,
    provider: Option<String>,
) -> Result<Option<Value>, String> {
    Ok(state
        .write(
            Method::POST,
            &named("/api/v1/coach/provider/test", provider, true)?,
            None,
        )
        .await?)
}

/// Ticket 17c: the provider the Coach uses; null (404) when it is not configured.
#[tauri::command]
pub async fn set_coach_active(
    state: tauri::State<'_, NativeAuth>,
    provider: String,
) -> Result<Option<Value>, String> {
    if !KEYED.contains(&provider.as_str()) && provider != "chatgpt" {
        return Err(INVALID.to_owned());
    }
    Ok(state
        .write(
            Method::PUT,
            "/api/v1/coach/active",
            Some(serde_json::json!({ "provider": provider })),
        )
        .await?)
}

/// Each current-season goal's status explanation, in the webview's timezone.
#[tauri::command]
pub async fn coach_explanations(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
) -> Result<Value, String> {
    state
        .read(&zoned("/api/v1/coach/explanations", time_zone)?)
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// Goals ticket 18: ChatGPT sign-in through the system browser, as T3 Code
/// does it: OpenAI redirects to a one-time listener on 127.0.0.1 (RFC 8252
/// loopback redirect, random port). The server builds OpenAI's page and keeps
/// the PKCE verifier; this only opens the page and forwards the redirect.
#[derive(Default)]
pub struct ChatgptLoopback {
    listener: tokio::sync::Mutex<Option<tokio::net::TcpListener>>,
    /// A newer sign-in ends the wait of an older one.
    superseded: tokio::sync::Notify,
}

/// Only OpenAI's authorize page; the webview cannot make this open anything else.
fn authorize_url(url: &str) -> bool {
    url.starts_with("https://auth.openai.com/api/accounts/authorize?") && url.len() <= 16_384
}

fn open_browser(app: &tauri::AppHandle, url: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| "Cannot open the browser. Try again.".to_owned())
}

/// `{ authorizeUrl, mode: "loopback" }` with the browser opened, or `{ authorizeUrl: null, message }`.
#[tauri::command]
pub async fn start_chatgpt_sign_in(
    app: tauri::AppHandle,
    state: tauri::State<'_, NativeAuth>,
    loopback: tauri::State<'_, ChatgptLoopback>,
) -> Result<Value, String> {
    // iPhone: Safari cannot reach the app's listener while the app is in the background.
    if cfg!(mobile) {
        return Ok(serde_json::json!({
            "authorizeUrl": null,
            "message": "Sign in with ChatGPT on the Mac or on the web; the Coach then uses it here too."
        }));
    }
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|_| "Could not start the sign-in. Try again.".to_owned())?;
    let port = listener.local_addr().map_err(|_| INVALID_RESPONSE)?.port();
    let reply = state
        .write(
            Method::POST,
            "/api/v1/coach/chatgpt/start",
            Some(serde_json::json!({ "port": port })),
        )
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())?;
    if let Some(url) = reply.get("authorizeUrl").and_then(Value::as_str) {
        if !authorize_url(url) {
            return Err(INVALID_RESPONSE.to_owned());
        }
        loopback.superseded.notify_waiters();
        *loopback.listener.lock().await = Some(listener);
        open_browser(&app, url)?;
    }
    Ok(reply)
}

/// Waits (up to 10 minutes, the server's limit) for the browser to come back,
/// then completes the sign-in: `{ status: "signed_in" | "failed", message? }`.
#[tauri::command]
pub async fn finish_chatgpt_sign_in(
    state: tauri::State<'_, NativeAuth>,
    loopback: tauri::State<'_, ChatgptLoopback>,
) -> Result<Value, String> {
    let failed = |message: &str| Ok(serde_json::json!({ "status": "failed", "message": message }));
    let Some(listener) = loopback.listener.lock().await.take() else {
        return failed("Start the sign-in again.");
    };
    let port = listener.local_addr().map_err(|_| INVALID_RESPONSE)?.port();
    let (mut stream, target) = tokio::select! {
        got = tokio::time::timeout(std::time::Duration::from_secs(600), callback(&listener)) => match got {
            Ok(Ok(got)) => got,
            _ => return failed("The sign-in timed out. Start again."),
        },
        _ = loopback.superseded.notified() => return failed("A newer sign-in replaced this one."),
    };
    let result = state
        .write(
            Method::POST,
            "/api/v1/coach/chatgpt/complete",
            Some(serde_json::json!({ "callbackUrl": format!("http://127.0.0.1:{port}{target}") })),
        )
        .await;
    let signed_in = matches!(&result, Ok(Some(reply)) if reply["status"] == "signed_in");
    respond(&mut stream, signed_in).await;
    result?.ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// The first `GET /auth/callback…` request's target; anything else (a favicon) gets a 404.
async fn callback(
    listener: &tokio::net::TcpListener,
) -> std::io::Result<(tokio::net::TcpStream, String)> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    loop {
        let (mut stream, _) = listener.accept().await?;
        let mut head = Vec::new();
        let mut buffer = [0u8; 4096];
        while !head.windows(4).any(|w| w == b"\r\n\r\n") && head.len() < 16_384 {
            match tokio::time::timeout(std::time::Duration::from_secs(5), stream.read(&mut buffer))
                .await
            {
                Ok(Ok(read)) if read > 0 => head.extend_from_slice(&buffer[..read]),
                _ => break,
            }
        }
        if let Some(target) = callback_target(&head) {
            return Ok((stream, target));
        }
        let _ = stream
            .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .await;
    }
}

fn callback_target(head: &[u8]) -> Option<String> {
    let line = std::str::from_utf8(head).ok()?.lines().next()?;
    let mut parts = line.split(' ');
    let (method, target) = (parts.next()?, parts.next()?);
    (method == "GET" && (target == "/auth/callback" || target.starts_with("/auth/callback?")))
        .then(|| target.to_owned())
}

/// The page the browser shows after coming back.
async fn respond(stream: &mut tokio::net::TcpStream, signed_in: bool) {
    use tokio::io::AsyncWriteExt;
    let (title, text) = if signed_in {
        (
            "ChatGPT is connected",
            "The Coach now runs on your ChatGPT plan. You can close this tab and return to todalo.",
        )
    } else {
        (
            "ChatGPT sign-in failed",
            "Return to todalo to see why and try again.",
        )
    };
    let body = format!(
        "<!doctype html><meta charset=\"utf-8\"><title>todalo</title><body style=\"font:16px system-ui;margin:3rem auto;max-width:32rem;padding:0 1rem\"><h1 style=\"font-size:1.25rem\">{title}</h1><p>{text}</p></body>"
    );
    let reply = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(reply.as_bytes()).await;
    let _ = stream.shutdown().await;
}

/// The model the ChatGPT sign-in runs; null (404) when not signed in.
#[tauri::command]
pub async fn save_chatgpt_model(
    state: tauri::State<'_, NativeAuth>,
    model: String,
) -> Result<Option<Value>, String> {
    let model = model.trim();
    if model.is_empty() || model.len() > 200 {
        return Err(INVALID.to_owned());
    }
    Ok(state
        .write(
            Method::PUT,
            "/api/v1/coach/chatgpt",
            Some(serde_json::json!({ "model": model })),
        )
        .await?)
}

#[tauri::command]
pub async fn sign_out_chatgpt(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .write(Method::DELETE, "/api/v1/coach/chatgpt", None)
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// Opens OpenAI's sign-in page again (the tab was closed). OpenAI's authorize page only.
#[tauri::command]
pub fn open_chatgpt_sign_in(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !authorize_url(&url) {
        return Err(INVALID.to_owned());
    }
    open_browser(&app, &url)
}

/// `/api/v1/coach/...?timeZone=…` for the webview's IANA zone.
pub(crate) fn zoned(path: &str, time_zone: String) -> Result<String, String> {
    let query = reqwest::Url::parse_with_params("http://x/", [("timeZone", time_zone)])
        .map_err(|_| INVALID)?;
    Ok(format!("{path}?{}", query.query().unwrap_or_default()))
}

/// Draft and item IDs are server UUIDs: anything else could reach another path.
fn draft_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Goals ticket 19: the open Coach drafts from today on.
#[tauri::command]
pub async fn coach_drafts(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
) -> Result<Value, String> {
    state
        .read(&zoned("/api/v1/coach/drafts", time_zone)?)
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// `{ draft, message? }`; null (404) when no provider is connected.
#[tauri::command]
pub async fn draft_day(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
) -> Result<Option<Value>, String> {
    Ok(state
        .write(
            Method::POST,
            &zoned("/api/v1/coach/drafts/day", time_zone)?,
            None,
        )
        .await?)
}

/// Goals ticket 20: the Coach drafts the week from `start` (YYYY-MM-DD); as `draft_day`.
#[tauri::command]
pub async fn draft_week(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
    start: String,
) -> Result<Option<Value>, String> {
    Ok(state
        .write(Method::POST, &week_path(time_zone, &start)?, None)
        .await?)
}

/// The server checks the date itself; this only keeps the path to digits and dashes.
fn week_path(time_zone: String, start: &str) -> Result<String, String> {
    if start.len() != 10 || !start.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err(INVALID.to_owned());
    }
    Ok(format!(
        "{}&start={start}",
        zoned("/api/v1/coach/drafts/week", time_zone)?
    ))
}

/// Accepts or declines some items of a draft (all without `item_ids`).
#[tauri::command]
pub async fn decide_draft(
    state: tauri::State<'_, NativeAuth>,
    draft_id: String,
    accept: bool,
    item_ids: Option<Vec<String>>,
) -> Result<Option<Value>, String> {
    let body = decision_body(&draft_id, item_ids)?;
    let path = format!(
        "/api/v1/coach/drafts/{draft_id}/{}",
        if accept { "accept" } else { "decline" }
    );
    Ok(state.write(Method::POST, &path, Some(body)).await?)
}

fn decision_body(id: &str, item_ids: Option<Vec<String>>) -> Result<Value, &'static str> {
    if !self::draft_id(id)
        || item_ids.as_ref().is_some_and(|ids| {
            ids.is_empty() || ids.len() > 20 || !ids.iter().all(|item| self::draft_id(item))
        })
    {
        return Err(INVALID);
    }
    Ok(match item_ids {
        Some(ids) => serde_json::json!({ "itemIds": ids }),
        None => serde_json::json!({}),
    })
}

/// Goals ticket 21: the Coach's recommendation per goal off track, in the webview's timezone.
#[tauri::command]
pub async fn coach_recommendations(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
) -> Result<Value, String> {
    state
        .read(&zoned("/api/v1/coach/recommendations", time_zone)?)
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// Goal IDs are server UUIDs, checked like draft IDs so they stay one path segment.
fn recommendation_path(goal_id: &str, action: &str) -> Result<String, String> {
    if !draft_id(goal_id) {
        return Err(INVALID.to_owned());
    }
    Ok(format!("/api/v1/coach/recommendations/{goal_id}/{action}"))
}

/// Hides the goal's recommendation for the rest of the season week.
#[tauri::command]
pub async fn dismiss_recommendation(
    state: tauri::State<'_, NativeAuth>,
    goal_id: String,
) -> Result<Option<Value>, String> {
    Ok(state
        .write(Method::POST, &recommendation_path(&goal_id, "dismiss")?, None)
        .await?)
}

/// Update schedule: a week draft carrying out the goal's recommendation; as `draft_week`.
#[tauri::command]
pub async fn draft_recommendation(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
    goal_id: String,
) -> Result<Option<Value>, String> {
    let path = recommendation_path(&goal_id, "draft")?;
    Ok(state
        .write(Method::POST, &zoned(&path, time_zone)?, None)
        .await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_bodies_carry_only_typed_validated_fields() {
        let body: CoachProvider = serde_json::from_value(serde_json::json!({
            "provider": "openai", "model": "gpt-5.4-mini", "apiKey": "sk-12345678"
        }))
        .unwrap();
        assert_eq!(
            provider_body(body).unwrap(),
            serde_json::json!({ "provider": "openai", "model": "gpt-5.4-mini", "apiKey": "sk-12345678" })
        );
        assert!(
            serde_json::from_value::<CoachProvider>(serde_json::json!({
                "provider": "openai", "model": "m", "userId": "bob"
            }))
            .is_err()
        );
        let unknown: CoachProvider =
            serde_json::from_value(serde_json::json!({ "provider": "chatgpt", "model": "m" }))
                .unwrap();
        assert_eq!(provider_body(unknown), Err(INVALID));
    }

    #[test]
    fn provider_queries_name_only_known_kinds() {
        assert_eq!(named("/p", None, false).unwrap(), "/p");
        assert_eq!(
            named("/p", Some("anthropic".into()), false).unwrap(),
            "/p?provider=anthropic"
        );
        assert_eq!(
            named("/p", Some("chatgpt".into()), true).unwrap(),
            "/p?provider=chatgpt"
        );
        assert!(named("/p", Some("chatgpt".into()), false).is_err());
        assert!(named("/p", Some("openai&x=1".into()), true).is_err());
    }

    #[test]
    fn chatgpt_sign_in_opens_and_forwards_only_openai_and_the_callback() {
        assert!(authorize_url(
            "https://auth.openai.com/api/accounts/authorize?client_id=x"
        ));
        assert!(!authorize_url(
            "https://auth.openai.com.evil.example/api/accounts/authorize?x"
        ));
        assert!(!authorize_url(
            "https://evil.example/?https://auth.openai.com/api/accounts/authorize?"
        ));
        assert!(!authorize_url("file:///etc/passwd"));
        assert_eq!(
            callback_target(
                b"GET /auth/callback?code=c&state=s HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
            ),
            Some("/auth/callback?code=c&state=s".to_owned())
        );
        assert_eq!(callback_target(b"GET /favicon.ico HTTP/1.1\r\n\r\n"), None);
        assert_eq!(
            callback_target(b"POST /auth/callback?code=c HTTP/1.1\r\n\r\n"),
            None
        );
        assert_eq!(
            callback_target(b"GET /auth/callbackX HTTP/1.1\r\n\r\n"),
            None
        );
        assert_eq!(callback_target(b"\xff\xfe"), None);
    }

    #[test]
    fn draft_decisions_carry_only_plain_ids() {
        assert_eq!(decision_body("d-1", None).unwrap(), serde_json::json!({}));
        assert_eq!(
            decision_body("d-1", Some(vec!["i-1".into()])).unwrap(),
            serde_json::json!({ "itemIds": ["i-1"] })
        );
        assert_eq!(decision_body("../tasks", None), Err(INVALID));
        assert_eq!(decision_body("d-1", Some(vec![])), Err(INVALID));
        assert_eq!(decision_body("d-1", Some(vec!["a/b".into()])), Err(INVALID));
    }

    #[test]
    fn recommendations_name_only_a_plain_goal_id() {
        assert_eq!(
            recommendation_path("g-1", "dismiss").unwrap(),
            "/api/v1/coach/recommendations/g-1/dismiss"
        );
        assert!(recommendation_path("../tasks", "draft").is_err());
        assert!(recommendation_path("", "draft").is_err());
    }

    #[test]
    fn week_drafts_carry_only_a_plain_date() {
        assert_eq!(
            week_path("Europe/Zurich".into(), "2026-02-16").unwrap(),
            "/api/v1/coach/drafts/week?timeZone=Europe%2FZurich&start=2026-02-16"
        );
        assert!(week_path("UTC".into(), "2026-02-16&x=1").is_err());
        assert!(week_path("UTC".into(), "../../task").is_err());
    }
}
