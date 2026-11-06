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

pub(crate) fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

#[cfg(test)]
mod tests {
    use super::valid_id;

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
