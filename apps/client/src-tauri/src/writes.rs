// Narrow task commands: one fixed method and path per operation. IDs are
// validated before a URL is built and bodies are rebuilt from typed fields, so
// the webview cannot add server fields (such as a user ID) or choose a path.
use crate::{auth::NativeAuth, reads::valid_id};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const INVALID: &str = "Check your entry and try again.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    /// Client-generated UUID: the operation ID that makes a retry safe.
    id: String,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    due_date: Option<String>,
    /// Quick add's detected end time and repeat (ticket 12); omitted when unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    due_date_end: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    recurrence: Option<Recurrence>,
    /// The composer's destination, Additional actions and insert position; omitted when unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    project_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    section_id: Option<String>,
    /// "Add sub-task": the parent the new task nests under.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    priority: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    deadline: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    label_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    placement: Option<Placement>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Edge {
    Top,
    Bottom,
    Above,
    Below,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Placement {
    edge: Edge,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    anchor_id: Option<String>,
}

pub(crate) fn valid_operation_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        })
}

fn task_body(task: &NewTask) -> Result<Value, &'static str> {
    if !valid_operation_id(&task.id)
        || task.title.trim().is_empty()
        || task.recurrence.as_ref().is_some_and(invalid_recurrence)
        || task
            .priority
            .is_some_and(|priority| !(1..=4).contains(&priority))
        || task.label_ids.as_deref().is_some_and(invalid_labels)
        || [
            &task.project_id,
            &task.section_id,
            &task.parent_id,
            &task
                .placement
                .as_ref()
                .and_then(|placement| placement.anchor_id.clone()),
        ]
        .into_iter()
        .any(|id| id.as_deref().is_some_and(|id| !valid_id(id)))
    {
        return Err(INVALID);
    }
    serde_json::to_value(task).map_err(|_| INVALID)
}

#[tauri::command]
pub async fn create_task(
    state: tauri::State<'_, NativeAuth>,
    task: NewTask,
) -> Result<Value, String> {
    let body = task_body(&task)?;
    state
        .write(Method::POST, "/api/v1/tasks", Some(body))
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

fn completion_body(
    occurrence: Option<String>,
    operation_id: Option<String>,
) -> Result<Value, &'static str> {
    match operation_id {
        Some(id) if !valid_operation_id(&id) => Err(INVALID),
        Some(id) => Ok(json!({ "occurrence": occurrence, "operationId": id })),
        None => Ok(json!({ "occurrence": occurrence })),
    }
}

/// `occurrence` is the due date the client saw (or null) and `operation_id`
/// identifies the tap, so a replay is recognised and a stale tap refused (412).
#[tauri::command]
pub async fn complete_task(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    occurrence: Option<String>,
    operation_id: Option<String>,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    let body = completion_body(occurrence, operation_id)?;
    Ok(state
        .write(
            Method::POST,
            &format!("/api/v1/tasks/{id}/complete"),
            Some(body),
        )
        .await?)
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Unit {
    Day,
    Week,
    Month,
    Year,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum BasedOn {
    Scheduled,
    Completed,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Recurrence {
    n: u32,
    unit: Unit,
    based_on: BasedOn,
    until: Option<String>,
}

/// The editable task details (ticket 11). Every field is sent; dates are ISO
/// strings validated by the API. `updated_at` is the copy the edit started from.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDetails {
    updated_at: String,
    title: String,
    description: String,
    priority: u8,
    deadline: Option<String>,
    due_date: Option<String>,
    due_date_end: Option<String>,
    recurrence: Option<Recurrence>,
    /// The dialog's full label set (ticket 14); omitted keeps the task's labels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    label_ids: Option<Vec<String>>,
}

fn invalid_labels(ids: &[String]) -> bool {
    ids.len() > 50 || !ids.iter().all(|id| valid_id(id))
}

fn invalid_recurrence(recurrence: &Recurrence) -> bool {
    !(1..=1000).contains(&recurrence.n)
}

fn details_body(details: &TaskDetails) -> Result<Value, &'static str> {
    let title = details.title.trim();
    if title.is_empty()
        || title.chars().count() > 500
        || details.description.chars().count() > 10_000
        || !(1..=4).contains(&details.priority)
        || details.recurrence.as_ref().is_some_and(invalid_recurrence)
        || details.label_ids.as_deref().is_some_and(invalid_labels)
    {
        return Err(INVALID);
    }
    serde_json::to_value(details).map_err(|_| INVALID)
}

#[tauri::command]
pub async fn update_task(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    details: TaskDetails,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    let body = details_body(&details)?;
    Ok(state
        .write(Method::PATCH, &format!("/api/v1/tasks/{id}"), Some(body))
        .await?)
}

#[tauri::command]
pub async fn delete_task(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::DELETE, &format!("/api/v1/tasks/{id}"), None)
        .await?)
}

#[cfg(test)]
mod tests {
    use super::{NewTask, TaskDetails, completion_body, details_body, task_body};
    use serde_json::json;

    fn task(id: &str, title: &str) -> NewTask {
        NewTask {
            id: id.into(),
            title: title.into(),
            description: None,
            due_date: Some("2026-10-15T00:00:00.000Z".into()),
            due_date_end: None,
            recurrence: None,
            project_id: None,
            section_id: None,
            parent_id: None,
            priority: None,
            deadline: None,
            label_ids: None,
            placement: None,
        }
    }

    #[test]
    fn composer_bodies_carry_project_metadata_and_placement() {
        let id = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";
        let body = json!({
            "id": id, "title": "Draft", "dueDate": null, "projectId": "qa-work", "sectionId": "qa-doing", "parentId": "qa-parent",
            "priority": 2, "deadline": "2026-10-20T00:00:00.000Z", "labelIds": ["design"],
            "placement": { "edge": "below", "anchorId": "undated" }
        });
        let parsed: NewTask = serde_json::from_value(body.clone()).unwrap();
        assert_eq!(task_body(&parsed).unwrap(), body);
        for bad in [
            json!({ "priority": 5 }),
            json!({ "projectId": "../account" }),
            json!({ "parentId": "../account" }),
            json!({ "labelIds": ["a/b"] }),
            json!({ "placement": { "edge": "below", "anchorId": "../x" } }),
        ] {
            let mut input = json!({ "id": id, "title": "Draft", "dueDate": null });
            input
                .as_object_mut()
                .unwrap()
                .extend(bad.as_object().unwrap().clone());
            let parsed: NewTask = serde_json::from_value(input).unwrap();
            assert_eq!(task_body(&parsed), Err("Check your entry and try again."));
        }
        assert!(serde_json::from_value::<NewTask>(json!({ "id": id, "title": "Draft", "dueDate": null, "placement": { "edge": "middle" } })).is_err());
    }

    #[test]
    fn quick_add_bodies_carry_the_detected_end_time_and_repeat() {
        let id = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";
        let input = json!({
            "id": id, "title": "Standup", "dueDate": "2026-10-15T09:00:00.000Z",
            "dueDateEnd": "2026-10-15T09:30:00.000Z",
            "recurrence": { "n": 2, "unit": "week", "basedOn": "scheduled", "until": null, "userId": "bob" }
        });
        let parsed: NewTask = serde_json::from_value(input).unwrap();
        assert_eq!(
            task_body(&parsed).unwrap(),
            json!({
                "id": id, "title": "Standup", "dueDate": "2026-10-15T09:00:00.000Z",
                "dueDateEnd": "2026-10-15T09:30:00.000Z",
                "recurrence": { "n": 2, "unit": "week", "basedOn": "scheduled", "until": null }
            })
        );
        let zero: NewTask = serde_json::from_value(json!({
            "id": id, "title": "Standup", "dueDate": null,
            "recurrence": { "n": 0, "unit": "day", "basedOn": "scheduled", "until": null }
        }))
        .unwrap();
        assert_eq!(task_body(&zero), Err("Check your entry and try again."));
    }

    #[test]
    fn create_bodies_carry_only_task_fields_and_a_uuid_operation_id() {
        let id = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";
        assert_eq!(
            task_body(&task(id, "Plan")).unwrap(),
            json!({ "id": id, "title": "Plan", "dueDate": "2026-10-15T00:00:00.000Z" })
        );
        // Unknown webview fields such as userId are dropped by deserialization.
        let parsed: NewTask =
            serde_json::from_value(json!({ "id": id, "title": "Plan", "userId": "bob" })).unwrap();
        assert!(task_body(&parsed).unwrap().get("userId").is_none());
        for (id, title) in [
            (id, " "),
            ("../account", "Plan"),
            ("6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a1", "Plan"),
            ("6f1c1b7e/3a52-4c55-9b2a-3f4f3e8f0a11", "Plan"),
        ] {
            assert_eq!(
                task_body(&task(id, title)),
                Err("Check your entry and try again.")
            );
        }
    }

    #[test]
    fn completion_bodies_carry_only_the_occurrence_and_a_uuid_tap_id() {
        let id = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";
        assert_eq!(
            completion_body(None, Some(id.into())).unwrap(),
            json!({ "occurrence": null, "operationId": id })
        );
        assert_eq!(
            completion_body(Some("2026-10-15T00:00:00.000Z".into()), None).unwrap(),
            json!({ "occurrence": "2026-10-15T00:00:00.000Z" })
        );
        assert_eq!(
            completion_body(None, Some("../x".into())),
            Err("Check your entry and try again.")
        );
    }

    #[test]
    fn edit_bodies_are_rebuilt_from_typed_detail_fields() {
        let input = json!({
            "updatedAt": "2026-10-15T08:00:00.000Z", "title": "Plan", "description": "",
            "priority": 2, "deadline": null, "dueDate": "2026-10-15T07:00:00.000Z", "dueDateEnd": null,
            "recurrence": { "n": 1, "unit": "week", "basedOn": "completed", "until": null },
            "userId": "bob", "projectId": "other"
        });
        let details: TaskDetails = serde_json::from_value(input).unwrap();
        assert_eq!(
            details_body(&details).unwrap(),
            json!({
                "updatedAt": "2026-10-15T08:00:00.000Z", "title": "Plan", "description": "",
                "priority": 2, "deadline": null, "dueDate": "2026-10-15T07:00:00.000Z", "dueDateEnd": null,
                "recurrence": { "n": 1, "unit": "week", "basedOn": "completed", "until": null }
            })
        );
        for change in [
            json!({ "title": "  " }),
            json!({ "priority": 5 }),
            json!({ "recurrence": { "n": 0, "unit": "day", "basedOn": "scheduled", "until": null } }),
        ] {
            let mut value = serde_json::to_value(&details).unwrap();
            for (key, field) in change.as_object().unwrap() {
                value[key] = field.clone();
            }
            let parsed: TaskDetails = serde_json::from_value(value).unwrap();
            assert_eq!(
                details_body(&parsed),
                Err("Check your entry and try again.")
            );
        }
        // An unknown recurrence unit cannot even be deserialized.
        assert!(serde_json::from_value::<TaskDetails>(json!({
            "updatedAt": "x", "title": "Plan", "description": "", "priority": 4, "deadline": null,
            "dueDate": null, "dueDateEnd": null, "recurrence": { "n": 1, "unit": "fortnight", "basedOn": "scheduled", "until": null }
        })).is_err());
    }

    #[test]
    fn edit_bodies_carry_a_bounded_set_of_label_ids_only_when_sent() {
        let base = json!({
            "updatedAt": "2026-10-15T08:00:00.000Z", "title": "Plan", "description": "", "priority": 4,
            "deadline": null, "dueDate": null, "dueDateEnd": null, "recurrence": null
        });
        let without: TaskDetails = serde_json::from_value(base.clone()).unwrap();
        assert!(details_body(&without).unwrap().get("labelIds").is_none());
        let mut labeled = base.clone();
        labeled["labelIds"] = json!(["urgent", "home"]);
        let parsed: TaskDetails = serde_json::from_value(labeled).unwrap();
        assert_eq!(
            details_body(&parsed).unwrap()["labelIds"],
            json!(["urgent", "home"])
        );
        for ids in [
            json!(["../labels"]),
            json!([""]),
            json!((0..51).map(|index| format!("l{index}")).collect::<Vec<_>>()),
        ] {
            let mut value = base.clone();
            value["labelIds"] = ids;
            let parsed: TaskDetails = serde_json::from_value(value).unwrap();
            assert_eq!(
                details_body(&parsed),
                Err("Check your entry and try again.")
            );
        }
    }
}
