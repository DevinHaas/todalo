// Account preferences (ticket 12): one fixed read and one fixed write. The body
// is rebuilt from the typed field, so the webview cannot add a user ID.
use crate::auth::NativeAuth;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const INVALID_RESPONSE: &str = "The server returned an invalid response.";
const UNAVAILABLE: &str = "Your preferences could not be loaded. Try again.";
// NativeAuth::read's generic failure names tasks; this read has its own copy.
const READ_FAILED: &str = "Your tasks could not be loaded. Try again.";

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    smart_date_recognition: bool,
    // Goals ticket 28: Settings › Coach "Share event titles with the AI".
    // Forwarded only when sent, so a save that leaves it out never resets it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    share_event_titles: Option<bool>,
}

#[tauri::command]
pub async fn settings(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    match state.read("/api/v1/settings").await {
        Ok(Some(value)) => Ok(value),
        Ok(None) => Err(INVALID_RESPONSE.to_owned()),
        Err(READ_FAILED) => Err(UNAVAILABLE.to_owned()),
        Err(error) => Err(error.to_owned()),
    }
}

#[tauri::command]
pub async fn update_settings(
    state: tauri::State<'_, NativeAuth>,
    settings: Settings,
) -> Result<Value, String> {
    let body = serde_json::to_value(&settings).map_err(|_| INVALID_RESPONSE.to_owned())?;
    state
        .write(Method::PATCH, "/api/v1/settings", Some(body))
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

// Ticket 19: account keyboard shortcuts. The preference document is opaque
// here; the API's shared validator is the trust boundary and the body is
// rebuilt with the single `preferences` key.
#[tauri::command]
pub async fn keyboard_preferences(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    match state.read("/api/v1/settings/keyboard").await {
        Ok(Some(value)) => Ok(value),
        Ok(None) => Err(INVALID_RESPONSE.to_owned()),
        Err(READ_FAILED) => Err(UNAVAILABLE.to_owned()),
        Err(error) => Err(error.to_owned()),
    }
}

#[tauri::command]
pub async fn update_keyboard_preferences(
    state: tauri::State<'_, NativeAuth>,
    preferences: Value,
) -> Result<Value, String> {
    state
        .write(
            Method::PUT,
            "/api/v1/settings/keyboard",
            Some(json!({ "preferences": preferences })),
        )
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[cfg(test)]
mod tests {
    use super::Settings;
    use serde_json::json;

    #[test]
    fn settings_bodies_carry_only_the_typed_preference() {
        let parsed: Settings =
            serde_json::from_value(json!({ "smartDateRecognition": false, "userId": "bob" }))
                .unwrap();
        assert_eq!(
            serde_json::to_value(&parsed).unwrap(),
            json!({ "smartDateRecognition": false })
        );
        let both: Settings = serde_json::from_value(
            json!({ "smartDateRecognition": true, "shareEventTitles": true }),
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(&both).unwrap(),
            json!({ "smartDateRecognition": true, "shareEventTitles": true })
        );
        assert!(
            serde_json::from_value::<Settings>(json!({ "smartDateRecognition": "no" })).is_err()
        );
        assert!(serde_json::from_value::<Settings>(json!({})).is_err());
    }
}
