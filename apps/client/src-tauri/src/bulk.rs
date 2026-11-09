// Ticket 15: bulk actions and manual reorder. One fixed method and path per
// operation; every ID is validated and every body rebuilt from typed fields
// here, so the webview cannot choose a path or add server fields.
use crate::{
    auth::NativeAuth,
    reads::valid_id,
    writes::{confirmed, valid_operation_id},
};
use reqwest::Method;
use serde::{Deserialize, Deserializer};
use serde_json::{Value, json};

const INVALID: &str = "Check your entry and try again.";
/// Legacy selection limit (bulkTaskAction / bulkTaskMetadata).
const MAX_SELECTION: usize = 200;

fn selection(ids: &[String]) -> Result<(), &'static str> {
    if ids.is_empty() || ids.len() > MAX_SELECTION || !ids.iter().all(|id| valid_id(id)) {
        return Err(INVALID);
    }
    Ok(())
}

// ISO instants are checked by the API; this only bounds what the webview sends.
fn instant(value: &Option<String>) -> bool {
    value
        .as_deref()
        .is_none_or(|value| !value.is_empty() && value.len() <= 64)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Completion {
    id: String,
    occurrence: Option<String>,
}

fn complete_body(tasks: &[Completion], operation_id: &str) -> Result<Value, &'static str> {
    let ids: Vec<String> = tasks.iter().map(|task| task.id.clone()).collect();
    selection(&ids)?;
    if !valid_operation_id(operation_id) || !tasks.iter().all(|task| instant(&task.occurrence)) {
        return Err(INVALID);
    }
    let tasks: Vec<Value> = tasks
        .iter()
        .map(|task| json!({ "id": task.id, "occurrence": task.occurrence }))
        .collect();
    Ok(json!({ "operationId": operation_id, "tasks": tasks }))
}

/// One tap ID for the whole selection; each task carries the due date the client saw.
#[tauri::command]
pub async fn bulk_complete(
    state: tauri::State<'_, NativeAuth>,
    tasks: Vec<Completion>,
    operation_id: String,
    confirm_criteria: Option<bool>,
) -> Result<Option<Value>, String> {
    let body = confirmed(complete_body(&tasks, &operation_id)?, confirm_criteria);
    Ok(state
        .write(Method::POST, "/api/v1/bulk/complete", Some(body))
        .await?)
}

fn ids_body(ids: &[String]) -> Result<Value, &'static str> {
    selection(ids)?;
    Ok(json!({ "ids": ids }))
}

#[tauri::command]
pub async fn bulk_delete(
    state: tauri::State<'_, NativeAuth>,
    ids: Vec<String>,
) -> Result<Option<Value>, String> {
    let body = ids_body(&ids)?;
    Ok(state
        .write(Method::POST, "/api/v1/bulk/delete", Some(body))
        .await?)
}

#[tauri::command]
pub async fn bulk_clear_date(
    state: tauri::State<'_, NativeAuth>,
    ids: Vec<String>,
) -> Result<Option<Value>, String> {
    let body = ids_body(&ids)?;
    Ok(state
        .write(Method::POST, "/api/v1/bulk/clear-date", Some(body))
        .await?)
}

// `None`: the field was absent; `Some(None)`: sent as null.
fn present<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(deserializer).map(Some)
}

/// The legacy bulk picker changes one field: priority, deadline or the label set.
/// Goals ticket 31: or the horizon ("now", "next", "later"; null is unsorted).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MetadataChange {
    #[serde(default)]
    priority: Option<u8>,
    #[serde(default, deserialize_with = "present")]
    deadline: Option<Option<String>>,
    #[serde(default)]
    label_ids: Option<Vec<String>>,
    #[serde(default, deserialize_with = "present")]
    horizon: Option<Option<String>>,
}

fn metadata_body(ids: &[String], change: &MetadataChange) -> Result<Value, &'static str> {
    selection(ids)?;
    let mut body = json!({ "ids": ids });
    match (
        &change.priority,
        &change.deadline,
        &change.label_ids,
        &change.horizon,
    ) {
        (Some(priority), None, None, None) if (1..=4).contains(priority) => {
            body["priority"] = json!(priority)
        }
        (None, Some(deadline), None, None) if instant(deadline) => {
            body["deadline"] = json!(deadline)
        }
        (None, None, Some(labels), None)
            if labels.len() <= 50 && labels.iter().all(|id| valid_id(id)) =>
        {
            body["labelIds"] = json!(labels)
        }
        (None, None, None, Some(horizon))
            if horizon
                .as_deref()
                .is_none_or(|value| ["now", "next", "later"].contains(&value)) =>
        {
            body["horizon"] = json!(horizon)
        }
        _ => return Err(INVALID),
    }
    Ok(body)
}

#[tauri::command]
pub async fn bulk_metadata(
    state: tauri::State<'_, NativeAuth>,
    ids: Vec<String>,
    change: MetadataChange,
) -> Result<Option<Value>, String> {
    let body = metadata_body(&ids, &change)?;
    Ok(state
        .write(Method::POST, "/api/v1/bulk/metadata", Some(body))
        .await?)
}

fn move_body(
    ids: &[String],
    project_id: &Option<String>,
    section_id: &Option<String>,
) -> Result<Value, &'static str> {
    selection(ids)?;
    let id_ok = |id: &Option<String>| id.as_deref().is_none_or(valid_id);
    if !id_ok(project_id) || !id_ok(section_id) || (project_id.is_none() && section_id.is_some()) {
        return Err(INVALID);
    }
    Ok(json!({ "ids": ids, "projectId": project_id, "sectionId": section_id }))
}

/// Inbox is `projectId: null` (no section).
#[tauri::command]
pub async fn bulk_move(
    state: tauri::State<'_, NativeAuth>,
    ids: Vec<String>,
    project_id: Option<String>,
    section_id: Option<String>,
) -> Result<Option<Value>, String> {
    let body = move_body(&ids, &project_id, &section_id)?;
    Ok(state
        .write(Method::POST, "/api/v1/bulk/move", Some(body))
        .await?)
}

/// An anchor with its position, a status board column (ticket 17), or both.
fn reorder_body(
    anchor_id: Option<&str>,
    position: Option<&str>,
    status: Option<&str>,
) -> Result<Value, &'static str> {
    let mut body = json!({});
    match (anchor_id, position) {
        (Some(anchor_id), Some(position))
            if valid_id(anchor_id) && matches!(position, "before" | "after") =>
        {
            body["anchorId"] = json!(anchor_id);
            body["position"] = json!(position);
        }
        (None, None) if status.is_some() => {}
        _ => return Err(INVALID),
    }
    match status {
        Some(status) if matches!(status, "todo" | "in_progress" | "done") => {
            body["status"] = json!(status)
        }
        Some(_) => return Err(INVALID),
        None => {}
    }
    Ok(body)
}

/// Places a task next to another task of the same collection and/or sets its
/// status; a status alone appends the task to its collection.
#[tauri::command]
pub async fn reorder_task(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    anchor_id: Option<String>,
    position: Option<String>,
    status: Option<String>,
    confirm_criteria: Option<bool>,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    let body = confirmed(
        reorder_body(anchor_id.as_deref(), position.as_deref(), status.as_deref())?,
        confirm_criteria,
    );
    Ok(state
        .write(
            Method::POST,
            &format!("/api/v1/tasks/{id}/reorder"),
            Some(body),
        )
        .await?)
}

#[cfg(test)]
mod tests {
    use super::{
        Completion, MetadataChange, complete_body, ids_body, metadata_body, move_body, reorder_body,
    };
    use serde_json::{Value, json};

    const TAP: &str = "33333333-3333-4333-8333-333333333333";
    const INVALID: Result<Value, &str> = Err("Check your entry and try again.");
    fn ids(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }
    fn metadata(ids: &[String], change: Value) -> Result<Value, &'static str> {
        metadata_body(
            ids,
            &serde_json::from_value::<MetadataChange>(change).map_err(|_| "unparsed")?,
        )
    }

    #[test]
    fn selections_are_bounded_and_ids_validated() {
        assert_eq!(
            ids_body(&ids(&["a", "b"])).unwrap(),
            json!({ "ids": ["a", "b"] })
        );
        let many: Vec<String> = (0..201).map(|index| format!("t{index}")).collect();
        for selection in [vec![], many, ids(&["a", "../account"]), ids(&["a?b"])] {
            assert_eq!(ids_body(&selection), INVALID);
        }
    }

    #[test]
    fn completion_bodies_carry_occurrences_and_one_uuid_tap_id() {
        let tasks: Vec<Completion> = serde_json::from_value(json!([
            { "id": "a", "occurrence": "2026-10-05T09:00:00.000Z" }, { "id": "b", "occurrence": null }
        ])).unwrap();
        assert_eq!(
            complete_body(&tasks, TAP).unwrap(),
            json!({ "operationId": TAP, "tasks": [{ "id": "a", "occurrence": "2026-10-05T09:00:00.000Z" }, { "id": "b", "occurrence": null }] })
        );
        assert_eq!(complete_body(&tasks, "tap"), INVALID);
        assert_eq!(complete_body(&[], TAP), INVALID);
        assert!(
            serde_json::from_value::<Vec<Completion>>(
                json!([{ "id": "a", "occurrence": null, "userId": "bob" }])
            )
            .is_err()
        );
    }

    #[test]
    fn metadata_bodies_change_exactly_one_field() {
        let selection = ids(&["a"]);
        assert_eq!(
            metadata(&selection, json!({ "priority": 1 })).unwrap(),
            json!({ "ids": ["a"], "priority": 1 })
        );
        assert_eq!(
            metadata(&selection, json!({ "deadline": null })).unwrap(),
            json!({ "ids": ["a"], "deadline": null })
        );
        assert_eq!(
            metadata(&selection, json!({ "labelIds": [] })).unwrap(),
            json!({ "ids": ["a"], "labelIds": [] })
        );
        assert_eq!(
            metadata(&selection, json!({ "horizon": "later" })).unwrap(),
            json!({ "ids": ["a"], "horizon": "later" })
        );
        assert_eq!(
            metadata(&selection, json!({ "horizon": null })).unwrap(),
            json!({ "ids": ["a"], "horizon": null })
        );
        for change in [
            json!({ "horizon": "someday" }),
            json!({ "horizon": "now", "priority": 1 }),
            json!({}),
            json!({ "priority": 5 }),
            json!({ "priority": 1, "deadline": null }),
            json!({ "labelIds": ["../x"] }),
            json!({ "deadline": "" }),
        ] {
            assert_eq!(metadata(&selection, change.clone()), INVALID, "{change}");
        }
        assert_eq!(
            metadata(&selection, json!({ "title": "x" })),
            Err("unparsed")
        );
    }

    #[test]
    fn moves_and_reorders_are_rebuilt_from_validated_ids() {
        let selection = ids(&["a"]);
        assert_eq!(
            move_body(&selection, &Some("work".into()), &None).unwrap(),
            json!({ "ids": ["a"], "projectId": "work", "sectionId": null })
        );
        assert_eq!(
            move_body(&selection, &None, &None).unwrap(),
            json!({ "ids": ["a"], "projectId": null, "sectionId": null })
        );
        assert_eq!(move_body(&selection, &None, &Some("doing".into())), INVALID);
        assert_eq!(move_body(&selection, &Some("a/b".into()), &None), INVALID);
        assert_eq!(
            reorder_body(Some("b"), Some("after"), None).unwrap(),
            json!({ "anchorId": "b", "position": "after" })
        );
        assert_eq!(
            reorder_body(None, None, Some("in_progress")).unwrap(),
            json!({ "status": "in_progress" })
        );
        assert_eq!(
            reorder_body(Some("b"), Some("before"), Some("done")).unwrap(),
            json!({ "anchorId": "b", "position": "before", "status": "done" })
        );
        for (anchor, position, status) in [
            (Some("b"), Some("middle"), None),
            (Some("../b"), Some("before"), None),
            (None, None, None),
            (Some("b"), None, Some("done")),
            (None, Some("after"), Some("done")),
            (None, None, Some("archived")),
        ] {
            assert_eq!(reorder_body(anchor, position, status), INVALID);
        }
    }
}
