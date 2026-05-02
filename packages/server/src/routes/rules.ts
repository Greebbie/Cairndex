import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { assertContained, rulesDirForProject } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveProject } from "../lib/resolveProject.js";

const RuleNameSchema = z
  .string()
  .min(1)
  .max(80)
  // Allow letters, digits, dot, dash, underscore. No path separators, no leading dot.
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "name must start with [A-Za-z0-9] and contain only letters, digits, dot, dash, or underscore",
  );

const PutBodySchema = z.object({
  content: z.string().max(64 * 1024, "rule body must be under 64 KiB"),
});

function rulePath(dir: string, rawName: string): string {
  // Append .md if the user omitted it; reject names that already contain it twice or have other extensions.
  const normalized = rawName.endsWith(".md") ? rawName : `${rawName}.md`;
  return assertContained(join(dir, normalized), dir);
}

export async function registerRulesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/:alias/rules", async (req, reply) => {
    const { alias } = req.params as { alias: string };
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });
    const dir = rulesDirForProject(project.path);
    if (!existsSync(dir)) return { rules: [], dir };
    const entries = await readdir(dir, { withFileTypes: true });
    const out: Array<{ name: string; size: number; updated: string }> = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue;
      const s = await stat(join(dir, e.name));
      out.push({
        name: basename(e.name, ".md"),
        size: s.size,
        updated: s.mtime.toISOString(),
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return { rules: out, dir };
  });

  app.get("/api/vault/:alias/rules/:name", async (req, reply) => {
    const { alias, name: rawName } = req.params as { alias: string; name: string };
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });
    const nameParse = RuleNameSchema.safeParse(rawName);
    if (!nameParse.success) {
      return reply.code(400).send({ error: nameParse.error.issues[0]?.message ?? "invalid name" });
    }
    const dir = rulesDirForProject(project.path);
    let path: string;
    try {
      path = rulePath(dir, nameParse.data);
    } catch {
      return reply.code(400).send({ error: "invalid rule name" });
    }
    if (!existsSync(path)) return reply.code(404).send({ error: "rule not found" });
    const content = await readFile(path, "utf8");
    return { name: basename(path, ".md"), content };
  });

  app.put("/api/vault/:alias/rules/:name", async (req, reply) => {
    const { alias, name: rawName } = req.params as { alias: string; name: string };
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });
    const nameParse = RuleNameSchema.safeParse(rawName);
    if (!nameParse.success) {
      return reply.code(400).send({ error: nameParse.error.issues[0]?.message ?? "invalid name" });
    }
    const bodyParse = PutBodySchema.safeParse(req.body);
    if (!bodyParse.success) {
      return reply.code(400).send({ error: bodyParse.error.issues[0]?.message ?? "invalid body" });
    }
    const dir = rulesDirForProject(project.path);
    await mkdir(dir, { recursive: true });
    let path: string;
    try {
      path = rulePath(dir, nameParse.data);
    } catch {
      return reply.code(400).send({ error: "invalid rule name" });
    }
    await writeFile(path, bodyParse.data.content, "utf8");
    return { ok: true, name: basename(path, ".md") };
  });

  app.delete("/api/vault/:alias/rules/:name", async (req, reply) => {
    const { alias, name: rawName } = req.params as { alias: string; name: string };
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });
    const nameParse = RuleNameSchema.safeParse(rawName);
    if (!nameParse.success) {
      return reply.code(400).send({ error: nameParse.error.issues[0]?.message ?? "invalid name" });
    }
    const dir = rulesDirForProject(project.path);
    let path: string;
    try {
      path = rulePath(dir, nameParse.data);
    } catch {
      return reply.code(400).send({ error: "invalid rule name" });
    }
    if (!existsSync(path)) return reply.code(404).send({ error: "rule not found" });
    await unlink(path);
    return { ok: true };
  });
}
