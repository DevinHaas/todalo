// Narrow time block commands (goals ticket 07): one fixed method and path per
// operation. IDs are validated and bodies rebuilt from typed fields here, so the
// webview cannot add a user ID or reach another path. The server re-validates
// the range (15 minutes to 24 hours) and the goal's owner.
use crate::{auth::NativeAuth, reads::valid_id};
use reqwest::Method;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

const INVALID: &str = "Check your entry and try again.";
const UNAVAILABLE: &str = "Your tasks could not be loaded. Try again.";

/// Only the supplied fields change; `goalId: null` removes the goal.
#[derive(Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimeBlockPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    start: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end: Option<String>,
    /// Absent: unchanged; null: no goal (kept apart from absent by `present`).
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    goal_id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
}

fn present<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Value>, D::Error> {
    Value::deserialize(deserializer).map(Some)
}

#[tauri::command]
pub async fn time_blocks(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/time-blocks")
        .await?
        .ok_or_else(|| UNAVAILABLE.to_owned())
}

#[tauri::command]
pub async fn create_time_block(
    state: tauri::State<'_, NativeAuth>,
    block: TimeBlockPatch,
) -> Result<Option<Value>, String> {
    if block.start.is_none() || block.end.is_none() {
        return Err(INVALID.to_owned());
    }
    let body = block_body(block)?;
    Ok(state
        .write(Method::POST, "/api/v1/time-blocks", Some(body))
        .await?)
}

#[tauri::command]
pub async fn update_time_block(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    patch: TimeBlockPatch,
) -> Result<Option<Value>, String> {
    let body = block_body(patch)?;
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(
            Method::PATCH,
            &format!("/api/v1/time-blocks/{id}"),
            Some(body),
        )
        .await?)
}

#[tauri::command]
pub async fn delete_time_block(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::DELETE, &format!("/api/v1/time-blocks/{id}"), None)
        .await?)
}

/// Instants are short ISO strings, the goal a valid ID or null, the title at
/// most 200 characters; an empty patch is refused.
fn block_body(patch: TimeBlockPatch) -> Result<Value, &'static str> {
    let instant = |value: &Option<String>| {
        value
            .as_deref()
            .is_none_or(|text| text.len() <= 40 && !text.is_empty())
    };
    let goal = match &patch.goal_id {
        None | Some(Value::Null) => true,
        Some(Value::String(id)) => valid_id(id),
        Some(_) => false,
    };
    if !instant(&patch.start)
        || !instant(&patch.end)
        || !goal
        || patch
            .title
            .as_ref()
            .is_some_and(|title| title.chars().count() > 200)
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
    use super::{TimeBlockPatch, block_body};
    use serde_json::json;

    #[test]
    fn block_bodies_keep_null_goals_apart_from_absent_ones() {
        let parse = |value| serde_json::from_value::<TimeBlockPatch>(value).unwrap();
        assert_eq!(
            block_body(parse(json!({ "goalId": null }))).unwrap(),
            json!({ "goalId": null })
        );
        assert_eq!(
            block_body(parse(
                json!({ "start": "2026-02-21T09:00:00.000Z", "end": "2026-02-21T10:00:00.000Z" })
            ))
            .unwrap(),
            json!({ "start": "2026-02-21T09:00:00.000Z", "end": "2026-02-21T10:00:00.000Z" })
        );
        assert!(
            serde_json::from_value::<TimeBlockPatch>(json!({ "title": "A", "userId": "bob" }))
                .is_err()
        );
        for value in [
            json!({}),
            json!({ "goalId": "../x" }),
            json!({ "goalId": 3 }),
            json!({ "title": "x".repeat(201) }),
        ] {
            assert_eq!(
                block_body(parse(value)),
                Err("Check your entry and try again.")
            );
        }
    }
}
