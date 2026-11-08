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
    /// A goal palette key; the server checks it against the palette.
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    /// A goal icon name (ticket 14c); the server checks it against its list.
    #[serde(skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
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
    color: Option<String>,
    icon: Option<String>,
) -> Result<Value, String> {
    let body = patch_body(GoalPatch {
        title: Some(title),
        description,
        color,
        icon,
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

/// One done criterion (goals ticket 06).
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Criterion {
    text: String,
    done: bool,
}

/// Marks a task a milestone for one linked goal, with its ordered criteria.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Milestone {
    goal_id: String,
    criteria: Vec<Criterion>,
}

#[tauri::command]
pub async fn milestone(
    state: tauri::State<'_, NativeAuth>,
    task_id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&task_id) {
        return Ok(None);
    }
    Ok(state
        .read(&format!("/api/v1/tasks/{task_id}/milestone"))
        .await?)
}

/// Marks (or edits) the milestone; `None` unmarks it and keeps the goal link.
#[tauri::command]
pub async fn set_milestone(
    state: tauri::State<'_, NativeAuth>,
    task_id: String,
    milestone: Option<Milestone>,
) -> Result<Option<Value>, String> {
    let body = milestone.map(milestone_body).transpose()?;
    if !valid_id(&task_id) {
        return Ok(None);
    }
    let method = if body.is_some() {
        Method::PUT
    } else {
        Method::DELETE
    };
    Ok(state
        .write(method, &format!("/api/v1/tasks/{task_id}/milestone"), body)
        .await?)
}

/// Mirrors milestoneInput: a valid goal ID, at most 50 criteria of 1–500 trimmed characters.
fn milestone_body(milestone: Milestone) -> Result<Value, &'static str> {
    if !valid_id(&milestone.goal_id) || milestone.criteria.len() > 50 {
        return Err(INVALID);
    }
    let mut criteria = Vec::with_capacity(milestone.criteria.len());
    for item in milestone.criteria {
        let text = item.text.trim();
        if text.is_empty() || text.chars().count() > 500 {
            return Err(INVALID);
        }
        criteria.push(json!({ "text": text, "done": item.done }));
    }
    Ok(json!({ "goalId": milestone.goal_id, "criteria": criteria }))
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
    let key = |value: &String| {
        value.is_empty()
            || value.len() > 30
            || !value
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte == b'-')
    };
    if patch.color.as_ref().is_some_and(key) || patch.icon.as_ref().is_some_and(key) {
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
    use super::{GoalPatch, Milestone, link_path, milestone_body, patch_body};
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
    fn milestone_bodies_are_trimmed_bounded_and_typed() {
        let milestone: Milestone = serde_json::from_value(
            json!({ "goalId": "g1", "criteria": [{ "text": " Register ", "done": true }] }),
        )
        .unwrap();
        assert_eq!(
            milestone_body(milestone).unwrap(),
            json!({ "goalId": "g1", "criteria": [{ "text": "Register", "done": true }] })
        );
        assert!(
            serde_json::from_value::<Milestone>(
                json!({ "goalId": "g1", "criteria": [], "userId": "bob" })
            )
            .is_err()
        );
        for value in [
            json!({ "goalId": "../x", "criteria": [] }),
            json!({ "goalId": "g1", "criteria": [{ "text": "  ", "done": false }] }),
        ] {
            let milestone: Milestone = serde_json::from_value(value).unwrap();
            assert_eq!(
                milestone_body(milestone),
                Err("Check your entry and try again.")
            );
        }
    }

    #[test]
    fn goal_bodies_carry_only_typed_validated_fields() {
        let patch: GoalPatch =
            serde_json::from_value(json!({ "title": "  Get fit ", "color": "teal", "icon": "book-open", "archived": true })).unwrap();
        assert_eq!(
            patch_body(patch).unwrap(),
            json!({ "title": "Get fit", "color": "teal", "icon": "book-open", "archived": true })
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
            GoalPatch {
                color: Some("#ff0000".into()),
                ..Default::default()
            },
            GoalPatch {
                icon: Some("<svg>".into()),
                ..Default::default()
            },
        ] {
            assert_eq!(patch_body(patch), Err("Check your entry and try again."));
        }
    }
}
