// Narrow authenticated read commands. Each maps to one fixed API path; there is
// deliberately no general-purpose HTTP command and no token getter.
use crate::auth::NativeAuth;

#[tauri::command]
pub async fn today(state: tauri::State<'_, NativeAuth>) -> Result<serde_json::Value, String> {
    state
        .read("/api/v1/today")
        .await?
        .ok_or_else(|| "Your tasks could not be loaded. Try again.".to_owned())
}

#[tauri::command]
pub async fn task(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<serde_json::Value>, String> {
    // An ID that cannot exist is "not found"; it never reaches URL construction.
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state.read(&format!("/api/v1/tasks/{id}")).await?)
}

/// GET /api/v1/sync: what changed since `since` (a cursor from the last answer; none starts over).
#[tauri::command]
pub async fn sync_changes(
    state: tauri::State<'_, NativeAuth>,
    since: Option<String>,
) -> Result<serde_json::Value, String> {
    // A cursor is digits only, so it can never change the request path; anything else starts over.
    let path = match since.as_deref() {
        Some(cursor) if valid_cursor(cursor) => format!("/api/v1/sync?since={cursor}"),
        _ => "/api/v1/sync".to_owned(),
    };
    state
        .read(&path)
        .await?
        .ok_or_else(|| "Your changes could not be loaded. Try again.".to_owned())
}

fn valid_cursor(cursor: &str) -> bool {
    !cursor.is_empty() && cursor.len() <= 15 && cursor.bytes().all(|byte| byte.is_ascii_digit())
}

pub(crate) fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

#[cfg(test)]
mod tests {
    use super::{valid_cursor, valid_id};

    #[test]
    fn sync_cursors_are_digits_only() {
        assert!(valid_cursor("123456"));
        for cursor in ["", "12a", "1&since=2", "../x", &"9".repeat(16)] {
            assert!(!valid_cursor(cursor), "{cursor}");
        }
    }

    #[test]
    fn task_ids_cannot_change_the_request_path() {
        assert!(valid_id("8f14e45f-ceea-467f-a8ad-0e7c5d3c3a1b"));
        for id in [
            "",
            "../account",
            "a/b",
            "a?b",
            "a#b",
            "%2e%2e",
            "a b",
            &"x".repeat(129),
        ] {
            assert!(!valid_id(id), "{id}");
        }
    }
}
