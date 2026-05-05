import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildActiveContext,
  buildHandoffReadiness,
  buildMemoryHealth,
  findLatestPackWithStaleness,
  scoreAllStoryCoverage,
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
    const storyCoverage = await scoreAllStoryCoverage({ cwd: project.path });

    // Latest context pack + staleness — the UI surfaces a banner when stale so the
    // user knows to rebuild before the agent relies on the cached pack. The helper
    // is shared with bootstrap so both surfaces report the same shape.
    const latest = await findLatestPackWithStaleness(project.path);
    const agentContext: {
      latestPack: {
        id: string;
        path: string;
        builtAt: string;
        lastMemoryChangeAt: string | null;
        stale: boolean;
      } | null;
    } = { latestPack: latest };
    const handoffReadiness = buildHandoffReadiness({
      projectState,
      memoryHealth,
      storyCoverage,
      latestPack: latest,
    });

    // Recent activity from changes/changelog.md (top 10).
    const changelog = join(vaultPath(project.path), "changes", "changelog.md");
    const recentActivity = existsSync(changelog)
      ? parseRecentActivity(await readFile(changelog, "utf8"), 10)
      : [];

    return { projectState, agentContext, memoryHealth, handoffReadiness, recentActivity };
  });
}
