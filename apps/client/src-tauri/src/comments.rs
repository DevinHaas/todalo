// Task comment commands: list, add, delete. One fixed method and path each;
// IDs validated and the body rebuilt from typed fields here.
use crate::{auth::NativeAuth, reads::valid_id, writes::valid_operation_id};
use reqwest::Method;
use serde_json::{Value, json};

const INVALID: &str = "Check your entry and try again.";

/// The task's comments; Ok(None) for missing and foreign tasks alike.
#[tauri::command]
pub async fn comments(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state.read(&format!("/api/v1/tasks/{id}/comments")).await?)
}

#[tauri::command]
pub async fn add_comment(
    state: tauri::State<'_, NativeAuth>,
    task_id: String,
    id: String,
    body: String,
) -> Result<Option<Value>, String> {
    let payload = comment_body(&id, &body)?;
    if !valid_id(&task_id) {
        return Ok(None);
    }
    Ok(state
        .write(
            Method::POST,
            &format!("/api/v1/tasks/{task_id}/comments"),
            Some(payload),
        )
        .await?)
}

#[tauri::command]
pub async fn delete_comment(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::DELETE, &format!("/api/v1/comments/{id}"), None)
        .await?)
}

/// Mirrors the server rule (trimmed, 1–10 000 characters, UUID operation ID).
fn comment_body(id: &str, body: &str) -> Result<Value, &'static str> {
    let body = body.trim();
    if !valid_operation_id(id) || body.is_empty() || body.chars().count() > 10_000 {
        return Err(INVALID);
    }
    Ok(json!({ "id": id, "body": body }))
}

#[cfg(test)]
mod tests {
    use super::comment_body;
    use serde_json::json;

    #[test]
    fn comment_bodies_are_trimmed_and_bounded() {
        let id = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";
        assert_eq!(
            comment_body(id, "  hi  ").unwrap(),
            json!({ "id": id, "body": "hi" })
        );
        assert!(comment_body(id, "   ").is_err());
        assert!(comment_body("../x", "hi").is_err());
        assert!(comment_body(id, &"a".repeat(10_001)).is_err());
    }
}
