import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  buildImplementationLine,
  implementationLinePath,
} from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";
import { safeLoadConfig } from "../lib/safeLoadConfig.js";

/**
 * Returns the implementation line — completed/in_progress/pending tasks in
 * priority order, with plan grouping. Reads the cached `indexes/implementation-
 * line.json` first; falls through to a live build when the cache is missing
 * (fresh project before `cairndex doctor` ran). The Phase 3 / dashboard view
 * page consumes this endpoint.
 */
export async function registerImplementationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/:alias/implementation", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const cachePath = implementationLinePath(project.path);
    if (existsSync(cachePath)) {
      try {
        const raw = await readFile(cachePath, "utf8");
        return JSON.parse(raw);
      } catch (err) {
        app.log.warn({ err, cachePath }, "implementation-line cache unreadable; rebuilding");
      }
    }

    const cfg = safeLoadConfig(project.path, app.log);
    return await buildImplementationLine(project.path, cfg);
  });
}
