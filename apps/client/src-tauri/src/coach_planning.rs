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
    Ok(serde_json::json!({ "goalId": goal_id, "source": source, "ramble": ramble, "turns": turns, "finish": finish }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn planning_bodies_carry_only_the_transcript() {
        let turn = PlanningTurn { question: "When?".into(), answer: "Mornings".into() };
        assert_eq!(
            planning_body("g1".into(), "goal".into(), "Fit".into(), vec![turn], false).unwrap(),
            serde_json::json!({ "goalId": "g1", "source": "goal", "ramble": "Fit", "turns": [{ "question": "When?", "answer": "Mornings" }], "finish": false })
        );
        assert_eq!(planning_body("g1".into(), "goal".into(), " ".into(), vec![], true), Err(INVALID));
        assert_eq!(planning_body("".into(), "goal".into(), "Fit".into(), vec![], true), Err(INVALID));
    }
}
