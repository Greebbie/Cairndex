import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  NODE_TYPES,
  type NodeType,
  computeBacklinks,
  listNodeFiles,
  parseFrontmatter,
  readNode,
  vaultPath,
} from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveProject } from "../lib/resolveProject.js";
import { safeLoadConfig } from "../lib/safeLoadConfig.js";

const NodeTypeSchema = z.enum(NODE_TYPES);

export async function registerVaultRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/:alias", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const cfg = safeLoadConfig(project.path, app.log);

    const counts: Record<NodeType, number> = {} as Record<NodeType, number>;
    for (const t of NODE_TYPES) {
      counts[t] = (await listNodeFiles(project.path, cfg, t)).length;
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

  app.get("/api/vault/:alias/:type", async (req, reply) => {
    const params = req.params as { alias: string; type: string };
    const project = resolveProject(app.projects, params.alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const typeRes = NodeTypeSchema.safeParse(params.type);
    if (!typeRes.success) return reply.code(400).send({ error: "invalid node type" });

    const cfg = safeLoadConfig(project.path, app.log);

    const files = await listNodeFiles(project.path, cfg, typeRes.data);
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

    const typeRes = NodeTypeSchema.safeParse(params.type);
    if (!typeRes.success) return reply.code(400).send({ error: "invalid node type" });

    const cfg = safeLoadConfig(project.path, app.log);
    const node = await readNode(project.path, cfg, typeRes.data, params.id);
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
