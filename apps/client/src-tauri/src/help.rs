//! Opens the help center in the system browser. The webview names an article;
//! the address always comes from the list embedded here, so this is not a
//! general URL opener.

/// The same file the webview builds its links from (src/help.ts).
const LINKS: &str = include_str!("../../src/help-links.json");

/// The help center home, or one listed article.
#[tauri::command]
pub fn open_help(app: tauri::AppHandle, article: Option<String>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    const FAILED: &str = "The help center could not be opened.";
    let url = help_url(article.as_deref()).ok_or_else(|| FAILED.to_owned())?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| FAILED.to_owned())
}

fn help_url(article: Option<&str>) -> Option<String> {
    let links: serde_json::Value = serde_json::from_str(LINKS).ok()?;
    let base = links["base"].as_str()?;
    match article {
        None => Some(base.to_owned()),
        Some(name) => Some(format!("{base}{}", links["articles"].get(name)?.as_str()?)),
    }
}

#[cfg(test)]
mod tests {
    use super::{LINKS, help_url};

    #[test]
    fn opens_the_home() {
        assert_eq!(help_url(None).as_deref(), Some("https://help.todalo.app"));
    }

    #[test]
    fn opens_a_listed_article() {
        assert_eq!(
            help_url(Some("google-calendar")).as_deref(),
            Some("https://help.todalo.app/integrations/use-google-calendar-with-todalo")
        );
    }

    #[test]
    fn refuses_anything_that_is_not_a_listed_article() {
        for value in [
            "",
            "unknown",
            "https://evil.example",
            "/integrations/use-google-calendar-with-todalo",
            "@evil.example",
            "../google-calendar",
        ] {
            assert_eq!(help_url(Some(value)), None, "{value}");
        }
    }

    /// The list itself cannot leave the help center: an article is a path, so
    /// `base + path` keeps the host.
    #[test]
    fn every_listed_address_stays_on_the_help_center() {
        let links: serde_json::Value = serde_json::from_str(LINKS).unwrap();
        assert_eq!(links["base"], "https://help.todalo.app");
        for (name, path) in links["articles"].as_object().unwrap() {
            assert!(path.as_str().unwrap().starts_with('/'), "{name}");
            let url = reqwest::Url::parse(&help_url(Some(name)).unwrap()).unwrap();
            assert_eq!(url.host_str(), Some("help.todalo.app"), "{name}");
            assert_eq!(url.scheme(), "https", "{name}");
        }
    }
}
