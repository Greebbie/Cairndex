import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWatcher,
  defaultConfig,
  handleVaultChange,
  listProjects,
  listVaultProjects,
  loadProjectConfig,
  vaultPath,
} from "@cairndex/core";
import { createServer } from "@cairndex/server";
import open from "open";
import { logger } from "../utils/logger.js";

export interface UiOptions {
  port?: number;
  openBrowser?: boolean;
  vaultRoot?: string;
}

function findWebDist(): string | undefined {
  const here =
    typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "web"), // packaged: <pkg>/dist/web → resolved via shipped layout
    join(here, "..", "..", "web"),
    join(here, "..", "..", "..", "web"),
    join(here, "..", "..", "packages", "web", "dist"), // monorepo dev
    join(here, "..", "..", "..", "packages", "web", "dist"),
  ];
  // Only accept candidates that look like a real Vite build output (has index.html + assets/).
  for (const c of candidates) {
    if (existsSync(join(c, "index.html")) && existsSync(join(c, "assets"))) return c;
  }
  return undefined;
}

export async function runUi(opts: UiOptions): Promise<void> {
  const port = opts.port ?? 7777;
  const projects = opts.vaultRoot ? await listVaultProjects(opts.vaultRoot) : await listProjects();

  const webRoot = findWebDist();
  if (!webRoot) {
    logger.warn("web/dist not found; running API-only mode (no GUI). Build packages/web first.");
  }

  const server = await createServer({
    projects,
    ...(webRoot !== undefined ? { webRoot } : {}),
    logger: false,
  });

  // Per-project watchers: run vault auto-maintenance, then broadcast SSE.
  const watcherStops: Array<() => Promise<void>> = [];
  for (const p of projects) {
    const cfg = existsSync(join(vaultPath(p.path), "config.yaml"))
      ? loadProjectConfig(p.path)
      : defaultConfig();
    const onSave = async (path: string): Promise<void> => {
      try {
        const r = await handleVaultChange(p.path, cfg, path);
        if (r.archived) {
          server.sseHub.broadcast(p.alias, { type: "archived", path });
        } else {
          server.sseHub.broadcast(p.alias, { type: "file-changed", path });
        }
        if (r.fixed > 0) {
          server.sseHub.broadcast(p.alias, { type: "reciprocal-added", path });
        }
        if (r.indexUpdated) {
          server.sseHub.broadcast(p.alias, { type: "file-changed", path: "index.md" });
        }
      } catch (err) {
        logger.error({ err, path, alias: p.alias }, "watcher action failed");
      }
    };
    const w = createWatcher({
      repoRoot: p.path,
      cfg,
      debounceMs: 250,
      onChange: onSave,
      onAdd: onSave,
      onUnlink: (path) => server.sseHub.broadcast(p.alias, { type: "archived", path }),
    });
    await w.start();
    watcherStops.push(() => w.stop());
  }

  await server.listen({ port, host: "127.0.0.1" });
  const url = `http://localhost:${port}`;
  logger.info({ url }, "cairndex ui started");

  if (opts.openBrowser !== false) {
    try {
      await open(url);
    } catch {
      /* user-controlled browser; ignore */
    }
  }

  const shutdown = async () => {
    logger.info("shutting down");
    for (const stop of watcherStops) await stop().catch(() => {});
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
