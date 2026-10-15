// Ramble socket authentication for native webviews. A WebView WebSocket cannot
// carry the Keychain bearer, so Rust mints a 30-second, single-use ticket over
// authenticated HTTPS and returns only the ticketed socket URL.
use reqwest::Url;
use serde::Serialize;

use crate::auth::NativeAuth;

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
    use super::socket_url;
    use reqwest::Url;

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
