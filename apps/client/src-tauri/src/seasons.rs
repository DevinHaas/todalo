// Narrow season commands (goals ticket 04): one fixed method and path per
// operation, bodies rebuilt from typed fields so the webview cannot add a user
// ID or reach another path. The server re-validates everything.
use crate::{auth::NativeAuth, reads::valid_id};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const INVALID: &str = "Check your entry and try again.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";

/// Only the supplied fields change (PATCH /api/v1/seasons/:id/goals/:goalId).
#[derive(Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SeasonGoalPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    tier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target: Option<String>,
}

/// The current season with its day count in the webview's timezone.
#[tauri::command]
pub async fn current_season(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
) -> Result<Value, String> {
    let query = reqwest::Url::parse_with_params("http://x/", [("timeZone", time_zone)])
        .map_err(|_| INVALID)?;
    let path = format!(
        "/api/v1/seasons/current?{}",
        query.query().unwrap_or_default()
    );
    state
        .read(&path)
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[tauri::command]
pub async fn start_season(
    state: tauri::State<'_, NativeAuth>,
    start_date: String,
    length_days: u16,
) -> Result<Value, String> {
    if !valid_date(&start_date) || !(1..=366).contains(&length_days) {
        return Err(INVALID.to_owned());
    }
    state
        .write(
            Method::POST,
            "/api/v1/seasons",
            Some(json!({ "startDate": start_date, "lengthDays": length_days })),
        )
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[tauri::command]
pub async fn add_season_goal(
    state: tauri::State<'_, NativeAuth>,
    season_id: String,
    goal_id: String,
    tier: String,
    target: String,
) -> Result<Option<Value>, String> {
    let mut body = patch_body(SeasonGoalPatch {
        tier: Some(tier),
        target: Some(target),
    })?;
    if !valid_id(&season_id) || !valid_id(&goal_id) {
        return Ok(None);
    }
    body["goalId"] = json!(goal_id);
    Ok(state
        .write(
            Method::POST,
            &format!("/api/v1/seasons/{season_id}/goals"),
            Some(body),
        )
        .await?)
}

/// Changes a goal's tier or moves its target (the text is replaced).
#[tauri::command]
pub async fn update_season_goal(
    state: tauri::State<'_, NativeAuth>,
    season_id: String,
    goal_id: String,
    patch: SeasonGoalPatch,
) -> Result<Option<Value>, String> {
    let body = patch_body(patch)?;
    if !valid_id(&season_id) || !valid_id(&goal_id) {
        return Ok(None);
    }
    Ok(state
        .write(
            Method::PATCH,
            &format!("/api/v1/seasons/{season_id}/goals/{goal_id}"),
            Some(body),
        )
        .await?)
}

/// Removes the goal from the current season only (its row; the goal stays).
#[tauri::command]
pub async fn remove_season_goal(
    state: tauri::State<'_, NativeAuth>,
    season_id: String,
    goal_id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&season_id) || !valid_id(&goal_id) {
        return Ok(None);
    }
    Ok(state
        .write(
            Method::DELETE,
            &format!("/api/v1/seasons/{season_id}/goals/{goal_id}"),
            None,
        )
        .await?)
}

/// Ended seasons, newest first, with their goals as history.
#[tauri::command]
pub async fn past_seasons(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/seasons/past")
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// A goal carried into the next season with a fresh tier and target.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CarriedGoal {
    goal_id: String,
    tier: String,
    target: String,
}

/// The season started in the same operation that ends the current one.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NextSeason {
    start_date: String,
    length_days: u16,
    goals: Vec<CarriedGoal>,
}

/// Ends the current season and optionally starts the next (POST /api/v1/seasons/:id/end).
#[tauri::command]
pub async fn end_season(
    state: tauri::State<'_, NativeAuth>,
    season_id: String,
    next: Option<NextSeason>,
) -> Result<Option<Value>, String> {
    let body = end_body(next)?;
    if !valid_id(&season_id) {
        return Ok(None);
    }
    Ok(state
        .write(
            Method::POST,
            &format!("/api/v1/seasons/{season_id}/end"),
            Some(body),
        )
        .await?)
}

/// Mirrors the server rules; the server also refuses duplicate goals.
fn end_body(next: Option<NextSeason>) -> Result<Value, &'static str> {
    let Some(next) = next else {
        return Ok(json!({ "next": null }));
    };
    if !valid_date(&next.start_date)
        || !(1..=366).contains(&next.length_days)
        || next.goals.len() > 100
    {
        return Err(INVALID);
    }
    let goals = next
        .goals
        .into_iter()
        .map(|goal| {
            if !valid_id(&goal.goal_id) {
                return Err(INVALID);
            }
            let mut body = patch_body(SeasonGoalPatch {
                tier: Some(goal.tier),
                target: Some(goal.target),
            })?;
            body["goalId"] = json!(goal.goal_id);
            Ok(body)
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(
        json!({ "next": { "startDate": next.start_date, "lengthDays": next.length_days, "goals": goals } }),
    )
}

fn valid_date(date: &str) -> bool {
    let bytes = date.as_bytes();
    bytes.len() == 10
        && bytes.iter().enumerate().all(|(index, byte)| {
            if index == 4 || index == 7 {
                *byte == b'-'
            } else {
                byte.is_ascii_digit()
            }
        })
}

/// Mirrors the server rules (tier primary or secondary, trimmed target of
/// 1–1,000 characters); an empty patch is refused.
fn patch_body(mut patch: SeasonGoalPatch) -> Result<Value, &'static str> {
    if patch
        .tier
        .as_deref()
        .is_some_and(|tier| !matches!(tier, "primary" | "secondary"))
    {
        return Err(INVALID);
    }
    if let Some(target) = &patch.target {
        let target = target.trim();
        if target.is_empty() || target.chars().count() > 1_000 {
            return Err(INVALID);
        }
        patch.target = Some(target.to_owned());
    }
    let body = serde_json::to_value(&patch).map_err(|_| INVALID)?;
    if body.as_object().is_none_or(|fields| fields.is_empty()) {
        return Err(INVALID);
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::{NextSeason, SeasonGoalPatch, end_body, patch_body, valid_date};
    use serde_json::json;

    #[test]
    fn season_goal_bodies_carry_only_typed_validated_fields() {
        let patch: SeasonGoalPatch =
            serde_json::from_value(json!({ "tier": "primary", "target": "  Run 10k " })).unwrap();
        assert_eq!(
            patch_body(patch).unwrap(),
            json!({ "tier": "primary", "target": "Run 10k" })
        );
        assert!(
            serde_json::from_value::<SeasonGoalPatch>(json!({ "target": "A", "userId": "bob" }))
                .is_err()
        );
        for patch in [
            SeasonGoalPatch::default(),
            SeasonGoalPatch {
                tier: Some("main".into()),
                ..Default::default()
            },
            SeasonGoalPatch {
                target: Some("  ".into()),
                ..Default::default()
            },
            SeasonGoalPatch {
                target: Some("x".repeat(1_001)),
                ..Default::default()
            },
        ] {
            assert_eq!(patch_body(patch), Err("Check your entry and try again."));
        }
    }

    #[test]
    fn start_dates_are_plain_calendar_dates() {
        assert!(valid_date("2026-01-01"));
        for date in ["2026-1-01", "2026/01/01", "../2026-01", "2026-01-01x"] {
            assert!(!valid_date(date), "{date}");
        }
    }

    #[test]
    fn end_bodies_carry_only_typed_validated_goals() {
        assert_eq!(end_body(None).unwrap(), json!({ "next": null }));
        let next: NextSeason = serde_json::from_value(json!({
            "startDate": "2026-04-01", "lengthDays": 28,
            "goals": [{ "goalId": "g1", "tier": "secondary", "target": " Half marathon " }]
        }))
        .unwrap();
        assert_eq!(
            end_body(Some(next)).unwrap(),
            json!({ "next": { "startDate": "2026-04-01", "lengthDays": 28,
                "goals": [{ "goalId": "g1", "tier": "secondary", "target": "Half marathon" }] } })
        );
        assert!(serde_json::from_value::<NextSeason>(json!({
            "startDate": "2026-04-01", "lengthDays": 28,
            "goals": [{ "goalId": "g1", "tier": "primary", "target": "x", "carriedFromId": "sg" }]
        }))
        .is_err());
        for next in [
            json!({ "startDate": "2026-4-01", "lengthDays": 28, "goals": [] }),
            json!({ "startDate": "2026-04-01", "lengthDays": 0, "goals": [] }),
            json!({ "startDate": "2026-04-01", "lengthDays": 28, "goals": [{ "goalId": "g1", "tier": "main", "target": "x" }] }),
            json!({ "startDate": "2026-04-01", "lengthDays": 28, "goals": [{ "goalId": "g1", "tier": "primary", "target": " " }] }),
        ] {
            let next: NextSeason = serde_json::from_value(next).unwrap();
            assert_eq!(end_body(Some(next)), Err("Check your entry and try again."));
        }
    }
}
