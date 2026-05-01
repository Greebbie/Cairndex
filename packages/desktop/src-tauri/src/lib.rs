// Cairndex desktop library entry. The shell-out plugin lets us spawn `cairndex ui`
// (the local server + watcher) when the user picks "Open vault…", and the WebView
// loads the bundled web build from the workspace's web package.
//
// For v0.1 the desktop app is intentionally thin: it embeds the existing web UI and
// trusts the user to run `cairndex ui` separately (or launches it via the shell plugin).
// Tighter integration (auto-spawn server, vault picker, multi-window) is future work.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running cairndex desktop");
}
