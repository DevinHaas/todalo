// Connected calendars (ticket 20): fixed reads and writes, plus the live change
// stream. A WebView EventSource cannot carry the Keychain bearer, so Rust opens
// GET /api/v1/stream itself and forwards only parsed frames (ready / change
// topic) over a Tauri channel. The token never reaches JS, URLs or logs.
use crate::{auth::NativeAuth, credentials, reads::valid_id};
use reqwest::{Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{sync::Mutex, time::Duration};
use tauri::{Manager, async_runtime::JoinHandle, ipc::Channel};

const INVALID: &str = "Check your entry and try again.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";
const UNAVAILABLE: &str = "Your calendars could not be loaded. Try again.";
const NOT_FOUND: &str = "This calendar account does not exist or you do not have access to it.";
// NativeAuth::read's generic failure names tasks; these reads have their own copy.
const READ_FAILED: &str = "Your tasks could not be loaded. Try again.";
const SIGN_IN: &str = "Please sign in again.";
const OFFLINE: &str = "Cannot reach todalo. Check your connection and try again.";
/// Server heartbeats arrive every 25 s; silence this long means a dead connection.
const IDLE: Duration = Duration::from_secs(60);
/// The client's 20 s default would end every stream; reconnecting hourly is harmless.
const STREAM_LIFETIME: Duration = Duration::from_secs(60 * 60);

async fn read(state: &NativeAuth, path: &str) -> Result<Value, String> {
    match state.read(path).await {
        Ok(Some(value)) => Ok(value),
        Ok(None) => Err(INVALID_RESPONSE.to_owned()),
        Err(READ_FAILED) => Err(UNAVAILABLE.to_owned()),
        Err(error) => Err(error.to_owned()),
    }
}

async fn write(
    state: &NativeAuth,
    method: Method,
    account_id: &str,
    suffix: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    if !valid_id(account_id) {
        return Err(NOT_FOUND.to_owned());
    }
    let path = format!("/api/v1/calendar/accounts/{account_id}{suffix}");
    state
        .write(method, &path, body)
        .await?
        .ok_or_else(|| NOT_FOUND.to_owned())
}

#[tauri::command]
pub async fn calendar_events(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    read(&state, "/api/v1/calendar/events").await
}

#[tauri::command]
pub async fn calendar_accounts(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    read(&state, "/api/v1/calendar/accounts").await
}

#[tauri::command]
pub async fn show_calendar_account_events(
    state: tauri::State<'_, NativeAuth>,
    account_id: String,
    show_events: bool,
) -> Result<Value, String> {
    let body = json!({ "showEvents": show_events });
    write(&state, Method::PATCH, &account_id, "", Some(body)).await
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarVisibility {
    google_calendar_id: String,
    summary: String,
    color: String,
    visible: bool,
}

#[tauri::command]
pub async fn set_calendar_visibility(
    state: tauri::State<'_, NativeAuth>,
    account_id: String,
    calendar: CalendarVisibility,
) -> Result<Value, String> {
    // Rebuilt from the typed fields, so the webview cannot add a user ID.
    let body = serde_json::to_value(&calendar).map_err(|_| INVALID.to_owned())?;
    write(&state, Method::PATCH, &account_id, "/calendars", Some(body)).await
}

#[tauri::command]
pub async fn resync_calendar_account(
    state: tauri::State<'_, NativeAuth>,
    account_id: String,
) -> Result<Value, String> {
    write(&state, Method::POST, &account_id, "/resync", None).await
}

#[tauri::command]
pub async fn disconnect_calendar_account(
    state: tauri::State<'_, NativeAuth>,
    account_id: String,
) -> Result<Value, String> {
    write(&state, Method::DELETE, &account_id, "", None).await
}

/// Opens an event's Google Calendar page in the system browser. Only https links
/// on Google's calendar hosts are accepted, so this is not a general URL opener.
#[tauri::command]
pub fn open_calendar_event(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = event_link(&url).ok_or_else(|| INVALID.to_owned())?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| "Cannot open Google Calendar. Try again.".to_owned())
}

fn event_link(value: &str) -> Option<reqwest::Url> {
    let url = reqwest::Url::parse(value).ok()?;
    let google = matches!(
        url.host_str(),
        Some("www.google.com" | "calendar.google.com")
    );
    (url.scheme() == "https"
        && google
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none())
    .then_some(url)
}

/// What the webview receives from the stream; nothing else from the response.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LiveMessage {
    Ready,
    Change { topic: String },
    Closed { error: Option<String> },
}

/// At most one stream per app; starting another (or stopping) aborts the last.
#[derive(Default)]
pub struct LiveStream(Mutex<Option<JoinHandle<()>>>);

impl LiveStream {
    fn replace(&self, next: Option<JoinHandle<()>>) {
        let mut current = self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(previous) = std::mem::replace(&mut *current, next) {
            previous.abort();
        }
    }
}

#[tauri::command]
pub fn live_stream(
    app: tauri::AppHandle,
    live: tauri::State<'_, LiveStream>,
    on_event: Channel<LiveMessage>,
) {
    let task = tauri::async_runtime::spawn(async move {
        let error = stream(&app.state::<NativeAuth>(), &on_event)
            .await
            .err()
            .map(str::to_owned);
        let _ = on_event.send(LiveMessage::Closed { error });
    });
    live.replace(Some(task));
}

#[tauri::command]
pub fn stop_live_stream(live: tauri::State<'_, LiveStream>) {
    live.replace(None);
}

async fn stream(state: &NativeAuth, on_event: &Channel<LiveMessage>) -> Result<(), &'static str> {
    let origin = state.origin()?;
    let token = credentials::read(&origin)?.ok_or(SIGN_IN)?;
    let mut response = state
        .client
        .get(state.url("/api/v1/stream")?)
        .bearer_auth(&*token)
        .header("accept", "text/event-stream")
        .timeout(STREAM_LIFETIME)
        .send()
        .await
        .map_err(|_| OFFLINE)?;
    drop(token);
    match response.status() {
        StatusCode::UNAUTHORIZED => return Err(SIGN_IN),
        status if !status.is_success() => return Err(OFFLINE),
        _ => {}
    }
    let mut buffer = String::new();
    loop {
        let chunk = tokio::time::timeout(IDLE, response.chunk())
            .await
            .map_err(|_| OFFLINE)?
            .map_err(|_| OFFLINE)?;
        let Some(bytes) = chunk else { return Ok(()) };
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        for message in take_frames(&mut buffer) {
            if on_event.send(message).is_err() {
                return Ok(());
            }
        }
        // A misbehaving server cannot grow the buffer without bound.
        if buffer.len() > 64 * 1024 {
            return Err(INVALID_RESPONSE);
        }
    }
}

/// Removes complete SSE frames from `buffer` and maps the ones in the
/// GET /api/v1/stream contract; comments (heartbeats) and unknown events are dropped.
fn take_frames(buffer: &mut String) -> Vec<LiveMessage> {
    let normalized = buffer.replace("\r\n", "\n");
    let Some(end) = normalized.rfind("\n\n") else {
        *buffer = normalized;
        return Vec::new();
    };
    let (complete, rest) = normalized.split_at(end + 2);
    let messages = complete
        .split("\n\n")
        .filter_map(|frame| {
            let mut event = "message";
            let mut data = String::new();
            for line in frame.lines() {
                if let Some(value) = line.strip_prefix("event:") {
                    event = value.trim();
                } else if let Some(value) = line.strip_prefix("data:") {
                    data.push_str(value.trim());
                }
            }
            match event {
                "ready" => Some(LiveMessage::Ready),
                "change" => {
                    #[derive(Deserialize)]
                    struct Change {
                        topic: String,
                    }
                    let change: Change = serde_json::from_str(&data).ok()?;
                    let known = change.topic.len() <= 64
                        && change
                            .topic
                            .bytes()
                            .all(|byte| byte.is_ascii_lowercase() || byte == b'-');
                    known.then_some(LiveMessage::Change {
                        topic: change.topic,
                    })
                }
                _ => None,
            }
        })
        .collect();
    *buffer = rest.to_owned();
    messages
}

#[cfg(test)]
mod tests {
    use super::{CalendarVisibility, LiveMessage, event_link, take_frames};
    use serde_json::json;

    #[test]
    fn stream_frames_map_to_ready_and_change_only() {
        let mut buffer = String::from(
            "event: ready\ndata: {}\n\n: heartbeat\n\nevent: change\ndata: {\"topic\":\"calendar\"}\n\nevent: chan",
        );
        assert_eq!(
            take_frames(&mut buffer),
            vec![
                LiveMessage::Ready,
                LiveMessage::Change {
                    topic: "calendar".into()
                }
            ]
        );
        assert_eq!(buffer, "event: chan");
        buffer.push_str("ge\r\ndata: {\"topic\":\"tasks\"}\r\n\r\n");
        assert_eq!(
            take_frames(&mut buffer),
            vec![LiveMessage::Change {
                topic: "tasks".into()
            }]
        );
        assert!(buffer.is_empty());
    }

    #[test]
    fn malformed_or_unknown_frames_are_dropped() {
        let mut buffer = String::from(
            "event: change\ndata: not json\n\nevent: change\ndata: {\"topic\":\"<script>\"}\n\ndata: sync\n\nevent: other\ndata: {}\n\n",
        );
        assert!(take_frames(&mut buffer).is_empty());
        assert!(buffer.is_empty());
    }

    #[test]
    fn only_google_calendar_links_open() {
        assert!(event_link("https://www.google.com/calendar/event?eid=abc").is_some());
        assert!(event_link("https://calendar.google.com/calendar/event?eid=abc").is_some());
        for url in [
            "http://www.google.com/calendar/event",
            "https://evil.example/calendar",
            "https://www.google.com.evil.example/",
            "https://user@www.google.com/",
            "https://www.google.com:8443/",
            "file:///etc/passwd",
            "javascript:alert(1)",
        ] {
            assert!(event_link(url).is_none(), "{url}");
        }
    }

    #[test]
    fn closed_messages_serialize_for_the_webview() {
        assert_eq!(
            serde_json::to_value(LiveMessage::Closed {
                error: Some("Please sign in again.".into())
            })
            .unwrap(),
            json!({ "type": "closed", "error": "Please sign in again." })
        );
        assert_eq!(
            serde_json::to_value(LiveMessage::Ready).unwrap(),
            json!({ "type": "ready" })
        );
    }

    #[test]
    fn visibility_bodies_carry_only_the_typed_fields() {
        let parsed: CalendarVisibility = serde_json::from_value(json!({
            "googleCalendarId": "a@example.test", "summary": "Work", "color": "#ff0000", "visible": true
        }))
        .unwrap();
        assert_eq!(
            serde_json::to_value(&parsed).unwrap(),
            json!({ "googleCalendarId": "a@example.test", "summary": "Work", "color": "#ff0000", "visible": true })
        );
        assert!(
            serde_json::from_value::<CalendarVisibility>(json!({
                "googleCalendarId": "a", "summary": "", "color": "#000000", "visible": true, "userId": "bob"
            }))
            .is_err()
        );
    }
}
