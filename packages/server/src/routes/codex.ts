import { applyCodexHooks, readCodexStatus } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";

export async function registerCodexRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects/:alias/codex-status", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });
    return readCodexStatus(project.repoRoot ?? project.path);
  });

  app.post("/api/projects/:alias/codex-wire", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });
    try {
      return await applyCodexHooks(project.repoRoot ?? project.path);
    } catch (err) {
      app.log.error({ err, alias }, "applyCodexHooks failed");
      return reply.code(500).send({
        error: "failed to connect Codex",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
