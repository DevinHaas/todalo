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
            "create_task",
            "complete_task",
            "delete_task",
            "projects",
            "project",
            "create_project",
            "rename_project",
            "delete_project",
            "attachments",
            "upload_files",
            "save_attachment",
            "google_start",
            "google_finish",
            "google_cancel",
            "ramble_socket",
            "feedback",
        ]));
    tauri_build::try_build(attributes).expect("Cannot configure native command permissions");
}
