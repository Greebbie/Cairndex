import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ProjectEntry,
  createWatcher,
  defaultConfig,
  handleVaultChange,
  listProjects,
  listVaultProjects,
  loadProjectConfig,
  pruneDeadProjects,
  readUserPreferences,
  vaultPath,
  writeUserPreferences,
} from "@cairndex/core";
import { type CreateServerResult, type OnboardingHooks, createServer } from "@cairndex/server";
import open from "open";
import { findExeRelative } from "../utils/exePath.js";
import { logger } from "../utils/logger.js";
import { resolveActiveVault } from "../utils/resolveActiveVault.js";
import { defaultProjectIdFromRepo, runProjectRegister } from "./project.js";
import { runVaultInit } from "./vault.js";

export interface UiOptions {
  port?: number;
  openBrowser?: boolean;
  vaultRoot?: string;
}

function findWebDist(): string | undefined {
  // SEA exe sitting next to its portable bundle (dist-sea/web).
  const seaBundle = findExeRelative("web");
  if (
    seaBundle &&
    existsSync(join(seaBundle, "index.html")) &&
    existsSync(join(seaBundle, "assets"))
  ) {
    return seaBundle;
  }
  // SEA exe placed at the repo root: web assets live under packages/web/dist.
  const seaRepoRoot = findExeRelative(join("packages", "web", "dist"));
  if (
    seaRepoRoot &&
    existsSync(join(seaRepoRoot, "index.html")) &&
    existsSync(join(seaRepoRoot, "assets"))
  ) {
    return seaRepoRoot;
  }

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

async function startWatcherForProject(
  project: ProjectEntry,
  server: CreateServerResult,
  watcherStops: Array<() => Promise<void>>,
): Promise<void> {
  const cfg = existsSync(join(vaultPath(project.path), "config.yaml"))
    ? loadProjectConfig(project.path)
    : defaultConfig();
  const onSave = async (path: string): Promise<void> => {
    try {
      const r = await handleVaultChange(project.path, cfg, path);
      if (r.archived) {
        server.sseHub.broadcast(project.alias, { type: "archived", path });
      } else {
        server.sseHub.broadcast(project.alias, { type: "file-changed", path });
      }
      if (r.fixed > 0) {
        server.sseHub.broadcast(project.alias, { type: "reciprocal-added", path });
      }
      if (r.indexUpdated) {
        server.sseHub.broadcast(project.alias, { type: "file-changed", path: "index.md" });
      }
    } catch (err) {
      logger.error({ err, path, alias: project.alias }, "watcher action failed");
    }
  };
  const w = createWatcher({
    repoRoot: project.path,
    cfg,
    debounceMs: 250,
    onChange: onSave,
    onAdd: onSave,
    onUnlink: (path) => server.sseHub.broadcast(project.alias, { type: "archived", path }),
  });
  await w.start();
  watcherStops.push(() => w.stop());
}

export async function runUi(opts: UiOptions): Promise<void> {
  const port = opts.port ?? 7777;
  // Resolve the effective vault: explicit `--vault` > remembered `lastVaultRoot` >
  // legacy registry. The remembered value lets a user double-click the exe and
  // land back in the vault they were last working in.
  const prefs = await readUserPreferences();
  const selection = resolveActiveVault({
    ...(opts.vaultRoot ? { optVaultRoot: opts.vaultRoot } : {}),
    prefVaultRoot: prefs.lastVaultRoot,
  });
  if (selection.source === "pref-stale") {
    logger.info(
      { lastVaultRoot: prefs.lastVaultRoot },
      "remembered vault no longer exists; clearing lastVaultRoot",
    );
    try {
      await writeUserPreferences({ lastVaultRoot: null });
    } catch (err) {
      logger.warn({ err }, "failed to clear stale lastVaultRoot from prefs");
    }
  }
  const activeVault: string | null = selection.vaultRoot;

  // Self-heal the global registry on every UI startup. Persistently removes
  // entries whose `path` no longer exists (test temp dirs, deleted repos, moved
  // checkouts). This is a write but only when there's something to remove —
  // a clean registry is a no-op. Logs how many it pruned so users can spot
  // surprises ("why did 16 projects disappear?").
  if (!activeVault) {
    try {
      const pruned = await pruneDeadProjects();
      if (pruned.length > 0) {
        logger.info(
          { count: pruned.length, aliases: pruned.map((p: ProjectEntry) => p.alias) },
          "pruned dead projects from global registry",
        );
      }
    } catch (err) {
      logger.warn({ err }, "registry prune failed; continuing");
    }
  }
  const projects = activeVault ? await listVaultProjects(activeVault) : await listProjects();
  // Persist explicit `--vault` choices so the next startup remembers them.
  // We do this after listVaultProjects succeeds (above) so a malformed vault
  // path doesn't end up cached as the "last opened" entry.
  if (selection.source === "opt" && activeVault) {
    try {
      await writeUserPreferences({ lastVaultRoot: activeVault });
    } catch (err) {
      logger.warn({ err }, "failed to persist lastVaultRoot to prefs");
    }
  }

  const webRoot = findWebDist();
  if (!webRoot) {
    logger.error(
      "Could not find web UI build output. Run `pnpm -r build` from the repo root and retry.",
    );
    process.exit(1);
  }

  const watcherStops: Array<() => Promise<void>> = [];
  // `serverInstance` is captured by the onboarding callback, which fires
  // after createServer returns. The closure resolves to the live server then.
  let serverInstance: CreateServerResult | null = null;

  const onboarding: OnboardingHooks = {
    async initVault(input) {
      const r = await runVaultInit(input);
      if (r.exitCode !== 0 || !r.vaultRoot) {
        throw new Error(r.message ?? "vault init failed");
      }
      // Persist the just-created vault as the new "last opened" so the user
      // doesn't have to re-onboard on the next double-click of the exe.
      try {
        await writeUserPreferences({ lastVaultRoot: r.vaultRoot });
      } catch (err) {
        logger.warn({ err }, "failed to persist lastVaultRoot after onboarding");
      }
      return { vaultRoot: r.vaultRoot };
    },
    async registerProject(input) {
      const repoRoot = input.repoRoot;
      const projectId = input.projectId ?? defaultProjectIdFromRepo(repoRoot);
      const r = await runProjectRegister({
        vaultRoot: input.vaultRoot,
        projectId,
        repoRoot,
        ...(input.alias !== undefined ? { alias: input.alias } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
      });
      if (r.exitCode !== 0 || !r.projectRoot) {
        throw new Error(r.message ?? "project register failed");
      }
      return { projectRoot: r.projectRoot, vaultRoot: resolve(input.vaultRoot) };
    },
    async onProjectRegistered(project) {
      if (serverInstance) {
        await startWatcherForProject(project, serverInstance, watcherStops);
      }
    },
  };

  const server = await createServer({
    projects,
    webRoot,
    logger: false,
    onboarding,
  });
  serverInstance = server;

  // Per-project watchers: run vault auto-maintenance, then broadcast SSE.
  for (const p of projects) {
    await startWatcherForProject(p, server, watcherStops);
  }

  try {
    await server.listen({ port, host: "127.0.0.1" });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EADDRINUSE") {
      logger.error(
        `Port ${port} is already in use. Try \`cairndex ui --port 8080\` or stop the process using ${port}.`,
      );
    } else {
      logger.error({ err }, "failed to start cairndex ui");
    }
    process.exit(1);
  }
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
