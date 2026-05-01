import { runSync, sharedDir } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";

export async function registerSyncRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/sync/:alias", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const r = await runSync({ globalDir: sharedDir(), projectDir: project.path });
    return r;
  });
}
