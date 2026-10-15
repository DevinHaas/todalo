mod attachments;
mod auth;
mod credentials;
mod endpoint;
mod feedback;
mod links;
mod metadata;
mod oauth;
mod organization;
mod projects;
mod ramble;
mod reads;
mod search;
mod settings;
mod writes;
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
        // Rust-only: the webview gets no opener or deep-link permission.
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        // Rust-only too: the webview reaches it through the semantic `feedback` command.
        .plugin(tauri_plugin_haptics::init())
        .manage(NativeAuth::new())
        .manage(oauth::GoogleFlow::default())
        .manage(links::LinkInbox::default())
        .setup(|app| {
            use tauri_plugin_deep_link::DeepLinkExt;
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls: Vec<String> = event.urls().iter().map(|url| url.to_string()).collect();
                links::handle(&handle, &urls);
                oauth::handle(&handle, urls);
            });
            // Cold launch by the returning link (or a task link; not on iOS, see links.rs).
            if let Some(urls) = app.deep_link().get_current()? {
                let urls: Vec<String> = urls.iter().map(|url| url.to_string()).collect();
                links::handle(app.handle(), &urls);
                oauth::handle(app.handle(), urls);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            account,
            sign_in,
            sign_up,
            sign_out,
            reads::today,
            reads::task,
            writes::create_task,
            writes::complete_task,
            writes::update_task,
            writes::delete_task,
            metadata::metadata,
            metadata::label,
            metadata::create_label,
            metadata::update_label,
            metadata::delete_label,
            metadata::saved_filter,
            metadata::create_filter,
            metadata::update_filter,
            metadata::delete_filter,
            projects::projects,
            projects::project,
            projects::create_project,
            projects::rename_project,
            projects::delete_project,
            organization::destinations,
            organization::create_section,
            organization::delete_section,
            organization::organize_task,
            attachments::attachments,
            attachments::upload_files,
            attachments::save_attachment,
            oauth::google_start,
            oauth::google_finish,
            oauth::google_cancel,
            ramble::ramble_socket,
            feedback::feedback,
            settings::settings,
            settings::update_settings,
            links::next_link,
            links::task_link,
            search::search_tasks,
            search::quick_find
        ])
        .run(tauri::generate_context!())
        .expect("Cannot launch todalo");
}
