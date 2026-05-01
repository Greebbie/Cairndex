import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildContextPack,
  contextPacksPath,
  parseFrontmatter,
  renderContextPack,
} from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveProject } from "../lib/resolveProject.js";
import { safeLoadConfig } from "../lib/safeLoadConfig.js";

const ComposeBody = z.object({
  task: z.string().optional(),
  budget: z.number().int().positive().optional(),
});

interface PackListEntry {
  packId: string;
  task: string;
  builtAt: string;
  tokenEstimate: number;
  path: string;
}

export async function registerPackRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/vault/:alias/pack", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const parsed = ComposeBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const cfg = safeLoadConfig(project.path, app.log);
    const buildInput: Parameters<typeof buildContextPack>[2] = {};
    if (parsed.data.task !== undefined) buildInput.task = parsed.data.task;
    if (parsed.data.budget !== undefined) buildInput.tokenBudget = parsed.data.budget;
    const pack = await buildContextPack(project.path, cfg, buildInput);
    const body = renderContextPack(pack);

    const dir = contextPacksPath(project.path);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${pack.packId}.md`);
    await writeFile(path, body, "utf8");

    return {
      packId: pack.packId,
      path,
      body,
      tokenEstimate: pack.tokenEstimate,
      tokenBudget: pack.tokenBudget,
      trimmedItems: pack.trimmedItems,
      itemCount: pack.items.length,
    };
  });

  app.get("/api/vault/:alias/pack/:packId", async (req, reply) => {
    const params = req.params as { alias: string; packId: string };
    const alias = String(params.alias);
    const packId = String(params.packId);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const path = join(contextPacksPath(project.path), `${packId}.md`);
    if (!existsSync(path)) return reply.code(404).send({ error: "pack not found" });

    const raw = await readFile(path, "utf8");
    const { data, content } = parseFrontmatter(raw);
    return {
      packId,
      path,
      frontmatter: data,
      body: content,
      raw,
    };
  });

  app.get("/api/vault/:alias/packs", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const dir = contextPacksPath(project.path);
    if (!existsSync(dir)) return { packs: [] };

    const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
    const entries: PackListEntry[] = [];
    for (const f of files) {
      const path = join(dir, f);
      const s = await stat(path);
      try {
        const raw = await readFile(path, "utf8");
        const { data } = parseFrontmatter<{
          id?: string;
          task?: string;
          builtAt?: string;
          tokenEstimate?: number;
        }>(raw);
        entries.push({
          packId: String(data.id ?? f.replace(/\.md$/, "")),
          task: String(data.task ?? ""),
          builtAt: String(data.builtAt ?? new Date(s.mtimeMs).toISOString()),
          tokenEstimate: typeof data.tokenEstimate === "number" ? data.tokenEstimate : 0,
          path,
        });
      } catch {
        // Skip malformed files.
      }
    }
    // Newest first.
    entries.sort((a, b) => (a.builtAt < b.builtAt ? 1 : a.builtAt > b.builtAt ? -1 : 0));
    return { packs: entries };
  });
}
