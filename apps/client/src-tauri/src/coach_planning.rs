// Goals ticket 23: one planning-session turn. A fixed path; the body is
// rebuilt from typed fields so the webview cannot add fields or reach another
// path (the server validates lengths and the goal).
use crate::auth::NativeAuth;
use crate::coach::zoned;
use reqwest::Method;
use serde::Deserialize;
use serde_json::Value;

const INVALID: &str = "Check your entry and try again.";

#[derive(Deserialize)]
pub struct PlanningTurn {
    question: String,
    answer: String,
}

/// `{ question, draft, message? }`; null (404) without a provider or when the goal is gone.
#[tauri::command]
pub async fn coach_planning(
    state: tauri::State<'_, NativeAuth>,
    time_zone: String,
    goal_id: String,
    source: String,
    ramble: String,
    turns: Vec<PlanningTurn>,
    finish: bool,
) -> Result<Option<Value>, String> {
    let body = planning_body(goal_id, source, ramble, turns, finish)?;
    Ok(state
        .write(
            Method::POST,
            &zoned("/api/v1/coach/planning", time_zone)?,
            Some(body),
        )
        .await?)
}

/// The season setup's suggestions: `{ goals, message? }`; null (404) without a provider.
#[tauri::command]
pub async fn coach_season_setup(
    state: tauri::State<'_, NativeAuth>,
    intention: String,
    length_days: u16,
) -> Result<Option<Value>, String> {
    let body = season_setup_body(intention, length_days)?;
    Ok(state
        .write(Method::POST, "/api/v1/coach/season-setup", Some(body))
        .await?)
}

fn season_setup_body(intention: String, length_days: u16) -> Result<Value, &'static str> {
    if intention.trim().is_empty() || !(1..=366).contains(&length_days) {
        return Err(INVALID);
    }
    Ok(serde_json::json!({ "intention": intention, "lengthDays": length_days }))
}

fn planning_body(
    goal_id: String,
    source: String,
    ramble: String,
    turns: Vec<PlanningTurn>,
    finish: bool,
) -> Result<Value, &'static str> {
    if goal_id.is_empty() || ramble.trim().is_empty() || turns.len() > 5 {
        return Err(INVALID);
    }
    let turns: Vec<Value> = turns
        .into_iter()
        .map(|turn| serde_json::json!({ "question": turn.question, "answer": turn.answer }))
        .collect();
    Ok(
        serde_json::json!({ "goalId": goal_id, "source": source, "ramble": ramble, "turns": turns, "finish": finish }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn planning_bodies_carry_only_the_transcript() {
        let turn = PlanningTurn {
            question: "When?".into(),
            answer: "Mornings".into(),
        };
        assert_eq!(
            planning_body("g1".into(), "goal".into(), "Fit".into(), vec![turn], false).unwrap(),
            serde_json::json!({ "goalId": "g1", "source": "goal", "ramble": "Fit", "turns": [{ "question": "When?", "answer": "Mornings" }], "finish": false })
        );
        assert_eq!(
            planning_body("g1".into(), "goal".into(), " ".into(), vec![], true),
            Err(INVALID)
        );
        assert_eq!(
            planning_body("".into(), "goal".into(), "Fit".into(), vec![], true),
            Err(INVALID)
        );
    }

    #[test]
    fn season_setup_bodies_carry_only_the_intention_and_length() {
        assert_eq!(
            season_setup_body("Get fit".into(), 84).unwrap(),
            serde_json::json!({ "intention": "Get fit", "lengthDays": 84 })
        );
        assert_eq!(season_setup_body(" ".into(), 84), Err(INVALID));
        assert_eq!(season_setup_body("Get fit".into(), 0), Err(INVALID));
    }
}
