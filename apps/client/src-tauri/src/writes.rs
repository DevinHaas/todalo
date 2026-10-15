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
}

fn valid_operation_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        })
}

fn task_body(task: &NewTask) -> Result<Value, &'static str> {
    if !valid_operation_id(&task.id) || task.title.trim().is_empty() {
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

/// `occurrence` is the due date the client saw (or null), so a replayed
/// completion cannot advance a recurring task twice.
#[tauri::command]
pub async fn complete_task(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    occurrence: Option<String>,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(
            Method::POST,
            &format!("/api/v1/tasks/{id}/complete"),
            Some(json!({ "occurrence": occurrence })),
        )
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
    use super::{NewTask, task_body};
    use serde_json::json;

    fn task(id: &str, title: &str) -> NewTask {
        NewTask {
            id: id.into(),
            title: title.into(),
            description: None,
            due_date: Some("2026-10-15T00:00:00.000Z".into()),
        }
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
}
