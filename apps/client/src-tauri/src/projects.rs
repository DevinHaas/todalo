// Narrow project commands: one fixed method and path per operation, IDs and
// names validated here before a URL or body is built. No path-taking command.
use crate::{auth::NativeAuth, reads::valid_id};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const INVALID: &str = "Check your entry and try again.";
const UNAVAILABLE: &str = "Your tasks could not be loaded. Try again.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";

#[tauri::command]
pub async fn projects(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/projects")
        .await?
        .ok_or_else(|| UNAVAILABLE.to_owned())
}

#[tauri::command]
pub async fn project(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state.read(&format!("/api/v1/projects/{id}")).await?)
}

#[tauri::command]
pub async fn create_project(
    state: tauri::State<'_, NativeAuth>,
    name: String,
    color: Option<String>,
    favorite: Option<bool>,
) -> Result<Value, String> {
    let mut body = name_body(&name)?;
    if let Some(color) = color {
        if !valid_color(&color) {
            return Err(INVALID.to_owned());
        }
        body["color"] = json!(color);
    }
    if let Some(favorite) = favorite {
        body["favorite"] = json!(favorite);
    }
    state
        .write(Method::POST, "/api/v1/projects", Some(body))
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[tauri::command]
pub async fn rename_project(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    name: String,
) -> Result<Option<Value>, String> {
    let body = name_body(&name)?;
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::PATCH, &format!("/api/v1/projects/{id}"), Some(body))
        .await?)
}

/// Edit, favorite, archive, description and Display: only the fields sent change.
#[tauri::command]
pub async fn update_project(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    change: ProjectChange,
) -> Result<Option<Value>, String> {
    let body = change_body(&change)?;
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::PATCH, &format!("/api/v1/projects/{id}"), Some(body))
        .await?)
}

#[tauri::command]
pub async fn delete_project(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .write(Method::DELETE, &format!("/api/v1/projects/{id}"), None)
        .await?)
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectChange {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    favorite: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    archived: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    display: Option<Display>,
}

/// The project's Display settings; each value one of the server's choices.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Display {
    layout: String,
    show_completed: bool,
    calendar_range: String,
    grouping: String,
    sorting: String,
    date: String,
    deadline: String,
    created: String,
    priority: String,
    label: String,
}

const DESCRIPTION_MAX: usize = 16_383;

fn valid_color(color: &str) -> bool {
    color.len() == 7 && color.starts_with('#') && color[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn valid_display(display: &Display) -> bool {
    let one_of = |value: &str, choices: &[&str]| choices.contains(&value);
    one_of(&display.layout, &["list", "board", "calendar", "table"])
        && one_of(&display.calendar_range, &["week", "month"])
        && one_of(
            &display.grouping,
            &["none", "date", "deadline", "added", "priority", "label"],
        )
        && one_of(
            &display.sorting,
            &["manual", "date", "deadline", "added", "priority", "name"],
        )
        && one_of(&display.date, &["all", "today", "week", "overdue", "none"])
        && one_of(
            &display.deadline,
            &["all", "week", "overdue", "any", "none"],
        )
        && one_of(&display.created, &["all", "today", "week", "month"])
        && one_of(&display.priority, &["all", "1", "2", "3", "4"])
        && (display.label == "all" || valid_id(&display.label))
}

/// Rebuilds the PATCH body from typed, checked fields; an empty change is refused.
fn change_body(change: &ProjectChange) -> Result<Value, &'static str> {
    let name = match &change.name {
        Some(name) => Some(name_body(name)?["name"].clone()),
        None => None,
    };
    let valid = change.color.as_deref().is_none_or(valid_color)
        && change
            .description
            .as_ref()
            .is_none_or(|text| text.chars().count() <= DESCRIPTION_MAX)
        && change.display.as_ref().is_none_or(valid_display);
    let mut body = serde_json::to_value(change).map_err(|_| INVALID)?;
    if let Some(name) = name {
        body["name"] = name;
    }
    if !valid || body.as_object().is_none_or(|fields| fields.is_empty()) {
        return Err(INVALID);
    }
    Ok(body)
}

/// Mirrors the server rule (trimmed, 1–200 characters) so oversized input never leaves.
fn name_body(name: &str) -> Result<Value, &'static str> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 200 {
        return Err(INVALID);
    }
    Ok(json!({ "name": name }))
}

#[cfg(test)]
mod tests {
    use super::{ProjectChange, change_body, name_body};
    use serde_json::{Value, json};

    fn change(value: Value) -> Result<Value, &'static str> {
        change_body(&serde_json::from_value::<ProjectChange>(value).map_err(|_| "unparsed")?)
    }

    #[test]
    fn project_changes_are_typed_and_checked() {
        assert_eq!(
            change(json!({ "name": " Job ", "favorite": true, "archived": false })).unwrap(),
            json!({ "name": "Job", "favorite": true, "archived": false })
        );
        let display = json!({ "layout": "table", "showCompleted": true, "calendarRange": "week", "grouping": "priority",
            "sorting": "name", "date": "week", "deadline": "any", "created": "month", "priority": "1", "label": "design" });
        assert_eq!(
            change(json!({ "display": display.clone() })).unwrap(),
            json!({ "display": display })
        );
        for value in [
            json!({}),
            json!({ "color": "blue" }),
            json!({ "name": " " }),
            json!({ "description": "x".repeat(16_384) }),
            json!({ "display": { "layout": "grid", "showCompleted": false, "calendarRange": "week", "grouping": "none",
                "sorting": "manual", "date": "all", "deadline": "all", "created": "all", "priority": "all", "label": "all" } }),
        ] {
            assert_eq!(
                change(value.clone()),
                Err("Check your entry and try again."),
                "{value}"
            );
        }
        assert_eq!(change(json!({ "userId": "bob" })), Err("unparsed"));
    }

    #[test]
    fn project_names_are_trimmed_and_bounded() {
        assert_eq!(name_body("  Work ").unwrap(), json!({ "name": "Work" }));
        assert!(name_body(&"é".repeat(200)).is_ok());
        for name in ["", "   ", &"x".repeat(201)] {
            assert_eq!(name_body(name), Err("Check your entry and try again."));
        }
    }
}
