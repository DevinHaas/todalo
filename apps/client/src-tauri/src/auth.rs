use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::Mutex;
use zeroize::Zeroizing;

use crate::{credentials, endpoint::endpoint};

pub struct NativeAuth {
    client: Client,
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
        let configured = option_env!("TODALO_API_BASE_URL").unwrap_or(if cfg!(debug_assertions) {
            "http://127.0.0.1:3001"
        } else {
            ""
        });
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

    fn origin(&self) -> Result<String, &'static str> {
        Ok(self
            .base
            .as_ref()
            .map_err(|error| *error)?
            .origin()
            .ascii_serialization())
    }

    fn url(&self, path: &str) -> Result<Url, &'static str> {
        self.base
            .as_ref()
            .map_err(|error| *error)?
            .join(path)
            .map_err(|_| "Invalid API endpoint.")
    }

    async fn revoke(&self, token: &str) -> Result<(), &'static str> {
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

    async fn identity(&self, token: &str) -> Result<Option<Account>, &'static str> {
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
}
