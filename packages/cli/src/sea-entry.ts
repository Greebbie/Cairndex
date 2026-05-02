/**
 * Single-Executable-Application entry for the portable Cairndex.exe.
 *
 * Layout shipped to users:
 *   Cairndex/
 *     Cairndex.exe   ← this entry, bundled via Node SEA
 *     web/           ← Vite build output (located by findWebDist)
 *     templates/     ← bundled templates (located by findBundledTemplatesDir)
 *
 * Behavior: starts the Fastify server on 127.0.0.1:7777, opens the user's
 * default browser, handles Ctrl+C / window close.
 */
import { runUi } from "./commands/ui.js";

async function main(): Promise<void> {
  // CAIRNDEX_NO_OPEN=1 suppresses auto-open (used by smoke tests).
  // CAIRNDEX_PORT overrides the default 7777.
  const port = Number(process.env.CAIRNDEX_PORT ?? 7777);
  const openBrowser = process.env.CAIRNDEX_NO_OPEN !== "1";
  await runUi({ port, openBrowser });
}

main().catch((err) => {
  console.error("[Cairndex] failed to start:", err);
  process.exit(1);
});
