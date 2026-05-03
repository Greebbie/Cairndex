import {
  type NodeType,
  acceptProposal,
  createWithAutoAccept,
  findDuplicate,
  listProposals,
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

const PatchOpSchema = z.object({
  kind: z.enum(["append-section", "replace-section"]),
  section: z.string().min(1),
  content: z.string(),
});

const ProposeBody = z
  .object({
    proposalType: z.enum(["create", "update"]),
    targetType: z.enum(NODE_TYPE_VALUES),
    target: z.string().optional(),
    newFrontmatter: z.record(z.unknown()).optional(),
    newBody: z.string().optional(),
    patch: z.array(PatchOpSchema).min(1).optional(),
    summary: z.string().min(1),
    reason: z.string().default(""),
    provenance: z.object({
      createdBy: z.string(),
      session: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    }),
  })
  .refine((d) => (d.newBody !== undefined) !== (d.patch !== undefined), {
    message: "exactly one of newBody or patch must be provided",
  })
  .refine((d) => d.patch === undefined || d.proposalType === "update", {
    message: "patch is only valid on update proposals",
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

    let duplicateOf: string | null = null;
    if (parsed.data.newBody !== undefined) {
      const dupInput: Parameters<typeof findDuplicate>[2] = {
        proposalType: parsed.data.proposalType,
        targetType: parsed.data.targetType as NodeType,
        newBody: parsed.data.newBody,
      };
      if (parsed.data.target !== undefined) dupInput.target = parsed.data.target;
      duplicateOf = await findDuplicate(project.path, cfg, dupInput);
    }

    const createInput: Parameters<typeof createWithAutoAccept>[2] = {
      proposalType: parsed.data.proposalType,
      targetType: parsed.data.targetType as NodeType,
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
    if (parsed.data.newBody !== undefined) createInput.newBody = parsed.data.newBody;
    if (parsed.data.patch !== undefined) createInput.patch = parsed.data.patch;

    try {
      // Routed through the auto-accept gate so `autoAcceptConfidenceThreshold`
      // in user prefs is honored on every server-driven propose. The response
      // surfaces `autoAccepted` so the client can render an "auto-accepted"
      // affordance instead of leaving the proposal in pending.
      const created = await createWithAutoAccept(project.path, cfg, createInput);
      const out: Record<string, unknown> = {
        proposalId: created.proposalId,
        path: created.path,
        contentHash: created.contentHash,
        autoAccepted: created.autoAccepted,
      };
      if (created.applied) out.applied = created.applied;
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
