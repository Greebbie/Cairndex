import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { ConfigSchema, configPath } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import yaml from "js-yaml";
import { z } from "zod";
import { resolveProject } from "../lib/resolveProject.js";

const ScopeSchema = z.enum(["project", "global"]);

function globalConfigPath(): string {
  const root = process.env.CAIRNDEX_HOME ?? join(homedir(), ".cairndex");
  return join(root, "config.yaml");
}

export async function registerConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/config/:alias/:scope", async (req, reply) => {
    const params = req.params as { alias: string; scope: string };
    const scope = ScopeSchema.safeParse(params.scope);
    if (!scope.success) return reply.code(400).send({ error: "invalid scope" });

    let path: string;
    if (scope.data === "global") {
      path = globalConfigPath();
    } else {
      const project = resolveProject(app.projects, params.alias);
      if (!project) return reply.code(404).send({ error: "project not found" });
      path = configPath(project.path);
    }

    if (!existsSync(path)) return {};
    const fileContent = await readFile(path, "utf8");
    const raw = yaml.load(fileContent, { schema: yaml.JSON_SCHEMA }) ?? {};
    if (scope.data === "project") {
      const result = ConfigSchema.safeParse(raw);
      if (!result.success) {
        return {
          ...(raw as Record<string, unknown>),
          _warnings: ["config failed schema validation"],
        };
      }
      return result.data;
    }
    return raw as Record<string, unknown>;
  });

  app.patch("/api/config/:alias/:scope", async (req, reply) => {
    const params = req.params as { alias: string; scope: string };
    const scope = ScopeSchema.safeParse(params.scope);
    if (!scope.success) return reply.code(400).send({ error: "invalid scope" });

    let path: string;
    if (scope.data === "global") {
      path = globalConfigPath();
    } else {
      const project = resolveProject(app.projects, params.alias);
      if (!project) return reply.code(404).send({ error: "project not found" });
      path = configPath(project.path);
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, yaml.dump(body), "utf8");
    return { ok: true };
  });
}
