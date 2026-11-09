// Goals ticket 24: the Coach's Patterns. Fixed paths; pattern IDs are checked
// like draft IDs and the edit body is rebuilt from one typed string.
use crate::auth::NativeAuth;
use crate::coach::{draft_id, zoned};
use reqwest::Method;
use serde_json::Value;

const INVALID: &str = "Check your entry and try again.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";

/// `{ patterns }`, oldest first.
#[tauri::command]
pub async fn coach_patterns(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/coach/patterns")
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// `{ patterns, learned, message? }`; null (404) when no provider is connected.
#[tauri::command]
pub async fn learn_coach_patterns(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
) -> Result<Option<Value>, String> {
    Ok(state
        .write(
            Method::POST,
            &zoned("/api/v1/coach/patterns/learn", time_zone)?,
            None,
        )
        .await?)
}

#[tauri::command]
pub async fn update_coach_pattern(
    state: tauri::State<'_, NativeAuth>,
    id: String,
    statement: String,
) -> Result<Option<Value>, String> {
    let body = statement_body(statement)?;
    Ok(state
        .write(Method::PATCH, &pattern_path(&id)?, Some(body))
        .await?)
}

#[tauri::command]
pub async fn delete_coach_pattern(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    Ok(state
        .write(Method::DELETE, &pattern_path(&id)?, None)
        .await?)
}

fn pattern_path(id: &str) -> Result<String, String> {
    if !draft_id(id) {
        return Err(INVALID.to_owned());
    }
    Ok(format!("/api/v1/coach/patterns/{id}"))
}

fn statement_body(statement: String) -> Result<Value, &'static str> {
    if statement.trim().is_empty() || statement.chars().count() > 160 {
        return Err(INVALID);
    }
    Ok(serde_json::json!({ "statement": statement }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pattern_requests_carry_only_a_plain_id_and_the_statement() {
        assert_eq!(
            pattern_path("3f2c-11").unwrap(),
            "/api/v1/coach/patterns/3f2c-11"
        );
        assert!(pattern_path("../coach").is_err());
        assert!(pattern_path("a/b").is_err());
        assert_eq!(
            statement_body("Mornings".into()).unwrap(),
            serde_json::json!({ "statement": "Mornings" })
        );
        assert_eq!(statement_body(" ".into()), Err(INVALID));
        assert_eq!(statement_body("x".repeat(161)), Err(INVALID));
    }
}
