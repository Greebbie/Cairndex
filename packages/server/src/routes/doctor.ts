import { applyAutoFixes, runValidation } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";
import { safeLoadConfig } from "../lib/safeLoadConfig.js";

export async function registerDoctorRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/doctor/:alias", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const cfg = safeLoadConfig(project.path, app.log);
    const issues = await runValidation(project.path, cfg);
    return { issues };
  });

  app.post("/api/doctor/:alias/fix", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const cfg = safeLoadConfig(project.path, app.log);
    const issues = await runValidation(project.path, cfg);
    const r = await applyAutoFixes(project.path, cfg, issues);
    return r;
  });
}
