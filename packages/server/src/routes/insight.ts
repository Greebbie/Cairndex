import { existsSync } from "node:fs";
import { appendFile, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  assertContained,
  defaultConfig,
  parseFrontmatter,
  serializeFrontmatter,
  sharedDir,
  vaultPath,
} from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveProject } from "../lib/resolveProject.js";

const BodySchema = z.object({ id: z.string().min(1) });

async function findInsight(folder: string, id: string): Promise<string | null> {
  if (!existsSync(folder)) return null;
  for (const e of await readdir(folder)) {
    if (!e.endsWith(".md") || e.toLowerCase() === "readme.md") continue;
    if (e.startsWith(`${id}-`) || e === `${id}.md`) return join(folder, e);
  }
  return null;
}

export async function registerInsightRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/insight/:alias/promote", async (req, reply) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "id required" });
    const project = resolveProject(app.projects, String((req.params as { alias: string }).alias));
    if (!project) return reply.code(404).send({ error: "project not found" });

    const projectDir = join(vaultPath(project.path), defaultConfig().folders.insights);
    const src = await findInsight(projectDir, parsed.data.id);
    if (!src) return reply.code(404).send({ error: "insight not found" });
    try {
      assertContained(src, projectDir);
    } catch {
      return reply.code(400).send({ error: "invalid insight path" });
    }

    const dest = join(sharedDir(), "insights");
    await mkdir(dest, { recursive: true });
    await copyFile(src, join(dest, basename(src)));

    const raw = await readFile(src, "utf8");
    const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
    const next = { ...data, promoted_to_global: true };
    await writeFile(src, serializeFrontmatter(next, content), "utf8");

    const today = new Date().toISOString().slice(0, 10);
    const changelog = join(vaultPath(project.path), "changes/changelog.md");
    await mkdir(join(vaultPath(project.path), "changes"), { recursive: true });
    await appendFile(
      changelog,
      `- ${today} — Promoted ${parsed.data.id} to global insights.\n`,
      "utf8",
    );

    return { ok: true };
  });

  app.post("/api/insight/:alias/pull", async (req, reply) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "id required" });
    const project = resolveProject(app.projects, String((req.params as { alias: string }).alias));
    if (!project) return reply.code(404).send({ error: "project not found" });

    const globalDir = join(sharedDir(), "insights");
    const src = await findInsight(globalDir, parsed.data.id);
    if (!src) return reply.code(404).send({ error: "global insight not found" });
    try {
      assertContained(src, globalDir);
    } catch {
      return reply.code(400).send({ error: "invalid insight path" });
    }

    const projectDir = join(vaultPath(project.path), defaultConfig().folders.insights);
    await mkdir(projectDir, { recursive: true });
    await copyFile(src, join(projectDir, basename(src)));

    const today = new Date().toISOString().slice(0, 10);
    const changelog = join(vaultPath(project.path), "changes/changelog.md");
    await mkdir(join(vaultPath(project.path), "changes"), { recursive: true });
    await appendFile(
      changelog,
      `- ${today} — Pulled ${parsed.data.id} from global insights.\n`,
      "utf8",
    );

    return { ok: true };
  });
}
