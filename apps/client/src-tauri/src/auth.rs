use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::Mutex;
use zeroize::Zeroizing;

use crate::{credentials, endpoint::endpoint};

pub struct NativeAuth {
    pub(crate) client: Client,
    base: Result<Url, &'static str>,
    pub gate: Mutex<()>,
}

#[derive(Deserialize, Serialize)]
pub struct Credentials {
    email: String,
    password: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

impl Drop for Credentials {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.password.zeroize();
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    user: User,
    expires_at: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct User {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
    email_verified: bool,
}

impl NativeAuth {
    pub fn new() -> Self {
        // Resolved by build.rs from TODALO_API_BASE_URL or the iOS-forwarded
        // TAURI_TODALO_API_BASE_URL (loopback default in debug, empty in release).
        let configured = env!("TODALO_RESOLVED_API_BASE_URL");
        Self {
            client: Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(20))
                .build()
                .expect("Cannot initialize native HTTP transport"),
            base: endpoint(configured, cfg!(debug_assertions)),
            gate: Mutex::new(()),
        }
    }

    pub(crate) fn origin(&self) -> Result<String, &'static str> {
        Ok(self
            .base
            .as_ref()
            .map_err(|error| *error)?
            .origin()
            .ascii_serialization())
    }

    pub(crate) fn url(&self, path: &str) -> Result<Url, &'static str> {
        self.base
            .as_ref()
            .map_err(|error| *error)?
            .join(path)
            .map_err(|_| "Invalid API endpoint.")
    }

    pub(crate) async fn revoke(&self, token: &str) -> Result<(), &'static str> {
        let response = self
            .client
            .post(self.url("/api/auth/sign-out")?)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| "Cannot reach todalo. Try again to revoke this session.")?;
        if response.status().is_success() || response.status() == StatusCode::UNAUTHORIZED {
            Ok(())
        } else {
            Err("Sign-out was not confirmed by the server. Try again.")
        }
    }

    pub(crate) async fn identity(&self, token: &str) -> Result<Option<Account>, &'static str> {
        let response = self
            .client
            .get(self.url("/api/v1/account")?)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| "Cannot reach todalo. Check your connection and try again.")?;
        if response.status() == StatusCode::UNAUTHORIZED {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err("Your account could not be loaded. Try again.");
        }
        response
            .json::<Account>()
            .await
            .map(Some)
            .map_err(|_| "The server returned an invalid account response.")
    }

    pub async fn account(&self) -> Result<Option<Account>, &'static str> {
        let origin = self.origin()?;
        let Some(token) = credentials::read(&origin)? else {
            return Ok(None);
        };
        let account = self.identity(&token).await?;
        if account.is_none() {
            credentials::clear(&origin)?;
        }
        Ok(account)
    }

    pub async fn authenticate(
        &self,
        credentials: Credentials,
        registration: bool,
    ) -> Result<Account, &'static str> {
        let origin = self.origin()?;
        if credentials.email.len() > 320
            || credentials.password.len() > 1024
            || credentials.password.len() < 8
            || (registration && credentials.name.as_deref().unwrap_or("").trim().is_empty())
        {
            return Err("Check your account details and try again.");
        }
        let path = if registration {
            "/api/auth/sign-up/email"
        } else {
            "/api/auth/sign-in/email"
        };
        let response = self
            .client
            .post(self.url(path)?)
            .json(&credentials)
            .send()
            .await
            .map_err(|_| "Cannot reach todalo. Check your connection and try again.")?;
        if !response.status().is_success() {
            return Err(if registration {
                "Could not create your account. Check your details or sign in if you already have an account."
            } else {
                "Could not sign in. Check your email and password."
            });
        }
        // Read only the signed session header. Never return the auth response
        // body (which contains a raw token) through IPC or write it to logs.
        let token = Zeroizing::new(
            response
                .headers()
                .get("set-auth-token")
                .and_then(|value| value.to_str().ok())
                .filter(|value| value.contains('.'))
                .ok_or("The server did not issue a signed session. Try again.")?
                .to_owned(),
        );
        drop(response);
        let account = match self.identity(&token).await {
            Ok(Some(account)) => account,
            _ => {
                let _ = self.revoke(&token).await;
                return Err("Your account could not be loaded. Try signing in again.");
            }
        };
        if let Err(error) = credentials::write(&origin, &token) {
            let _ = self.revoke(&token).await;
            return Err(error);
        }
        Ok(account)
    }

    pub async fn sign_out(&self) -> Result<(), &'static str> {
        let origin = self.origin()?;
        if let Some(token) = credentials::read(&origin)? {
            self.revoke(&token).await?;
        }
        credentials::clear(&origin)
    }

    /// Bearer GET for a fixed read path chosen in reads.rs (never by the webview).
    /// 404 is Ok(None); a 401 asks the webview to refresh the account, which
    /// removes the revoked credential through `account`.
    pub async fn read(&self, path: &str) -> Result<Option<serde_json::Value>, &'static str> {
        let origin = self.origin()?;
        let token = credentials::read(&origin)?.ok_or("Please sign in again.")?;
        let response = self
            .client
            .get(self.url(path)?)
            .bearer_auth(&*token)
            .send()
            .await
            .map_err(|_| "Cannot reach todalo. Check your connection and try again.")?;
        match response.status() {
            StatusCode::UNAUTHORIZED => Err("Please sign in again."),
            StatusCode::NOT_FOUND => Ok(None),
            status if status.is_success() => response
                .json()
                .await
                .map(Some)
                .map_err(|_| "The server returned an invalid response."),
            _ => Err("Your tasks could not be loaded. Try again."),
        }
    }

    /// Bearer write for a fixed method/path chosen by a narrow command module
    /// (never by the webview), with an optional JSON body. Same 401/404 mapping
    /// as `read`; 400 is the shared invalid-input message.
    pub async fn write(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<serde_json::Value>,
    ) -> Result<Option<serde_json::Value>, &'static str> {
        self.send_write(method, path, |request| match body {
            Some(body) => request.json(&body),
            None => request,
        })
        .await
    }

    /// Bearer multipart POST built by attachments.rs (never by the webview).
    /// Same mapping as `write`; a 413 is the batch-size message.
    pub async fn upload(
        &self,
        path: &str,
        boundary: &str,
        body: Vec<u8>,
    ) -> Result<Option<serde_json::Value>, &'static str> {
        let content_type = format!("multipart/form-data; boundary={boundary}");
        self.send_write(reqwest::Method::POST, path, |request| {
            request
                .header(reqwest::header::CONTENT_TYPE, content_type)
                .body(body)
                // Up to 10 MB on a slow connection; the client default is 20 s.
                .timeout(Duration::from_secs(120))
        })
        .await
    }

    async fn send_write(
        &self,
        method: reqwest::Method,
        path: &str,
        build: impl FnOnce(reqwest::RequestBuilder) -> reqwest::RequestBuilder,
    ) -> Result<Option<serde_json::Value>, &'static str> {
        let origin = self.origin()?;
        let token = credentials::read(&origin)?.ok_or("Please sign in again.")?;
        let request = self
            .client
            .request(method, self.url(path)?)
            .bearer_auth(&*token);
        let response = build(request)
            .send()
            .await
            .map_err(|_| "Cannot reach todalo. Check your connection and try again.")?;
        match response.status() {
            StatusCode::UNAUTHORIZED => Err("Please sign in again."),
            StatusCode::NOT_FOUND => Ok(None),
            StatusCode::BAD_REQUEST => Err("Check your entry and try again."),
            StatusCode::PAYLOAD_TOO_LARGE => Err("A paste batch must be at most 10 MB."),
            StatusCode::PRECONDITION_FAILED => {
                Err("This task changed on another device. Review it and try again.")
            }
            StatusCode::PRECONDITION_REQUIRED => Err(
                "This milestone has open done criteria. Confirm to tick them all and complete it.",
            ),
            StatusCode::CONFLICT if path.contains("/milestone") => {
                Err("Link this goal to the task before making it a milestone.")
            }
            status if status.is_success() => response
                .json()
                .await
                .map(Some)
                .map_err(|_| "The server returned an invalid response."),
            _ => Err("Your changes could not be saved. Try again."),
        }
    }

    /// Bearer GET of an attachment's bytes for a fixed path chosen by
    /// attachments.rs. The bytes stay in Rust; 404 is Ok(None). Responses over
    /// `limit` bytes are refused before and while reading.
    pub async fn download(
        &self,
        path: &str,
        limit: usize,
    ) -> Result<Option<Vec<u8>>, &'static str> {
        const FAILED: &str = "The file could not be downloaded. Try again.";
        let origin = self.origin()?;
        let token = credentials::read(&origin)?.ok_or("Please sign in again.")?;
        let mut response = self
            .client
            .get(self.url(path)?)
            .bearer_auth(&*token)
            .timeout(Duration::from_secs(120))
            .send()
            .await
            .map_err(|_| "Cannot reach todalo. Check your connection and try again.")?;
        match response.status() {
            StatusCode::UNAUTHORIZED => return Err("Please sign in again."),
            StatusCode::NOT_FOUND => return Ok(None),
            status if !status.is_success() => return Err(FAILED),
            _ => {}
        }
        if response
            .content_length()
            .is_some_and(|length| length > limit as u64)
        {
            return Err(FAILED);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| FAILED)? {
            if bytes.len() + chunk.len() > limit {
                return Err(FAILED);
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(Some(bytes))
    }

    /// Bearer POST minting a one-use Ramble socket ticket (see ramble.rs). Only
    /// the API base and the short-lived ticket leave; the bearer stays in Rust.
    pub async fn ramble_ticket(&self) -> Result<(Url, String), &'static str> {
        #[derive(Deserialize)]
        struct Ticket {
            ticket: String,
        }
        let origin = self.origin()?;
        let token = credentials::read(&origin)?.ok_or("Please sign in again.")?;
        let response = self
            .client
            .post(self.url("/api/ramble/ticket")?)
            .bearer_auth(&*token)
            .send()
            .await
            .map_err(|_| "Cannot reach todalo. Check your connection and try again.")?;
        match response.status() {
            StatusCode::UNAUTHORIZED => Err("Please sign in again."),
            status if status.is_success() => {
                let base = self.base.clone()?;
                let body: Ticket = response
                    .json()
                    .await
                    .map_err(|_| "The server returned an invalid response.")?;
                Ok((base, body.ticket))
            }
            _ => Err("Cannot reach todalo. Check your connection and try again."),
        }
    }
}
