import { completeTask, setPhase, switchTask } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveProject } from "../lib/resolveProject.js";
import { safeLoadConfig } from "../lib/safeLoadConfig.js";

/**
 * Workflow-state HTTP endpoints. These mirror the CLI verbs in
 * `packages/cli/src/commands/workflow.ts` so the web dashboard can advance project
 * state without dropping to a terminal.
 *
 * Like the CLI side, these mutate canonical files directly — they advance state, they
 * don't propose memory content. See `packages/core/src/workflow/taskState.ts` for the
 * inbox-bypass rationale (every task switch / complete still writes a changelog line
 * for auditability).
 */

const TaskSwitchBody = z.object({
  taskId: z.string().min(1),
});

const TaskCompleteBody = z.object({
  // Optional — when omitted, the active context's current task is completed.
  taskId: z.string().min(1).optional(),
});

const PhaseSetBody = z.object({
  phase: z.string().min(1),
});

export async function registerWorkflowRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/vault/:alias/task/switch", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const parsed = TaskSwitchBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const cfg = safeLoadConfig(project.path, app.log);
    try {
      const r = await switchTask(project.path, cfg, parsed.data.taskId);
      return r;
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/vault/:alias/task/complete", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const parsed = TaskCompleteBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const cfg = safeLoadConfig(project.path, app.log);
    try {
      const r = await completeTask(project.path, cfg, parsed.data.taskId);
      return r;
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/vault/:alias/phase/set", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const parsed = PhaseSetBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const r = await setPhase(project.path, parsed.data.phase);
      return r;
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
