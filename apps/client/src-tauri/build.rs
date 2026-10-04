fn main() {
    println!("cargo:rerun-if-env-changed=TODALO_API_BASE_URL");
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["account", "sign_in", "sign_up", "sign_out"]),
    );
    tauri_build::try_build(attributes).expect("Cannot configure native command permissions");
}
