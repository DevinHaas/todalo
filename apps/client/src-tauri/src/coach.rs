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

fn provider_body(provider: CoachProvider) -> Result<Value, &'static str> {
    if !["openai", "anthropic", "openrouter", "ollama"].contains(&provider.provider.as_str())
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

#[tauri::command]
pub async fn disconnect_coach(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .write(Method::DELETE, "/api/v1/coach/provider", None)
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// `{ ok, message? }`; null (404) when no provider is connected.
#[tauri::command]
pub async fn test_coach(state: tauri::State<'_, NativeAuth>) -> Result<Option<Value>, String> {
    Ok(state
        .write(Method::POST, "/api/v1/coach/provider/test", None)
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

/// Goals ticket 18: starts a ChatGPT sign-in; `{ signIn, message? }` with the code to enter at OpenAI.
#[tauri::command]
pub async fn start_chatgpt_sign_in(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .write(Method::POST, "/api/v1/coach/chatgpt/start", None)
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// `{ status, message? }`: pending until the user approved at OpenAI.
#[tauri::command]
pub async fn poll_chatgpt_sign_in(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .write(Method::POST, "/api/v1/coach/chatgpt/poll", None)
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
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

/// Opens OpenAI's device sign-in page in the system browser. A fixed URL; this
/// is not a general URL opener.
#[tauri::command]
pub fn open_chatgpt_sign_in(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url("https://auth.openai.com/codex/device", None::<&str>)
        .map_err(|_| "Cannot open the browser. Go to auth.openai.com/codex/device.".to_owned())
}

/// `/api/v1/coach/...?timeZone=…` for the webview's IANA zone.
fn zoned(path: &str, time_zone: String) -> Result<String, String> {
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
}
