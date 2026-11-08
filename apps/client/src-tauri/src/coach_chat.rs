// Goals ticket 22: the Coach chat. Fixed paths; the message body is rebuilt
// from one typed string so the webview cannot add fields or reach another path.
use crate::auth::NativeAuth;
use crate::coach::zoned;
use reqwest::Method;
use serde_json::Value;

const INVALID: &str = "Check your entry and try again.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";

/// `{ messages }`, oldest first.
#[tauri::command]
pub async fn coach_chat(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/coach/chat")
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// `{ messages, draft, message? }`; null (404) when no provider is connected.
#[tauri::command]
pub async fn send_coach_chat(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
    message: String,
) -> Result<Option<Value>, String> {
    let body = message_body(message)?;
    Ok(state
        .write(
            Method::POST,
            &zoned("/api/v1/coach/chat", time_zone)?,
            Some(body),
        )
        .await?)
}

#[tauri::command]
pub async fn clear_coach_chat(
    state: tauri::State<'_, NativeAuth>,
) -> Result<Option<Value>, String> {
    Ok(state
        .write(Method::DELETE, "/api/v1/coach/chat", None)
        .await?)
}

fn message_body(message: String) -> Result<Value, &'static str> {
    if message.trim().is_empty() || message.chars().count() > 4_000 {
        return Err(INVALID);
    }
    Ok(serde_json::json!({ "message": message }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_bodies_carry_only_the_message() {
        assert_eq!(
            message_body("Hi".into()).unwrap(),
            serde_json::json!({ "message": "Hi" })
        );
        assert_eq!(message_body("  ".into()), Err(INVALID));
        assert_eq!(message_body("x".repeat(4_001)), Err(INVALID));
    }
}
