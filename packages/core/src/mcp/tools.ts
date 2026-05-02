import { z } from "zod";
import {
  LEGACY_PROJECT_ID,
  inboxProposalsHint,
  projectIdFromRoot,
} from "../agentSurface/layoutHints.js";
import type { Config } from "../config.js";
import { buildContextPack } from "../contextPack/build.js";
import { renderContextPack } from "../contextPack/render.js";
import { createProposal, findDuplicate } from "../inbox/create.js";
import { inferNodeTypeFromId } from "../inbox/idPrefix.js";
import { listProposals } from "../inbox/read.js";
import type { NodeType } from "../types.js";
import type { ListToolsResult, McpToolResult } from "./types.js";

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

const ContextPackArgs = z.object({
  task: z.string().optional(),
  budget: z.number().int().positive().optional(),
});

const PatchOpSchema = z.object({
  kind: z.enum(["append-section", "replace-section"]),
  section: z.string().min(1),
  content: z.string(),
});

const ProposeMemoryUpdateArgs = z
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

const UpdateLivingDocArgs = z.object({
  targetId: z.string().min(1),
  section: z.string().min(1),
  newContent: z.string(),
  mode: z.enum(["replace", "append"]).default("replace"),
  summary: z.string().min(1),
  reason: z.string().default(""),
  provenance: z.object({
    createdBy: z.string(),
    session: z.string(),
    confidence: z.number().min(0).max(1).optional(),
  }),
});

/** Normalize a section identifier — accept "## History" or "History"; emit "## History". */
function normalizeSectionHeading(raw: string): string {
  const trimmed = raw.trim();
  if (/^#{1,6}\s+\S/.test(trimmed)) return trimmed;
  return `## ${trimmed}`;
}

export function listMcpTools(projectId: string = LEGACY_PROJECT_ID): ListToolsResult {
  const inboxHint = inboxProposalsHint(projectId);
  return {
    tools: [
      {
        name: "context_pack",
        description:
          "Build a token-budgeted context pack for the current vault state. Returns the rendered Markdown body. The optional `task` is a label only — it does not affect selection (rules-only).",
        inputSchema: {
          type: "object",
          properties: {
            task: { type: "string", description: "Task label for logging/caching" },
            budget: {
              type: "integer",
              description: "Override token budget (default 8000)",
              minimum: 1,
            },
          },
        },
      },
      {
        name: "propose_memory_update",
        description: `Submit a durable-memory change for human review. Use this instead of writing to ${inboxHint.replace(/\/$/, "")}/* siblings (specs, decisions, plans, ...) directly. The user accepts/rejects via the inbox.`,
        inputSchema: {
          type: "object",
          required: ["proposalType", "targetType", "summary", "provenance"],
          properties: {
            proposalType: { type: "string", enum: ["create", "update"] },
            targetType: { type: "string", enum: [...NODE_TYPE_VALUES] },
            target: {
              type: "string",
              description:
                "Required for proposalType=update — the existing node id (e.g. SPEC-001).",
            },
            newFrontmatter: {
              type: "object",
              description:
                "Required for proposalType=create — the YAML frontmatter for the new node (id is auto-allocated).",
            },
            newBody: {
              type: "string",
              description:
                "Markdown body. Replaces the target's body for update; becomes the new node body for create. Mutually exclusive with `patch`.",
            },
            patch: {
              type: "array",
              description:
                "Section-level edits to apply to an existing target. Only valid for proposalType=update. Mutually exclusive with `newBody`.",
              items: {
                type: "object",
                required: ["kind", "section", "content"],
                properties: {
                  kind: { type: "string", enum: ["append-section", "replace-section"] },
                  section: {
                    type: "string",
                    description:
                      "Full markdown heading line including hashes, e.g. '## History'. Matched by exact trimmed line.",
                  },
                  content: {
                    type: "string",
                    description: "Markdown to insert or use as the section's new body.",
                  },
                },
              },
              minItems: 1,
            },
            summary: { type: "string", description: "One-line description" },
            reason: { type: "string", description: "Why this change is proposed" },
            provenance: {
              type: "object",
              required: ["createdBy", "session"],
              properties: {
                createdBy: { type: "string" },
                session: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
        },
      },
      {
        name: "update_living_doc",
        description: `One-shot helper to propose a section-level edit to an existing living doc. Auto-infers targetType from the id prefix (SPEC-, ADR-, PLAN-, TASK-, INS-, CHG-, GOAL-, INT-, QUESTION-) and submits a patch-mode proposal to ${inboxHint.replace(/\/$/, "")}/. Use this when you want to change a single section without rewriting the whole body. For new nodes or full-body rewrites, use propose_memory_update.`,
        inputSchema: {
          type: "object",
          required: ["targetId", "section", "newContent", "summary", "provenance"],
          properties: {
            targetId: {
              type: "string",
              description:
                "The existing node id (e.g. SPEC-001). Type is inferred from the prefix.",
            },
            section: {
              type: "string",
              description:
                "Heading of the section to edit. May include or omit leading hashes (`## History` or `History` — both work; missing hashes default to level 2).",
            },
            newContent: {
              type: "string",
              description:
                "Markdown content. For mode=replace it becomes the section's new body. For mode=append it is inserted at the end of the section (or as a new section at end of body if missing).",
            },
            mode: {
              type: "string",
              enum: ["replace", "append"],
              description: "How to apply newContent. Defaults to 'replace'.",
            },
            summary: { type: "string", description: "One-line description for the inbox UI." },
            reason: { type: "string", description: "Why this change is proposed." },
            provenance: {
              type: "object",
              required: ["createdBy", "session"],
              properties: {
                createdBy: { type: "string" },
                session: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
        },
      },
      {
        name: "inbox_list",
        description:
          "List pending / accepted / rejected / duplicate proposals in the review inbox.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
}

function ok(text: string): McpToolResult {
  return { content: [{ type: "text", text }] };
}
function err(text: string): McpToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

export async function callMcpTool(
  repoRoot: string,
  cfg: Config,
  name: string,
  args: unknown,
): Promise<McpToolResult> {
  try {
    const projectId = projectIdFromRoot(repoRoot);
    if (name === "context_pack") {
      const parsed = ContextPackArgs.safeParse(args ?? {});
      if (!parsed.success) return err(`bad args: ${parsed.error.message}`);
      const buildInput: Parameters<typeof buildContextPack>[2] = {};
      if (parsed.data.task !== undefined) buildInput.task = parsed.data.task;
      if (parsed.data.budget !== undefined) buildInput.tokenBudget = parsed.data.budget;
      const pack = await buildContextPack(repoRoot, cfg, buildInput);
      return ok(renderContextPack(pack, projectId));
    }

    if (name === "propose_memory_update") {
      const parsed = ProposeMemoryUpdateArgs.safeParse(args ?? {});
      if (!parsed.success) return err(`bad args: ${parsed.error.message}`);
      const input = parsed.data;

      let duplicateOf: string | null = null;
      if (input.newBody !== undefined) {
        const dupInput: Parameters<typeof findDuplicate>[2] = {
          proposalType: input.proposalType,
          targetType: input.targetType as NodeType,
          newBody: input.newBody,
        };
        if (input.target !== undefined) dupInput.target = input.target;
        duplicateOf = await findDuplicate(repoRoot, cfg, dupInput);
      }

      const createInput: Parameters<typeof createProposal>[2] = {
        proposalType: input.proposalType,
        targetType: input.targetType as NodeType,
        summary: input.summary,
        reason: input.reason,
        provenance: {
          createdBy: input.provenance.createdBy,
          session: input.provenance.session,
          ...(input.provenance.confidence !== undefined
            ? { confidence: input.provenance.confidence }
            : {}),
        },
      };
      if (input.target !== undefined) createInput.target = input.target;
      if (input.newFrontmatter !== undefined) createInput.newFrontmatter = input.newFrontmatter;
      if (input.newBody !== undefined) createInput.newBody = input.newBody;
      if (input.patch !== undefined) createInput.patch = input.patch;

      const created = await createProposal(repoRoot, cfg, createInput);
      const resp = {
        proposalId: created.proposalId,
        path: created.path,
        ...(duplicateOf ? { duplicateOf } : {}),
      };
      return ok(JSON.stringify(resp, null, 2));
    }

    if (name === "update_living_doc") {
      const parsed = UpdateLivingDocArgs.safeParse(args ?? {});
      if (!parsed.success) return err(`bad args: ${parsed.error.message}`);
      const input = parsed.data;

      const targetType = inferNodeTypeFromId(input.targetId);
      if (!targetType) {
        return err(
          `cannot infer node type from id ${JSON.stringify(input.targetId)} — expected a sequential id like SPEC-001 or ADR-042`,
        );
      }

      const kind = input.mode === "append" ? "append-section" : "replace-section";
      const section = normalizeSectionHeading(input.section);

      const createInput: Parameters<typeof createProposal>[2] = {
        proposalType: "update",
        targetType,
        target: input.targetId,
        patch: [{ kind, section, content: input.newContent }],
        summary: input.summary,
        reason: input.reason,
        provenance: {
          createdBy: input.provenance.createdBy,
          session: input.provenance.session,
          ...(input.provenance.confidence !== undefined
            ? { confidence: input.provenance.confidence }
            : {}),
        },
      };

      const created = await createProposal(repoRoot, cfg, createInput);
      const resp = {
        proposalId: created.proposalId,
        path: created.path,
        targetType,
        targetId: input.targetId,
        section,
        mode: input.mode,
      };
      return ok(JSON.stringify(resp, null, 2));
    }

    if (name === "inbox_list") {
      const list = await listProposals(repoRoot, cfg);
      return ok(JSON.stringify(list, null, 2));
    }

    return err(`unknown tool: ${name}`);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
