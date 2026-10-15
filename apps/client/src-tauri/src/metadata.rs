// Narrow label and saved-filter commands (ticket 14): one fixed method and path
// per operation. IDs are validated and bodies rebuilt from typed fields here,
// so the webview cannot choose a path or add server fields.
use crate::{auth::NativeAuth, reads::valid_id, writes::valid_operation_id};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const INVALID: &str = "Check your entry and try again.";
const UNAVAILABLE: &str = "Your tasks could not be loaded. Try again.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";

/// Legacy labelInput: trimmed name of 1–100 characters, optional `#rrggbb`.
#[derive(Deserialize, Serialize)]
pub struct LabelFields {
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    color: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Status {
    Any,
    Open,
    Done,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Due {
    Any,
    Today,
    Overdue,
    Undated,
}

/// The legacy filter definition; unknown predicates are dropped.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Definition {
    #[serde(default)]
    priority: Option<u8>,
    #[serde(default)]
    label_id: Option<String>,
    #[serde(default)]
    project_id: Option<String>,
    status: Status,
    due: Due,
}

#[derive(Deserialize, Serialize)]
pub struct FilterFields {
    name: String,
    definition: Definition,
}

fn valid_name(name: &str) -> bool {
    let name = name.trim();
    !name.is_empty() && name.chars().count() <= 100
}

fn label_body(id: Option<&str>, label: &LabelFields) -> Result<Value, &'static str> {
    let color_ok = label.color.as_deref().is_none_or(|color| {
        color.len() == 7
            && color.starts_with('#')
            && color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
    });
    if !valid_name(&label.name) || !color_ok || id.is_some_and(|id| !valid_operation_id(id)) {
        return Err(INVALID);
    }
    let mut body = serde_json::to_value(label).map_err(|_| INVALID)?;
    body["name"] = label.name.trim().into();
    if let Some(id) = id {
        body["id"] = id.into();
    }
    Ok(body)
}

fn filter_body(id: Option<&str>, filter: &FilterFields) -> Result<Value, &'static str> {
    let definition = &filter.definition;
    if !valid_name(&filter.name)
        || definition
            .priority
            .is_some_and(|priority| !(1..=4).contains(&priority))
        || definition
            .label_id
            .as_deref()
            .is_some_and(|id| !valid_id(id))
        || definition
            .project_id
            .as_deref()
            .is_some_and(|id| !valid_id(id))
        || id.is_some_and(|id| !valid_operation_id(id))
    {
        return Err(INVALID);
    }
    let mut body = serde_json::to_value(filter).map_err(|_| INVALID)?;
    body["name"] = filter.name.trim().into();
    if let Some(id) = id {
        body["id"] = id.into();
    }
    Ok(body)
}

#[tauri::command]
pub async fn metadata(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/metadata")
        .await?
        .ok_or_else(|| UNAVAILABLE.to_owned())
}

#[tauri::command]
pub async fn label(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state.read(&format!("/api/v1/labels/{id}")).await?)
}

/// `id` is the client-generated create operation ID (a retry returns the original).
#[tauri::command]
pub async fn create_label(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    label: LabelFields,
) -> Result<Value, String> {
    let body = label_body(Some(&id), &label)?;
    state
        .write(Method::POST, "/api/v1/labels", Some(body))
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[tauri::command]
pub async fn update_label(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    label: LabelFields,
) -> Result<Option<Value>, String> {
    let body = label_body(None, &label)?;
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::PATCH, &format!("/api/v1/labels/{id}"), Some(body))
        .await?)
}

#[tauri::command]
pub async fn delete_label(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::DELETE, &format!("/api/v1/labels/{id}"), None)
        .await?)
}

#[tauri::command]
pub async fn saved_filter(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state.read(&format!("/api/v1/filters/{id}")).await?)
}

#[tauri::command]
pub async fn create_filter(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    filter: FilterFields,
) -> Result<Value, String> {
    let body = filter_body(Some(&id), &filter)?;
    state
        .write(Method::POST, "/api/v1/filters", Some(body))
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[tauri::command]
pub async fn update_filter(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    filter: FilterFields,
) -> Result<Option<Value>, String> {
    let body = filter_body(None, &filter)?;
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::PATCH, &format!("/api/v1/filters/{id}"), Some(body))
        .await?)
}

#[tauri::command]
pub async fn delete_filter(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::DELETE, &format!("/api/v1/filters/{id}"), None)
        .await?)
}

#[cfg(test)]
mod tests {
    use super::{FilterFields, LabelFields, filter_body, label_body};
    use serde_json::json;

    const ID: &str = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";

    #[test]
    fn label_bodies_are_rebuilt_trimmed_and_bounded() {
        let label: LabelFields = serde_json::from_value(
            json!({ "name": " Home ", "color": "#00ff00", "userId": "bob" }),
        )
        .unwrap();
        assert_eq!(
            label_body(Some(ID), &label).unwrap(),
            json!({ "id": ID, "name": "Home", "color": "#00ff00" })
        );
        assert_eq!(
            label_body(None, &label).unwrap(),
            json!({ "name": "Home", "color": "#00ff00" })
        );
        for input in [
            json!({ "name": "  " }),
            json!({ "name": "x".repeat(101) }),
            json!({ "name": "A", "color": "red" }),
            json!({ "name": "A", "color": "#00ff0g" }),
        ] {
            let label: LabelFields = serde_json::from_value(input).unwrap();
            assert_eq!(
                label_body(None, &label),
                Err("Check your entry and try again.")
            );
        }
        let label: LabelFields = serde_json::from_value(json!({ "name": "A" })).unwrap();
        assert_eq!(
            label_body(Some("../x"), &label),
            Err("Check your entry and try again.")
        );
    }

    #[test]
    fn filter_bodies_carry_only_the_legacy_definition() {
        let filter: FilterFields = serde_json::from_value(json!({
            "name": " Urgent ",
            "definition": { "priority": 1, "labelId": "urgent", "projectId": null, "status": "open", "due": "today", "sql": "drop" }
        }))
        .unwrap();
        assert_eq!(
            filter_body(Some(ID), &filter).unwrap(),
            json!({
                "id": ID, "name": "Urgent",
                "definition": { "priority": 1, "labelId": "urgent", "projectId": null, "status": "open", "due": "today" }
            })
        );
        for definition in [
            json!({ "priority": 5, "status": "open", "due": "any" }),
            json!({ "labelId": "../x", "status": "open", "due": "any" }),
            json!({ "projectId": "", "status": "open", "due": "any" }),
        ] {
            let filter: FilterFields =
                serde_json::from_value(json!({ "name": "A", "definition": definition })).unwrap();
            assert_eq!(
                filter_body(None, &filter),
                Err("Check your entry and try again.")
            );
        }
        assert!(
            serde_json::from_value::<FilterFields>(
                json!({ "name": "A", "definition": { "status": "later", "due": "any" } })
            )
            .is_err()
        );
    }
}
