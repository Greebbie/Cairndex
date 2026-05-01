import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildActiveContext,
  buildMemoryHealth,
  vaultPath,
} from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";
import { safeLoadConfig } from "../lib/safeLoadConfig.js";

interface RecentActivityEvent {
  date: string;
  summary: string;
}

const LINE_RE = /^- (\d{4}-\d{2}-\d{2})\s+—\s+(.+)$/;

function parseRecentActivity(raw: string, limit: number): RecentActivityEvent[] {
  const events: RecentActivityEvent[] = [];
  for (const line of raw.split("\n")) {
    const m = LINE_RE.exec(line.trim());
    if (m?.[1] && m[2]) events.push({ date: m[1], summary: m[2] });
  }
  // Newest first; the changelog is written newest-last by convention but agents may invert.
  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return events.slice(0, limit);
}

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/:alias/dashboard", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const cfg = safeLoadConfig(project.path, app.log);

    const projectState = await buildActiveContext(project.path, cfg);
    const memoryHealth = await buildMemoryHealth(project.path, cfg);

    // Look up the most recent context pack in indexes/context-packs/, if any.
    const packsDir = join(vaultPath(project.path), "indexes", "context-packs");
    let agentContext: { latestPack: { id: string; path: string; builtAt: string } | null } = {
      latestPack: null,
    };
    if (existsSync(packsDir)) {
      const fs = await import("node:fs/promises");
      const files = (await fs.readdir(packsDir)).filter((f) => f.endsWith(".md"));
      if (files.length > 0) {
        // Pick the most-recently-modified pack file.
        const stats = await Promise.all(
          files.map(async (f) => ({ f, m: (await fs.stat(join(packsDir, f))).mtimeMs })),
        );
        stats.sort((a, b) => b.m - a.m);
        const latest = stats[0];
        if (latest) {
          const fullPath = join(packsDir, latest.f);
          const raw = await readFile(fullPath, "utf8");
          const fmStart = raw.indexOf("---") === 0 ? raw.indexOf("---", 3) : -1;
          const fmBlock = fmStart > 0 ? raw.slice(0, fmStart) : "";
          const idMatch = /^id:\s*(\S+)/m.exec(fmBlock);
          const builtAtMatch = /^builtAt:\s*['"]?([^'"\n]+)['"]?/m.exec(fmBlock);
          agentContext = {
            latestPack: {
              id: idMatch?.[1] ?? latest.f.replace(/\.md$/, ""),
              path: fullPath,
              builtAt: builtAtMatch?.[1]?.trim() ?? "",
            },
          };
        }
      }
    }

    // Recent activity from changes/changelog.md (top 10).
    const changelog = join(vaultPath(project.path), "changes", "changelog.md");
    const recentActivity = existsSync(changelog)
      ? parseRecentActivity(await readFile(changelog, "utf8"), 10)
      : [];

    return { projectState, agentContext, memoryHealth, recentActivity };
  });
}
