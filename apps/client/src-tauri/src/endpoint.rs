use reqwest::Url;

pub fn endpoint(value: &str, development: bool) -> Result<Url, &'static str> {
    let url = Url::parse(value).map_err(|_| "Configure the native API endpoint.")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if (url.scheme() != "https" && !(development && local && url.scheme() == "http"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "The native API endpoint must be an HTTPS origin; only loopback HTTP is allowed in debug builds.",
        );
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::endpoint;

    #[test]
    fn release_only_sends_credentials_to_an_explicit_https_origin() {
        assert!(endpoint("https://api.example.test", false).is_ok());
        for value in [
            "http://localhost:3001",
            "http://api.example.test",
            "https://user:pass@api.example.test",
            "https://api.example.test/auth",
            "https://api.example.test?token=secret",
            "tauri://localhost",
        ] {
            assert!(endpoint(value, false).is_err());
        }
    }

    #[test]
    fn debug_http_is_limited_to_loopback() {
        assert!(endpoint("http://127.0.0.1:3001", true).is_ok());
        assert!(endpoint("http://localhost:3001", true).is_ok());
        assert!(endpoint("http://192.168.1.2:3001", true).is_err());
        assert!(endpoint("http://localhost.evil.example", true).is_err());
    }
}
