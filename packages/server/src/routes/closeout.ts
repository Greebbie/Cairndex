import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prefillCloseOut, submitCloseOut } from "@cairndex/core";
import { resolveProject } from "../lib/resolveProject.js";

const CloseOutAnswersSchema = z.object({
  didFinish: z.string(),
  decisionOrLearning: z.string(),
  nextStep: z.string(),
});

const SubmitBodySchema = z.object({
  sessionId: z.string().min(1),
  answers: CloseOutAnswersSchema,
});

/**
 * Close-out routes for the Cairndex dashboard.
 *
 * GET /api/vault/:alias/closeout/draft?sessionId=<id>
 *   Returns heuristic-prefilled draft answers for the three close-out questions.
 *   The client renders these as editable defaults; the user confirms/edits before
 *   submitting. Response: { sessionId, draft: CloseOutAnswers }.
 *
 * POST /api/vault/:alias/closeout
 *   Body: { sessionId, answers: CloseOutAnswers }
 *   Persists the confirmed answers into the vault (session file, active task,
 *   optional inbox proposal) and rebuilds state/resume.json as a side effect.
 *   Response: SubmitCloseOutResult { sessionPath, taskPath, proposalId }.
 */
export async function registerCloseOutRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/:alias/closeout/draft", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const sessionId = String((req.query as { sessionId?: string }).sessionId ?? "");
    if (!sessionId) return reply.code(400).send({ error: "sessionId required" });

    const draft = await prefillCloseOut({ cwd: project.path, sessionId });
    return { sessionId, draft };
  });

  app.post("/api/vault/:alias/closeout", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const parsed = SubmitBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid payload", issues: parsed.error.issues });
    }

    const result = await submitCloseOut({
      cwd: project.path,
      sessionId: parsed.data.sessionId,
      answers: parsed.data.answers,
    });
    return result;
  });
}
