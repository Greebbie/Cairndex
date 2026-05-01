import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { vaultPath } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";

interface ChangeEvent {
  date: string;
  summary: string;
}

const LINE_RE = /^- (\d{4}-\d{2}-\d{2})\s+—\s+(.+)$/;

function parseChangelog(raw: string): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  for (const line of raw.split("\n")) {
    const m = LINE_RE.exec(line.trim());
    if (m?.[1] && m[2]) events.push({ date: m[1], summary: m[2] });
  }
  return events;
}

export async function registerChangesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/changes/:alias", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const path = join(vaultPath(project.path), "changes", "changelog.md");
    if (!existsSync(path)) return { events: [] };
    const raw = await readFile(path, "utf8");
    return { events: parseChangelog(raw) };
  });
}
