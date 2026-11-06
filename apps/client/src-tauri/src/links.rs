//! Task deep links (ticket 18). Only `/tasks/<id>` is accepted, from
//! `app.todalo.client://tasks/<id>` or (once universal links ship) the exact
//! API origin's `https://…/tasks/<id>`. Anything else — other routes, queries,
//! fragments, credentials, ports, encoded or invalid IDs — is ignored. A link
//! only navigates the webview to a read-only route; it never triggers a write.
//!
//! Rust keeps the latest accepted route until the webview asks (`next_link`),
//! so a link that arrives before the page loads (cold launch) is not lost.
//! iOS cold launch is the exception: tao 0.37.1 drops the launch URL (see
//! docs/qa/tauri-google-oauth.md), so the user taps the link again.

use reqwest::Url;
use tauri::{AppHandle, Manager, State};
use tokio::sync::{Mutex, Notify};

use crate::auth::NativeAuth;
use crate::oauth::SCHEME;
use crate::reads::valid_id;

const NOT_FOUND: &str = "This task does not exist or you do not have access to it.";

#[derive(Default)]
pub struct LinkInbox {
    route: Mutex<Option<String>>,
    changed: Notify,
}

/// The internal route for an accepted link. `https_origin` is the API origin.
fn route(raw: &str, https_origin: Option<&str>) -> Option<String> {
    let url = Url::parse(raw).ok()?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    let id = match url.scheme() {
        // app.todalo.client://tasks/<id>: the host is the first route segment.
        SCHEME if url.host_str() == Some("tasks") => url.path().strip_prefix('/')?,
        "https" if Some(url.origin().ascii_serialization().as_str()) == https_origin => {
            url.path().strip_prefix("/tasks/")?
        }
        _ => return None,
    };
    valid_id(id).then(|| format!("/tasks/{id}"))
}

/// Deep-link entry point beside `oauth::handle`; ignores every other link.
pub fn handle(app: &AppHandle, urls: &[String]) {
    let origin = app.state::<NativeAuth>().origin().ok();
    let Some(accepted) = urls
        .iter()
        .filter_map(|url| route(url, origin.as_deref()))
        .last()
    else {
        return;
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let inbox = app.state::<LinkInbox>();
        *inbox.route.lock().await = Some(accepted);
        // Stores a permit when the webview is not waiting yet (cold launch).
        inbox.changed.notify_one();
    });
}

/// Resolves with the next accepted route (immediately if one is waiting).
#[tauri::command]
pub async fn next_link(inbox: State<'_, LinkInbox>) -> Result<String, String> {
    loop {
        if let Some(route) = inbox.route.lock().await.take() {
            return Ok(route);
        }
        inbox.changed.notified().await;
    }
}

/// The shareable https link for a task: the API origin, which serves the
/// browser routes in production. Never the custom scheme. No network.
#[tauri::command]
pub fn task_link(auth: State<'_, NativeAuth>, id: String) -> Result<String, String> {
    if !valid_id(&id) {
        return Err(NOT_FOUND.to_owned());
    }
    Ok(format!("{}/tasks/{id}", auth.origin()?))
}

#[cfg(test)]
mod tests {
    use super::route;

    const ORIGIN: Option<&str> = Some("https://todalo.example");
    const ID: &str = "8f14e45f-ceea-467f-a8ad-0e7c5d3c3a1b";

    #[test]
    fn accepts_only_task_routes_with_valid_ids() {
        let expected = Some(format!("/tasks/{ID}"));
        assert_eq!(
            route(&format!("app.todalo.client://tasks/{ID}"), ORIGIN),
            expected
        );
        assert_eq!(
            route(&format!("https://todalo.example/tasks/{ID}"), ORIGIN),
            expected
        );
        for raw in [
            "app.todalo.client://oauth/callback?state=x&code=y".to_owned(),
            "app.todalo.client://today".to_owned(),
            "app.todalo.client://tasks/".to_owned(),
            "app.todalo.client://tasks".to_owned(),
            format!("app.todalo.client://tasks/{ID}/complete"),
            format!("app.todalo.client://tasks/{ID}?complete=1"),
            format!("app.todalo.client://tasks/{ID}#edit"),
            format!("app.todalo.client://user@tasks/{ID}"),
            format!("app.todalo.client://tasks:1/{ID}"),
            "app.todalo.client://tasks/..%2Faccount".to_owned(),
            "app.todalo.client://tasks/a%20b".to_owned(),
            format!("app.todalo.client://tasks/{}", "x".repeat(129)),
            format!("app.todalo.client://projects/{ID}"),
            format!("https://evil.example/tasks/{ID}"),
            format!("https://todalo.example:8443/tasks/{ID}"),
            format!("http://todalo.example/tasks/{ID}"),
            format!("https://todalo.example/tasks/{ID}/attachments"),
            format!("https://todalo.example/api/v1/tasks/{ID}"),
            format!("https://todalo.example/projects/{ID}"),
            format!("other.scheme://tasks/{ID}"),
            "not a url".to_owned(),
        ] {
            assert_eq!(route(&raw, ORIGIN), None, "{raw}");
        }
        // Without a configured API origin no https link is trusted.
        assert_eq!(
            route(&format!("https://todalo.example/tasks/{ID}"), None),
            None
        );
    }
}
