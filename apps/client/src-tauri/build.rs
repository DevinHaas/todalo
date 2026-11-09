// `tauri ios build|dev` compiles Rust from an Xcode build phase that only
// receives the Tauri CLI's forwarded environment (TAURI*, WRY*, CARGO_*,
// RUST_*), so a plain TODALO_API_BASE_URL never reaches iOS builds. Accept the
// forwarded TAURI_TODALO_API_BASE_URL spelling too and resolve one value here.
// vite.config.ts fails the iOS build if only the unforwarded name was set.
const NAMES: [&str; 2] = ["TODALO_API_BASE_URL", "TAURI_TODALO_API_BASE_URL"];

fn main() {
    let mut requested = None::<(String, &str)>;
    for name in NAMES {
        println!("cargo:rerun-if-env-changed={name}");
        let Ok(value) = std::env::var(name) else {
            continue;
        };
        let value = value.trim().to_owned();
        if value.is_empty() {
            panic!("{name} is set but empty; unset it or provide the API origin");
        }
        if let Some((previous, first)) = &requested {
            if previous != &value {
                panic!("{first}={previous} conflicts with {name}={value}; set only one");
            }
        }
        requested.get_or_insert((value, name));
    }
    // Unrequested debug builds use the local dev API; unrequested release builds
    // embed nothing and fail closed at runtime. endpoint.rs enforces the policy.
    // Resolving here keeps exactly one origin in the binary for `strings` checks.
    let resolved = match requested {
        Some((value, _)) => value,
        None if std::env::var("PROFILE").as_deref() == Ok("debug") => {
            "http://127.0.0.1:3001".to_owned()
        }
        None => String::new(),
    };
    println!("cargo:rustc-env=TODALO_RESOLVED_API_BASE_URL={resolved}");

    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "account",
            "sign_in",
            "sign_up",
            "sign_out",
            "today",
            "task",
            "sync_changes",
            "create_task",
            "complete_task",
            "update_task",
            "delete_task",
            "bulk_complete",
            "bulk_delete",
            "bulk_clear_date",
            "bulk_metadata",
            "bulk_move",
            "reorder_task",
            "metadata",
            "label",
            "create_label",
            "update_label",
            "delete_label",
            "saved_filter",
            "create_filter",
            "update_filter",
            "delete_filter",
            "projects",
            "project",
            "create_project",
            "rename_project",
            "delete_project",
            "goals",
            "goal",
            "create_goal",
            "update_goal",
            "reorder_goal",
            "set_goals_hidden",
            "goal_links",
            "link_goal",
            "goal_suggestions",
            "coach_goal_suggestions",
            "dismiss_goal_suggestion",
            "milestone",
            "set_milestone",
            "current_season",
            "start_season",
            "add_season_goal",
            "update_season_goal",
            "remove_season_goal",
            "past_seasons",
            "end_season",
            "season_capacity",
            "save_capacity",
            "rituals",
            "update_ritual_settings",
            "record_ritual_run",
            "weekly_review",
            "season_review",
            "coach",
            "save_coach_provider",
            "disconnect_coach",
            "test_coach",
            "set_coach_active",
            "coach_models",
            "coach_explanations",
            "start_chatgpt_sign_in",
            "finish_chatgpt_sign_in",
            "save_chatgpt_model",
            "sign_out_chatgpt",
            "open_chatgpt_sign_in",
            "coach_drafts",
            "draft_day",
            "draft_week",
            "decide_draft",
            "coach_recommendations",
            "dismiss_recommendation",
            "draft_recommendation",
            "coach_chat",
            "send_coach_chat",
            "clear_coach_chat",
            "upload_coach_documents",
            "delete_coach_document",
            "coach_patterns",
            "learn_coach_patterns",
            "update_coach_pattern",
            "delete_coach_pattern",
            "coach_planning",
            "destinations",
            "create_section",
            "delete_section",
            "organize_task",
            "attachments",
            "comments",
            "add_comment",
            "delete_comment",
            "upload_files",
            "save_attachment",
            "calendar_events",
            "calendar_accounts",
            "show_calendar_account_events",
            "set_calendar_visibility",
            "resync_calendar_account",
            "disconnect_calendar_account",
            "live_stream",
            "stop_live_stream",
            "open_calendar_event",
            "google_start",
            "google_finish",
            "google_cancel",
            "ramble_socket",
            "open_microphone_settings",
            "ramble_commit",
            "feedback",
            "settings",
            "update_settings",
            "keyboard_preferences",
            "update_keyboard_preferences",
            "import_status",
            "import_connect",
            "import_run",
            "import_disconnect",
            "import_prompt_seen",
            "next_link",
            "task_link",
            "search_tasks",
            "quick_find",
        ]));
    tauri_build::try_build(attributes).expect("Cannot configure native command permissions");
}
