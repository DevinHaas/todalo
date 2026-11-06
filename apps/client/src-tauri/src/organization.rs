// Narrow ticket 13 commands: destinations, section create/delete and one task's
// move or parent change. One fixed method and path each; IDs validated and
// bodies rebuilt from typed fields here. No path-taking command.
use crate::{auth::NativeAuth, reads::valid_id};
use reqwest::Method;
use serde::{Deserialize, Deserializer};
use serde_json::{Value, json};

const INVALID: &str = "Check your entry and try again.";
const UNAVAILABLE: &str = "Your tasks could not be loaded. Try again.";

#[tauri::command]
pub async fn destinations(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/destinations")
        .await?
        .ok_or_else(|| UNAVAILABLE.to_owned())
}

#[tauri::command]
pub async fn create_section(
    state: tauri::State<'_, NativeAuth>,
    project_id: String,
    name: String,
) -> Result<Option<Value>, String> {
    let body = section_body(&name)?;
    if !valid_id(&project_id) {
        return Ok(None);
    }
    Ok(state
        .write(
            Method::POST,
            &format!("/api/v1/projects/{project_id}/sections"),
            Some(body),
        )
        .await?)
}

#[tauri::command]
pub async fn delete_section(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::DELETE, &format!("/api/v1/sections/{id}"), None)
        .await?)
}

#[tauri::command]
pub async fn organize_task(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    change: Organization,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    let body = organization_body(&change)?;
    Ok(state
        .write(Method::PATCH, &format!("/api/v1/tasks/{id}"), Some(body))
        .await?)
}

/// Mirrors the server rule (trimmed, 1–200 characters).
fn section_body(name: &str) -> Result<Value, &'static str> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 200 {
        return Err(INVALID);
    }
    Ok(json!({ "name": name }))
}

// `None`: the field was absent; `Some(None)`: sent as null.
fn present<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(deserializer).map(Some)
}

/// A move (`projectId` + `sectionId`) or a parent change (`parentId`), never
/// both, with the `updatedAt` of the copy it started from.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Organization {
    updated_at: String,
    #[serde(default, deserialize_with = "present")]
    project_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    section_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    parent_id: Option<Option<String>>,
}

fn organization_body(change: &Organization) -> Result<Value, &'static str> {
    let id_ok = |id: &Option<String>| id.as_deref().is_none_or(valid_id);
    if change.updated_at.is_empty() || change.updated_at.len() > 64 {
        return Err(INVALID);
    }
    match (&change.project_id, &change.section_id, &change.parent_id) {
        (Some(project), Some(section), None) if id_ok(project) && id_ok(section) => Ok(json!({
            "updatedAt": change.updated_at, "projectId": project, "sectionId": section,
        })),
        (None, None, Some(parent)) if id_ok(parent) => Ok(json!({
            "updatedAt": change.updated_at, "parentId": parent,
        })),
        _ => Err(INVALID),
    }
}

#[cfg(test)]
mod tests {
    use super::{Organization, organization_body, section_body};
    use serde_json::{Value, json};

    const VERSION: &str = "2026-10-04T08:00:00.000Z";
    fn body(value: Value) -> Result<Value, &'static str> {
        organization_body(&serde_json::from_value::<Organization>(value).map_err(|_| "unparsed")?)
    }

    #[test]
    fn section_names_are_trimmed_and_bounded() {
        assert_eq!(
            section_body("  Doing ").unwrap(),
            json!({ "name": "Doing" })
        );
        for name in ["", "  ", &"x".repeat(201)] {
            assert_eq!(section_body(name), Err("Check your entry and try again."));
        }
    }

    #[test]
    fn organization_bodies_are_one_move_or_one_parent_change() {
        assert_eq!(
            body(json!({ "updatedAt": VERSION, "projectId": "work", "sectionId": null })).unwrap(),
            json!({ "updatedAt": VERSION, "projectId": "work", "sectionId": null })
        );
        assert_eq!(
            body(json!({ "updatedAt": VERSION, "projectId": null, "sectionId": null })).unwrap(),
            json!({ "updatedAt": VERSION, "projectId": null, "sectionId": null })
        );
        assert_eq!(
            body(json!({ "updatedAt": VERSION, "parentId": null })).unwrap(),
            json!({ "updatedAt": VERSION, "parentId": null })
        );
        for value in [
            json!({ "updatedAt": VERSION }),
            json!({ "updatedAt": VERSION, "projectId": "work" }),
            json!({ "updatedAt": VERSION, "projectId": "work", "sectionId": null, "parentId": "p" }),
            json!({ "updatedAt": VERSION, "parentId": "../account" }),
            json!({ "updatedAt": VERSION, "projectId": "a/b", "sectionId": null }),
            json!({ "updatedAt": "", "parentId": null }),
        ] {
            assert_eq!(
                body(value.clone()),
                Err("Check your entry and try again."),
                "{value}"
            );
        }
        assert_eq!(
            body(json!({ "updatedAt": VERSION, "parentId": null, "title": "x" })),
            Err("unparsed")
        );
    }
}
