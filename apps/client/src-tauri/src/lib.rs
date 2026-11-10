mod attachments;
mod auth;
mod bulk;
mod calendar;
mod coach;
mod coach_chat;
mod coach_patterns;
mod coach_planning;
mod comments;
mod credentials;
mod endpoint;
mod feedback;
mod goals;
mod imports;
mod links;
mod metadata;
mod oauth;
mod organization;
mod projects;
mod ramble;
mod reads;
mod rituals;
mod search;
mod seasons;
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
        // Goals ticket 14b: the webview may only check and ask for permission and show a notification.
        .plugin(tauri_plugin_notification::init())
        .manage(NativeAuth::new())
        .manage(oauth::GoogleFlow::default())
        .manage(links::LinkInbox::default())
        .manage(calendar::LiveStream::default())
        .manage(coach::ChatgptLoopback::default())
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
            reads::sync_changes,
            writes::create_task,
            writes::complete_task,
            writes::update_task,
            writes::delete_task,
            bulk::bulk_complete,
            bulk::bulk_delete,
            bulk::bulk_clear_date,
            bulk::bulk_metadata,
            bulk::bulk_move,
            bulk::reorder_task,
            metadata::metadata,
            metadata::label,
            metadata::create_label,
            metadata::update_label,
            metadata::delete_label,
            metadata::saved_filter,
            metadata::create_filter,
            metadata::update_filter,
            metadata::delete_filter,
            metadata::assist_filter,
            projects::projects,
            projects::project,
            projects::create_project,
            projects::rename_project,
            projects::update_project,
            projects::delete_project,
            goals::goals,
            goals::goal,
            goals::create_goal,
            goals::update_goal,
            goals::reorder_goal,
            goals::set_goals_hidden,
            goals::goal_links,
            goals::link_goal,
            goals::goal_suggestions,
            goals::coach_goal_suggestions,
            goals::dismiss_goal_suggestion,
            goals::milestone,
            goals::set_milestone,
            seasons::current_season,
            seasons::start_season,
            seasons::add_season_goal,
            seasons::update_season_goal,
            seasons::remove_season_goal,
            seasons::past_seasons,
            seasons::end_season,
            seasons::season_capacity,
            seasons::save_capacity,
            rituals::rituals,
            rituals::update_ritual_settings,
            rituals::record_ritual_run,
            rituals::weekly_review,
            rituals::season_review,
            coach::coach,
            coach::save_coach_provider,
            coach::disconnect_coach,
            coach::test_coach,
            coach::set_coach_active,
            coach::coach_models,
            coach::coach_explanations,
            coach::start_chatgpt_sign_in,
            coach::finish_chatgpt_sign_in,
            coach::save_chatgpt_model,
            coach::sign_out_chatgpt,
            coach::open_chatgpt_sign_in,
            coach::coach_drafts,
            coach::draft_day,
            coach::draft_week,
            coach::decide_draft,
            coach::coach_recommendations,
            coach::dismiss_recommendation,
            coach::draft_recommendation,
            coach_chat::coach_chat,
            coach_chat::send_coach_chat,
            coach_chat::clear_coach_chat,
            coach_chat::upload_coach_documents,
            coach_chat::delete_coach_document,
            coach_patterns::coach_patterns,
            coach_patterns::learn_coach_patterns,
            coach_patterns::update_coach_pattern,
            coach_patterns::delete_coach_pattern,
            coach_planning::coach_planning,
            organization::destinations,
            organization::create_section,
            organization::rename_section,
            organization::delete_section,
            organization::organize_task,
            attachments::attachments,
            comments::comments,
            comments::add_comment,
            comments::delete_comment,
            attachments::upload_files,
            attachments::save_attachment,
            calendar::calendar_events,
            calendar::calendar_accounts,
            calendar::show_calendar_account_events,
            calendar::set_calendar_visibility,
            calendar::resync_calendar_account,
            calendar::disconnect_calendar_account,
            calendar::live_stream,
            calendar::stop_live_stream,
            calendar::open_calendar_event,
            oauth::google_start,
            oauth::google_finish,
            oauth::google_cancel,
            ramble::ramble_socket,
            ramble::open_microphone_settings,
            ramble::ramble_commit,
            feedback::feedback,
            settings::settings,
            settings::update_settings,
            settings::keyboard_preferences,
            settings::update_keyboard_preferences,
            imports::import_status,
            imports::import_connect,
            imports::import_run,
            imports::import_disconnect,
            imports::import_prompt_seen,
            links::next_link,
            links::task_link,
            search::search_tasks,
            search::quick_find
        ])
        .run(tauri::generate_context!())
        .expect("Cannot launch todalo");
}
