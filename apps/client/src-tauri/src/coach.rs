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
    if !["openai", "openrouter", "ollama"].contains(&provider.provider.as_str())
        || provider.model.trim().is_empty()
        || provider.model.len() > 200
        || provider.base_url.as_ref().is_some_and(|url| url.len() > 500)
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
    let query = reqwest::Url::parse_with_params("http://x/", [("timeZone", time_zone)])
        .map_err(|_| INVALID)?;
    let path = format!(
        "/api/v1/coach/explanations?{}",
        query.query().unwrap_or_default()
    );
    state
        .read(&path)
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
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
            serde_json::from_value(serde_json::json!({ "provider": "anthropic", "model": "m" }))
                .unwrap();
        assert_eq!(provider_body(unknown), Err(INVALID));
    }
}
