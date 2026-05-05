import { repairHandoff, type HandoffRepairOptions } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveProject } from "../lib/resolveProject.js";
import { safeLoadConfig } from "../lib/safeLoadConfig.js";

const RepairBody = z.object({
  taskId: z.string().min(1).optional(),
  createTaskTitle: z.string().min(1).optional(),
  nextAction: z.string().min(1).optional(),
  dryRun: z.boolean().optional(),
  rebuildPack: z.boolean().optional(),
  rebuildResume: z.boolean().optional(),
});

export async function registerHandoffRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/vault/:alias/handoff/repair", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const parsed = RepairBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const cfg = safeLoadConfig(project.path, app.log);
    try {
      const opts: HandoffRepairOptions = {};
      if (parsed.data.taskId !== undefined) opts.taskId = parsed.data.taskId;
      if (parsed.data.createTaskTitle !== undefined)
        opts.createTaskTitle = parsed.data.createTaskTitle;
      if (parsed.data.nextAction !== undefined) opts.nextAction = parsed.data.nextAction;
      if (parsed.data.dryRun !== undefined) opts.dryRun = parsed.data.dryRun;
      if (parsed.data.rebuildPack !== undefined) opts.rebuildPack = parsed.data.rebuildPack;
      if (parsed.data.rebuildResume !== undefined) opts.rebuildResume = parsed.data.rebuildResume;
      return await repairHandoff(project.path, cfg, opts);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
