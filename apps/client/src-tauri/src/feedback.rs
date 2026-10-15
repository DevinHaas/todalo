use serde::Deserialize;
use tauri_plugin_haptics::{HapticsExt, NotificationFeedbackType};

/// Semantic events only: the webview names what happened, never a pattern,
/// and has no permission for the haptics plugin's own commands.
#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FeedbackEvent {
    TaskCompleted,
}

fn pattern(event: FeedbackEvent) -> NotificationFeedbackType {
    match event {
        FeedbackEvent::TaskCompleted => NotificationFeedbackType::Success,
    }
}

/// Standard iOS haptic (UINotificationFeedbackGenerator); the plugin's desktop
/// build does nothing. Async so it runs off the main thread while the plugin
/// waits for Swift. The client ignores failures; they never fail a task write.
#[tauri::command]
pub async fn feedback(app: tauri::AppHandle, event: FeedbackEvent) -> Result<(), String> {
    app.haptics()
        .notification_feedback(pattern(event))
        .map_err(|_| "FEEDBACK_FAILED".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_semantic_events() {
        let event: FeedbackEvent = serde_json::from_str("\"taskCompleted\"").unwrap();
        assert_eq!(pattern(event), NotificationFeedbackType::Success);
        assert!(serde_json::from_str::<FeedbackEvent>("\"error\"").is_err());
    }
}
