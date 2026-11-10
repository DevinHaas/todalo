// Goals ticket 22: the Coach chat. Fixed paths; the message body is rebuilt
// from one typed string so the webview cannot add fields or reach another path.
// Ticket 29: the chat's documents, uploaded like task attachments (attachments.rs).
use crate::attachments::multipart;
use crate::auth::NativeAuth;
use crate::coach::zoned;
use crate::reads::valid_id;
use reqwest::Method;
use serde_json::Value;
use tauri::ipc::Request;

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

/// Ticket 29: raw body and `x-todalo-files` as `upload_files`; `{ documents }`.
#[tauri::command]
pub async fn upload_coach_documents(
    state: tauri::State<'_, NativeAuth>,
    request: Request<'_>,
) -> Result<Option<Value>, String> {
    let (boundary, body) = multipart(&request)?;
    Ok(state
        .upload("/api/v1/coach/documents", &boundary, body)
        .await?)
}

/// Ticket 29: `{ documents }` after removing one; Ok(None) for a malformed ID.
#[tauri::command]
pub async fn delete_coach_document(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(
            Method::DELETE,
            &format!("/api/v1/coach/documents/{id}"),
            None,
        )
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
