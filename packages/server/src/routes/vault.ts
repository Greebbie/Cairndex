import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  computeBacklinks,
  folderForType,
  listAllTypes,
  listNodeFilesByName,
  parseFrontmatter,
  readNodeByName,
  vaultPath,
} from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";
import { safeLoadConfig } from "../lib/safeLoadConfig.js";

export async function registerVaultRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/:alias", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const cfg = safeLoadConfig(project.path, app.log);

    // Counts cover every declared type — built-in plus any custom node_types
    // the user has added — so the Browse page and dashboard see them all.
    const counts: Record<string, number> = {};
    for (const t of listAllTypes(cfg)) {
      counts[t.name] = (await listNodeFilesByName(project.path, cfg, t.name)).length;
    }

    let phase: string | null = null;
    let nextAction: string | null = null;
    const indexFile = join(vaultPath(project.path), "index.md");
    if (existsSync(indexFile)) {
      const raw = await readFile(indexFile, "utf8");
      const data = parseFrontmatter<Record<string, unknown>>(raw).data;
      phase = (data.phase as string | undefined) ?? null;
      nextAction = (data.next_action as string | undefined) ?? null;
    }

    return { counts, phase, nextAction };
  });

  app.get("/api/vault/:alias/types", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });
    const cfg = safeLoadConfig(project.path, app.log);
    return { types: listAllTypes(cfg) };
  });

  app.get("/api/vault/:alias/:type", async (req, reply) => {
    const params = req.params as { alias: string; type: string };
    const project = resolveProject(app.projects, params.alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const cfg = safeLoadConfig(project.path, app.log);
    if (!folderForType(cfg, params.type)) {
      return reply.code(400).send({ error: `unknown node type: ${params.type}` });
    }

    const files = await listNodeFilesByName(project.path, cfg, params.type);
    return files.map((f) => ({
      id: f.id,
      title: (f.frontmatter.title as string | undefined) ?? null,
      status: (f.frontmatter.status as string | undefined) ?? null,
      updated: (f.frontmatter.updated as string | undefined) ?? null,
      path: f.path,
    }));
  });

  app.get("/api/vault/:alias/:type/:id", async (req, reply) => {
    const params = req.params as { alias: string; type: string; id: string };
    const project = resolveProject(app.projects, params.alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const cfg = safeLoadConfig(project.path, app.log);
    if (!folderForType(cfg, params.type)) {
      return reply.code(400).send({ error: `unknown node type: ${params.type}` });
    }

    const node = await readNodeByName(project.path, cfg, params.type, params.id);
    if (!node) return reply.code(404).send({ error: "node not found" });

    const idx = await computeBacklinks(project.path, cfg);
    const backlinks = idx.get(params.id) ?? [];
    const links = (node.frontmatter.links ?? []) as unknown[];

    return {
      frontmatter: node.frontmatter,
      body: node.body,
      links,
      backlinks,
      path: node.path,
    };
  });
}
