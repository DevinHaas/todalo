mod auth;
mod credentials;
mod endpoint;
use auth::{Account, Credentials, NativeAuth};

#[tauri::command]
async fn account(state: tauri::State<'_, NativeAuth>) -> Result<Option<Account>, String> {
    let _gate = state.gate.lock().await;
    state.account().await.map_err(str::to_owned)
}

#[tauri::command]
async fn sign_in(
    state: tauri::State<'_, NativeAuth>,
    credentials: Credentials,
) -> Result<Account, String> {
    let _gate = state.gate.lock().await;
    state
        .authenticate(credentials, false)
        .await
        .map_err(str::to_owned)
}

#[tauri::command]
async fn sign_up(
    state: tauri::State<'_, NativeAuth>,
    credentials: Credentials,
) -> Result<Account, String> {
    let _gate = state.gate.lock().await;
    state
        .authenticate(credentials, true)
        .await
        .map_err(str::to_owned)
}

#[tauri::command]
async fn sign_out(state: tauri::State<'_, NativeAuth>) -> Result<(), String> {
    let _gate = state.gate.lock().await;
    state.sign_out().await.map_err(str::to_owned)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(NativeAuth::new())
        .invoke_handler(tauri::generate_handler![
            account, sign_in, sign_up, sign_out
        ])
        .run(tauri::generate_context!())
        .expect("Cannot launch todalo");
}
