import {
  acceptProposal,
  createProposal,
  findDuplicate,
  listProposals,
  type NodeType,
  rejectProposal,
} from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveProject } from "../lib/resolveProject.js";
import { safeLoadConfig } from "../lib/safeLoadConfig.js";

const NODE_TYPE_VALUES = [
  "goal",
  "intent",
  "spec",
  "decision",
  "plan",
  "task",
  "session",
  "change",
  "insight",
  "question",
] as const;

const ProposeBody = z.object({
  proposalType: z.enum(["create", "update"]),
  targetType: z.enum(NODE_TYPE_VALUES),
  target: z.string().optional(),
  newFrontmatter: z.record(z.unknown()).optional(),
  newBody: z.string(),
  summary: z.string().min(1),
  reason: z.string().default(""),
  provenance: z.object({
    createdBy: z.string(),
    session: z.string(),
    confidence: z.number().min(0).max(1).optional(),
  }),
});

const RejectBody = z.object({
  reason: z.string().min(1),
});

export async function registerInboxRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/:alias/inbox", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const cfg = safeLoadConfig(project.path, app.log);
    const list = await listProposals(project.path, cfg);
    return list;
  });

  app.post("/api/vault/:alias/inbox/propose", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const parsed = ProposeBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const cfg = safeLoadConfig(project.path, app.log);

    const dupInput: Parameters<typeof findDuplicate>[2] = {
      proposalType: parsed.data.proposalType,
      targetType: parsed.data.targetType as NodeType,
      newBody: parsed.data.newBody,
    };
    if (parsed.data.target !== undefined) dupInput.target = parsed.data.target;
    const duplicateOf = await findDuplicate(project.path, cfg, dupInput);

    const createInput: Parameters<typeof createProposal>[2] = {
      proposalType: parsed.data.proposalType,
      targetType: parsed.data.targetType as NodeType,
      newBody: parsed.data.newBody,
      summary: parsed.data.summary,
      reason: parsed.data.reason,
      provenance: {
        createdBy: parsed.data.provenance.createdBy,
        session: parsed.data.provenance.session,
        ...(parsed.data.provenance.confidence !== undefined
          ? { confidence: parsed.data.provenance.confidence }
          : {}),
      },
    };
    if (parsed.data.target !== undefined) createInput.target = parsed.data.target;
    if (parsed.data.newFrontmatter !== undefined) {
      createInput.newFrontmatter = parsed.data.newFrontmatter;
    }
    try {
      const created = await createProposal(project.path, cfg, createInput);
      const out: Record<string, unknown> = {
        proposalId: created.proposalId,
        path: created.path,
        contentHash: created.contentHash,
      };
      if (duplicateOf) out.duplicateOf = duplicateOf;
      return out;
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/vault/:alias/inbox/:proposalId/accept", async (req, reply) => {
    const params = req.params as { alias: string; proposalId: string };
    const project = resolveProject(app.projects, params.alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const cfg = safeLoadConfig(project.path, app.log);
    try {
      const applied = await acceptProposal(project.path, cfg, params.proposalId);
      return { applied };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }
  });

  app.post("/api/vault/:alias/inbox/:proposalId/reject", async (req, reply) => {
    const params = req.params as { alias: string; proposalId: string };
    const project = resolveProject(app.projects, params.alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const parsed = RejectBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const cfg = safeLoadConfig(project.path, app.log);
    try {
      await rejectProposal(project.path, cfg, params.proposalId, parsed.data.reason);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }
  });
}
