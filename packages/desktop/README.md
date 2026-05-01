# @cairndex/desktop

Tauri 2 desktop wrapper for Cairndex — the long-form Obsidian/Typora-style application form factor.

## v0.1 scope

Minimal shell that loads the bundled `@cairndex/web` UI in a native window. The user still runs `cairndex ui` (or `cairndex mcp`) separately for now; tighter integration (auto-spawn server, vault picker, multi-window) is on the roadmap.

## Prerequisites

- **Rust toolchain** — install via [rustup](https://rustup.rs/). Tauri 2 needs cargo + the platform-specific toolchain.
- Platform deps:
  - macOS: `xcode-select --install`
  - Windows: WebView2 (preinstalled on Win11; otherwise [Microsoft download](https://developer.microsoft.com/microsoft-edge/webview2/))
  - Linux: `webkit2gtk-4.1`, `libayatana-appindicator3-dev`, `librsvg2-dev` (Ubuntu/Debian: `apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`)

## Develop

```sh
pnpm --filter @cairndex/desktop dev
```

This runs `tauri dev`, which starts the web dev server (`pnpm --filter @cairndex/web dev`) and opens a Tauri window pointing at it.

## Build

```sh
pnpm --filter @cairndex/desktop build
```

Produces a platform-native installer (`.dmg` / `.msi` / `.deb` etc.) under `src-tauri/target/release/bundle/`.

## Why Tauri 2

- ~3 MB binary vs Electron's ~150 MB.
- Native WebView (no bundled Chromium).
- Rust core is cheap to add later when we want to spawn the local server in-process or expose Tauri commands to the WebView.

## Roadmap (after v0.1)

- Spawn `cairndex ui` (server + watcher) as a Tauri sidecar so the user doesn't run it separately.
- Vault picker (open/recent/registered) and multi-vault windows — the application form factor that motivated this scaffold.
- Native menu bar with cockpit / pack preview / inbox shortcuts.
- Auto-update via Tauri's updater plugin.
