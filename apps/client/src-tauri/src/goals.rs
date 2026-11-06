// Narrow goal commands (goals ticket 01): one fixed method and path per
// operation. IDs are validated and bodies rebuilt from typed fields here, so the
// webview cannot add a user ID or reach another path.
use crate::{auth::NativeAuth, reads::valid_id};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const INVALID: &str = "Check your entry and try again.";
const UNAVAILABLE: &str = "Your tasks could not be loaded. Try again.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";

/// Only the supplied fields change (PATCH /api/v1/goals/:id).
#[derive(Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GoalPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    archived: Option<bool>,
}

#[tauri::command]
pub async fn goals(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/goals")
        .await?
        .ok_or_else(|| UNAVAILABLE.to_owned())
}

#[tauri::command]
pub async fn goal(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state.read(&format!("/api/v1/goals/{id}")).await?)
}

#[tauri::command]
pub async fn create_goal(
    state: tauri::State<'_, NativeAuth>,
    title: String,
    description: Option<String>,
) -> Result<Value, String> {
    let body = patch_body(GoalPatch {
        title: Some(title),
        description,
        archived: None,
    })?;
    state
        .write(Method::POST, "/api/v1/goals", Some(body))
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[tauri::command]
pub async fn update_goal(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    patch: GoalPatch,
) -> Result<Option<Value>, String> {
    let body = patch_body(patch)?;
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::PATCH, &format!("/api/v1/goals/{id}"), Some(body))
        .await?)
}

#[tauri::command]
pub async fn reorder_goal(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    anchor_id: String,
    position: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&anchor_id) || !matches!(position.as_str(), "before" | "after") {
        return Err(INVALID.to_owned());
    }
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(
            Method::POST,
            &format!("/api/v1/goals/{id}/reorder"),
            Some(json!({ "anchorId": anchor_id, "position": position })),
        )
        .await?)
}

#[tauri::command]
pub async fn set_goals_hidden(
    state: tauri::State<'_, NativeAuth>,
    hidden: bool,
) -> Result<Value, String> {
    state
        .write(
            Method::PUT,
            "/api/v1/goals-visibility",
            Some(json!({ "hidden": hidden })),
        )
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[tauri::command]
pub async fn goal_links(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/goal-links")
        .await?
        .ok_or_else(|| UNAVAILABLE.to_owned())
}

/// Links a goal to a project or task (ticket 02); `linked: false` removes only the link.
#[tauri::command]
pub async fn link_goal(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    kind: String,
    target_id: String,
    linked: bool,
) -> Result<Option<Value>, String> {
    let path = link_path(&id, &kind, &target_id)?;
    let Some(path) = path else { return Ok(None) };
    let method = if linked { Method::PUT } else { Method::DELETE };
    Ok(state.write(method, &path, None).await?)
}

/// Goals suggested for a task (ticket 03); a read-only hint, accepting is `link_goal`.
#[tauri::command]
pub async fn goal_suggestions(
    state: tauri::State<'_, NativeAuth>,
    task_id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&task_id) {
        return Ok(None);
    }
    Ok(state
        .read(&format!("/api/v1/tasks/{task_id}/goal-suggestions"))
        .await?)
}

/// Hides one suggestion for one task; never links.
#[tauri::command]
pub async fn dismiss_goal_suggestion(
    state: tauri::State<'_, NativeAuth>,
    task_id: String,
    goal_id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&task_id) || !valid_id(&goal_id) {
        return Ok(None);
    }
    Ok(state
        .write(
            Method::DELETE,
            &format!("/api/v1/tasks/{task_id}/goal-suggestions/{goal_id}"),
            None,
        )
        .await?)
}

/// Only the two link kinds reach the server; an invalid ID is the server's 404 (None).
fn link_path(id: &str, kind: &str, target_id: &str) -> Result<Option<String>, &'static str> {
    if !matches!(kind, "projects" | "tasks") {
        return Err(INVALID);
    }
    Ok((valid_id(id) && valid_id(target_id))
        .then(|| format!("/api/v1/goals/{id}/{kind}/{target_id}")))
}

/// Mirrors the server rules (trimmed title of 1–200 characters, description up
/// to 10,000) so oversized input never leaves; an empty patch is refused.
fn patch_body(mut patch: GoalPatch) -> Result<Value, &'static str> {
    if let Some(title) = &patch.title {
        let title = title.trim();
        if title.is_empty() || title.chars().count() > 200 {
            return Err(INVALID);
        }
        patch.title = Some(title.to_owned());
    }
    if patch
        .description
        .as_ref()
        .is_some_and(|text| text.chars().count() > 10_000)
    {
        return Err(INVALID);
    }
    let body = serde_json::to_value(&patch).map_err(|_| INVALID)?;
    if body.as_object().is_none_or(|fields| fields.is_empty()) {
        return Err(INVALID);
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::{GoalPatch, link_path, patch_body};
    use serde_json::json;

    #[test]
    fn link_paths_allow_only_the_two_kinds_and_valid_ids() {
        assert_eq!(
            link_path("g1", "tasks", "t1").unwrap().as_deref(),
            Some("/api/v1/goals/g1/tasks/t1")
        );
        assert_eq!(
            link_path("g1", "labels", "t1"),
            Err("Check your entry and try again.")
        );
        assert_eq!(link_path("../x", "projects", "p1"), Ok(None));
        assert_eq!(link_path("g1", "projects", "p1/../../tasks"), Ok(None));
    }

    #[test]
    fn goal_bodies_carry_only_typed_validated_fields() {
        let patch: GoalPatch =
            serde_json::from_value(json!({ "title": "  Get fit ", "archived": true })).unwrap();
        assert_eq!(
            patch_body(patch).unwrap(),
            json!({ "title": "Get fit", "archived": true })
        );
        assert!(
            serde_json::from_value::<GoalPatch>(json!({ "title": "A", "userId": "bob" })).is_err()
        );
        for patch in [
            GoalPatch::default(),
            GoalPatch {
                title: Some("  ".into()),
                ..Default::default()
            },
            GoalPatch {
                title: Some("x".repeat(201)),
                ..Default::default()
            },
            GoalPatch {
                description: Some("x".repeat(10_001)),
                ..Default::default()
            },
        ] {
            assert_eq!(patch_body(patch), Err("Check your entry and try again."));
        }
    }
}
