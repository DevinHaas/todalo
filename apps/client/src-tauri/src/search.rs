// Read-only legacy search (ticket 18): two fixed API paths; the query is only
// ever a URL-encoded `q` value, never part of the path.
use crate::auth::NativeAuth;
use reqwest::Url;

const UNAVAILABLE: &str = "Your tasks could not be loaded. Try again.";
/// The server cuts `q` at 200 UTF-16 units; this bounds the URL first.
const QUERY_MAX_CHARS: usize = 200;

fn search_path(query: &str) -> String {
    let mut url = Url::parse("http://api.invalid/api/v1/search").expect("static URL");
    url.query_pairs_mut().append_pair(
        "q",
        &query.chars().take(QUERY_MAX_CHARS).collect::<String>(),
    );
    format!("{}?{}", url.path(), url.query().unwrap_or_default())
}

#[tauri::command]
pub async fn search_tasks(
    state: tauri::State<'_, NativeAuth>,
    query: String,
) -> Result<serde_json::Value, String> {
    state
        .read(&search_path(&query))
        .await?
        .ok_or_else(|| UNAVAILABLE.to_owned())
}

#[tauri::command]
pub async fn quick_find(state: tauri::State<'_, NativeAuth>) -> Result<serde_json::Value, String> {
    state
        .read("/api/v1/find")
        .await?
        .ok_or_else(|| UNAVAILABLE.to_owned())
}

#[cfg(test)]
mod tests {
    use super::search_path;

    #[test]
    fn the_query_cannot_leave_the_q_parameter() {
        assert_eq!(search_path("plan trip"), "/api/v1/search?q=plan+trip");
        assert_eq!(
            search_path("../account?x=1#y&q=2"),
            "/api/v1/search?q=..%2Faccount%3Fx%3D1%23y%26q%3D2"
        );
        assert_eq!(search_path(""), "/api/v1/search?q=");
        let long = search_path(&"é".repeat(300));
        assert_eq!(long.matches("%C3%A9").count(), 200);
    }
}
