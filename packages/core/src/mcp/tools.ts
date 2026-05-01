import { z } from "zod";
import type { Config } from "../config.js";
import { buildContextPack } from "../contextPack/build.js";
import { renderContextPack } from "../contextPack/render.js";
import { createProposal, findDuplicate } from "../inbox/create.js";
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

const ProposeMemoryUpdateArgs = z.object({
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

export function listMcpTools(): ListToolsResult {
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
        description:
          "Submit a durable-memory change for human review. Use this instead of writing to .cairndex/specs/* etc. directly. The user accepts/rejects via the inbox.",
        inputSchema: {
          type: "object",
          required: ["proposalType", "targetType", "newBody", "summary", "provenance"],
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
                "Markdown body. Replaces the target's body for update; becomes the new node body for create.",
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
    if (name === "context_pack") {
      const parsed = ContextPackArgs.safeParse(args ?? {});
      if (!parsed.success) return err(`bad args: ${parsed.error.message}`);
      const buildInput: Parameters<typeof buildContextPack>[2] = {};
      if (parsed.data.task !== undefined) buildInput.task = parsed.data.task;
      if (parsed.data.budget !== undefined) buildInput.tokenBudget = parsed.data.budget;
      const pack = await buildContextPack(repoRoot, cfg, buildInput);
      return ok(renderContextPack(pack));
    }

    if (name === "propose_memory_update") {
      const parsed = ProposeMemoryUpdateArgs.safeParse(args ?? {});
      if (!parsed.success) return err(`bad args: ${parsed.error.message}`);
      const input = parsed.data;
      const dupInput: Parameters<typeof findDuplicate>[2] = {
        proposalType: input.proposalType,
        targetType: input.targetType as NodeType,
        newBody: input.newBody,
      };
      if (input.target !== undefined) dupInput.target = input.target;
      const duplicateOf = await findDuplicate(repoRoot, cfg, dupInput);

      const createInput: Parameters<typeof createProposal>[2] = {
        proposalType: input.proposalType,
        targetType: input.targetType as NodeType,
        newBody: input.newBody,
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
      const created = await createProposal(repoRoot, cfg, createInput);
      const resp = {
        proposalId: created.proposalId,
        path: created.path,
        ...(duplicateOf ? { duplicateOf } : {}),
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
