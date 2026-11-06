// Narrow project commands: one fixed method and path per operation, IDs and
// names validated here before a URL or body is built. No path-taking command.
use crate::{auth::NativeAuth, reads::valid_id};
use reqwest::Method;
use serde_json::{Value, json};

const INVALID: &str = "Check your entry and try again.";
const UNAVAILABLE: &str = "Your tasks could not be loaded. Try again.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";

#[tauri::command]
pub async fn projects(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/projects")
        .await?
        .ok_or_else(|| UNAVAILABLE.to_owned())
}

#[tauri::command]
pub async fn project(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state.read(&format!("/api/v1/projects/{id}")).await?)
}

#[tauri::command]
pub async fn create_project(
    state: tauri::State<'_, NativeAuth>,
    name: String,
) -> Result<Value, String> {
    let body = name_body(&name)?;
    state
        .write(Method::POST, "/api/v1/projects", Some(body))
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[tauri::command]
pub async fn rename_project(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    name: String,
) -> Result<Option<Value>, String> {
    let body = name_body(&name)?;
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::PATCH, &format!("/api/v1/projects/{id}"), Some(body))
        .await?)
}

#[tauri::command]
pub async fn delete_project(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::DELETE, &format!("/api/v1/projects/{id}"), None)
        .await?)
}

/// Mirrors the server rule (trimmed, 1–200 characters) so oversized input never leaves.
fn name_body(name: &str) -> Result<Value, &'static str> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 200 {
        return Err(INVALID);
    }
    Ok(json!({ "name": name }))
}

#[cfg(test)]
mod tests {
    use super::name_body;
    use serde_json::json;

    #[test]
    fn project_names_are_trimmed_and_bounded() {
        assert_eq!(name_body("  Work ").unwrap(), json!({ "name": "Work" }));
        assert!(name_body(&"é".repeat(200)).is_ok());
        for name in ["", "   ", &"x".repeat(201)] {
            assert_eq!(name_body(name), Err("Check your entry and try again."));
        }
    }
}
