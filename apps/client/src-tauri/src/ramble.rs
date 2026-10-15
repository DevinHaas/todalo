// Ramble socket authentication for native webviews. A WebView WebSocket cannot
// carry the Keychain bearer, so Rust mints a 30-second, single-use ticket over
// authenticated HTTPS and returns only the ticketed socket URL.
use reqwest::{Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::auth::NativeAuth;
use crate::writes::{Recurrence, valid_operation_id};

const INVALID: &str = "Check your entry and try again.";
const PROJECT_NOT_FOUND: &str = "This project does not exist or you do not have access to it.";

#[derive(Serialize)]
pub struct RambleSocket {
    url: String,
}

#[tauri::command]
pub async fn ramble_socket(state: tauri::State<'_, NativeAuth>) -> Result<RambleSocket, String> {
    let (base, ticket) = state.ramble_ticket().await?;
    Ok(RambleSocket {
        url: socket_url(&base, &ticket)?.into(),
    })
}

/// One staged todo as the socket published it (ticket 21). Typed so the webview
/// cannot add server fields; the API validates formats, parents and ownership.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedTodo {
    id: String,
    title: String,
    parent_id: Option<String>,
    due_date: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
    recurrence: Option<Recurrence>,
    project_id: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RambleCommit {
    /// The session's client-generated UUID, also sent with `start`: a replay of
    /// an applied commit writes nothing twice.
    operation_id: String,
    time_zone: String,
    todos: Vec<StagedTodo>,
}

fn commit_body(commit: &RambleCommit) -> Result<Value, &'static str> {
    if !valid_operation_id(&commit.operation_id)
        || commit.time_zone.is_empty()
        || commit.time_zone.len() > 64
        || commit.todos.is_empty()
        || commit.todos.len() > 500
    {
        return Err(INVALID);
    }
    serde_json::to_value(commit).map_err(|_| INVALID)
}

/// Saves a staged batch the webview still holds after its socket was lost.
#[tauri::command]
pub async fn ramble_commit(
    state: tauri::State<'_, NativeAuth>,
    commit: RambleCommit,
) -> Result<Value, String> {
    let body = commit_body(&commit)?;
    Ok(state
        .write(Method::POST, "/api/v1/ramble/commit", Some(body))
        .await?
        .ok_or(PROJECT_NOT_FOUND)?)
}

fn socket_url(base: &Url, ticket: &str) -> Result<Url, &'static str> {
    // Server tickets are 32 random bytes in base64url; reject anything else.
    if ticket.len() != 43
        || !ticket
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("The server returned an invalid response.");
    }
    let mut url = base.clone();
    let scheme = if base.scheme() == "https" {
        "wss"
    } else {
        "ws"
    };
    url.set_scheme(scheme)
        .map_err(|_| "The server returned an invalid response.")?;
    url.set_path("/api/ramble/ws");
    url.query_pairs_mut().clear().append_pair("ticket", ticket);
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::{RambleCommit, commit_body, socket_url};
    use reqwest::Url;
    use serde_json::json;

    const OPERATION: &str = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";

    fn commit(input: serde_json::Value) -> Result<serde_json::Value, &'static str> {
        commit_body(&serde_json::from_value::<RambleCommit>(input).map_err(|_| "unparsed")?)
    }

    #[test]
    fn commit_bodies_carry_only_typed_staged_fields() {
        let todo = json!({ "id": "t1", "title": "Buy milk", "parentId": null, "dueDate": "2026-10-16",
            "startTime": "16:00", "endTime": null, "projectId": "work",
            "recurrence": { "n": 1, "unit": "week", "basedOn": "scheduled", "until": null } });
        let mut extra = todo.clone();
        extra["userId"] = json!("someone");
        let body = commit(
            json!({ "operationId": OPERATION, "timeZone": "Europe/Zurich", "todos": [extra] }),
        )
        .unwrap();
        assert_eq!(
            body,
            json!({ "operationId": OPERATION, "timeZone": "Europe/Zurich", "todos": [todo] })
        );
    }

    #[test]
    fn rejects_commits_without_a_valid_operation_or_batch() {
        let todo = json!({ "id": "t1", "title": "A", "parentId": null, "dueDate": null, "startTime": null, "endTime": null, "recurrence": null, "projectId": null });
        for input in [
            json!({ "operationId": "x", "timeZone": "UTC", "todos": [todo] }),
            json!({ "operationId": OPERATION, "timeZone": "", "todos": [todo] }),
            json!({ "operationId": OPERATION, "timeZone": "UTC", "todos": [] }),
        ] {
            assert!(commit(input).is_err());
        }
    }

    const TICKET: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_6";

    #[test]
    fn derives_the_socket_from_the_configured_api_origin() {
        let local = socket_url(&Url::parse("http://127.0.0.1:3009").unwrap(), TICKET).unwrap();
        assert_eq!(
            local.as_str(),
            format!("ws://127.0.0.1:3009/api/ramble/ws?ticket={TICKET}")
        );
        let hosted = socket_url(&Url::parse("https://api.example.test").unwrap(), TICKET).unwrap();
        assert_eq!(
            hosted.as_str(),
            format!("wss://api.example.test/api/ramble/ws?ticket={TICKET}")
        );
    }

    #[test]
    fn rejects_malformed_tickets() {
        let base = Url::parse("https://api.example.test").unwrap();
        for ticket in [
            "",
            "short",
            &format!("{TICKET}x"),
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123&a=",
        ] {
            assert!(socket_url(&base, ticket).is_err());
        }
    }
}
