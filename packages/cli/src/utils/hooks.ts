/**
 * Re-export from `@cairndex/core` so existing CLI callers keep working without
 * a code change. The implementation moved to core in Phase H so the server can
 * also import `applyClaudeHooks` (the server `POST /api/projects/:alias/wire-
 * claude-code` endpoint depends on it). The cli → server dep direction prevents
 * server-from-cli imports, so core is the natural shared home.
 */
export {
  applyClaudeHooks,
  renderClaudeSettings,
  renderMcpServerEntry,
  type HookLayoutMode,
} from "@cairndex/core";
