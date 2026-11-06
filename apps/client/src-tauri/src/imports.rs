// Todoist import (.scratch/todoist-import): five fixed commands. The OAuth
// exchange and the Todoist token stay on the server; this shell only opens
// Todoist's authorize page in the system browser.
use crate::auth::NativeAuth;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const INVALID_RESPONSE: &str = "The server returned an invalid response.";
const UNAVAILABLE: &str = "The Todoist import is unavailable. Try again.";

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Include {
    sections: bool,
    subtasks: bool,
    labels: bool,
    recurring: bool,
    comments: bool,
    completed: bool,
    // "quarter" | "year" | "all"; the server validates it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    completed_range: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Selection {
    project_ids: Vec<String>,
    include: Include,
    time_zone: String,
}

#[tauri::command]
pub async fn import_status(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
) -> Result<Value, String> {
    let query = reqwest::Url::parse_with_params("http://x/", [("timeZone", time_zone)])
        .map_err(|_| UNAVAILABLE)?;
    let path = format!(
        "/api/v1/imports/todoist?{}",
        query.query().unwrap_or_default()
    );
    match state.read(&path).await {
        Ok(Some(value)) => Ok(value),
        Ok(None) => Err(INVALID_RESPONSE.to_owned()),
        Err("Your tasks could not be loaded. Try again.") => Err(UNAVAILABLE.to_owned()),
        Err(error) => Err(error.to_owned()),
    }
}

#[tauri::command]
pub async fn import_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, NativeAuth>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let body = state
        .write(Method::POST, "/api/v1/imports/todoist/connect", None)
        .await?
        .ok_or(INVALID_RESPONSE)?;
    let url = body
        .get("authorizeUrl")
        .and_then(Value::as_str)
        .and_then(authorize_link)
        .ok_or(INVALID_RESPONSE)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| UNAVAILABLE.to_owned())
}

#[tauri::command]
pub async fn import_run(
    state: tauri::State<'_, NativeAuth>,
    selection: Selection,
) -> Result<Value, String> {
    let body = serde_json::to_value(&selection).map_err(|_| INVALID_RESPONSE.to_owned())?;
    state
        .write(Method::POST, "/api/v1/imports/todoist/run", Some(body))
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[tauri::command]
pub async fn import_disconnect(state: tauri::State<'_, NativeAuth>) -> Result<(), String> {
    state
        .write(Method::DELETE, "/api/v1/imports/todoist", None)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn import_prompt_seen(state: tauri::State<'_, NativeAuth>) -> Result<(), String> {
    state.write(Method::POST, "/api/v1/imports/todoist/prompt", None).await?;
    Ok(())
}

/// Only Todoist's https authorize page; this is not a general URL opener.
fn authorize_link(value: &str) -> Option<reqwest::Url> {
    let url = reqwest::Url::parse(value).ok()?;
    (url.scheme() == "https"
        && url.host_str() == Some("app.todoist.com")
        && url.path() == "/oauth/authorize"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none())
    .then_some(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn opens_only_the_todoist_authorize_page() {
        assert!(
            authorize_link("https://app.todoist.com/oauth/authorize?client_id=x&state=y").is_some()
        );
        for bad in [
            "http://app.todoist.com/oauth/authorize",
            "https://app.todoist.com.evil.example/oauth/authorize",
            "https://evil.example/oauth/authorize",
            "https://app.todoist.com/app/settings",
            "https://user@app.todoist.com/oauth/authorize",
            "https://app.todoist.com:8443/oauth/authorize",
            "file:///etc/passwd",
        ] {
            assert!(authorize_link(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn selections_carry_only_typed_fields() {
        let include = json!({ "sections": true, "subtasks": true, "labels": false, "recurring": true, "comments": false, "completed": false });
        let parsed: Selection = serde_json::from_value(
            json!({ "projectIds": ["a"], "include": include, "timeZone": "Europe/Zurich" }),
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(&parsed).unwrap()["projectIds"],
            json!(["a"])
        );
        assert!(serde_json::from_value::<Selection>(json!({ "projectIds": ["a"], "include": include, "timeZone": "UTC", "userId": "bob" })).is_err());
    }
}
