// Narrow ritual commands (goals ticket 11): one fixed method and path per
// operation, bodies rebuilt from typed fields so the webview cannot add a user
// ID or reach another path. The server re-validates everything.
use crate::{auth::NativeAuth, reads::valid_id, seasons::valid_date};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const INVALID: &str = "Check your entry and try again.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckIn {
    enabled: bool,
    time: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WeeklyReview {
    enabled: bool,
    day: u8,
    time: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SeasonReview {
    enabled: bool,
}

/// PUT /api/v1/rituals/settings: which rituals run and when.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RitualSettings {
    check_in: CheckIn,
    weekly_review: WeeklyReview,
    season_review: SeasonReview,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rating {
    goal_id: String,
    rating: String,
    context: Option<String>,
}

/// POST /api/v1/rituals/runs: one finished or skipped ritual with its ratings.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RitualRun {
    kind: String,
    period: String,
    status: String,
    ratings: Vec<Rating>,
    /// Ticket 12: "clear" or "help", the planning question's answer.
    #[serde(default)]
    planning: Option<String>,
}

fn zone_query(path: &str, time_zone: String) -> Result<String, String> {
    let query = reqwest::Url::parse_with_params("http://x/", [("timeZone", time_zone)])
        .map_err(|_| INVALID)?;
    Ok(format!("{path}?{}", query.query().unwrap_or_default()))
}

/// The ritual settings and today's Check-in, in the webview's timezone.
#[tauri::command]
pub async fn rituals(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
) -> Result<Value, String> {
    state
        .read(&zone_query("/api/v1/rituals", time_zone)?)
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

#[tauri::command]
pub async fn update_ritual_settings(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
    settings: RitualSettings,
) -> Result<Value, String> {
    if settings.weekly_review.day > 6 {
        return Err(INVALID.to_owned());
    }
    let body = serde_json::to_value(&settings).map_err(|_| INVALID)?;
    state
        .write(
            Method::PUT,
            &zone_query("/api/v1/rituals/settings", time_zone)?,
            Some(body),
        )
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// None when a rated goal is refused (missing, foreign or archived).
#[tauri::command]
pub async fn record_ritual_run(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
    run: RitualRun,
) -> Result<Option<Value>, String> {
    if !valid_date(&run.period)
        || run.ratings.len() > 100
        || run
            .planning
            .as_deref()
            .is_some_and(|answer| answer != "clear" && answer != "help")
    {
        return Err(INVALID.to_owned());
    }
    if run.ratings.iter().any(|rating| !valid_id(&rating.goal_id)) {
        return Ok(None);
    }
    let body = serde_json::to_value(&run).map_err(|_| INVALID)?;
    Ok(state
        .write(
            Method::POST,
            &zone_query("/api/v1/rituals/runs", time_zone)?,
            Some(body),
        )
        .await?)
}

/// Ticket 13: each current-season goal's week for the Weekly review, in the webview's timezone.
#[tauri::command]
pub async fn weekly_review(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
) -> Result<Value, String> {
    state
        .read(&zone_query("/api/v1/rituals/weekly-review", time_zone)?)
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}

/// Ticket 14: each current-season goal's ratings across the season for the Season review.
#[tauri::command]
pub async fn season_review(state: tauri::State<'_, NativeAuth>) -> Result<Value, String> {
    state
        .read("/api/v1/rituals/season-review")
        .await?
        .ok_or_else(|| INVALID_RESPONSE.to_owned())
}
