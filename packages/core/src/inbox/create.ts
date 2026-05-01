import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "../config.js";
import { serializeFrontmatter } from "../frontmatter.js";
import { formatSequentialId, parseId } from "../ids.js";
import { inboxProposalsPath } from "../paths.js";
import { computeProposalHash } from "./hash.js";
import { listProposals } from "./read.js";
import type { CreateProposalInput, FindDuplicateInput, ProposalFile } from "./types.js";

const PROPOSAL_PREFIX = "PROP";

async function listProposalIds(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const ids: string[] = [];
  for (const e of entries) {
    if (!e.endsWith(".md")) continue;
    const stem = e.replace(/\.md$/, "");
    const parsed = parseId(stem);
    if (parsed && parsed.prefix === PROPOSAL_PREFIX) ids.push(parsed.raw);
  }
  return ids;
}

async function nextProposalId(dir: string): Promise<string> {
  const existing = await listProposalIds(dir);
  let max = 0;
  for (const id of existing) {
    const p = parseId(id);
    if (p && p.prefix === PROPOSAL_PREFIX && p.number > max) max = p.number;
  }
  return formatSequentialId(PROPOSAL_PREFIX, max + 1);
}

export interface CreateProposalResult {
  proposalId: string;
  path: string;
  contentHash: string;
}

export async function createProposal(
  repoRoot: string,
  _cfg: Config,
  input: CreateProposalInput,
): Promise<CreateProposalResult> {
  if (input.proposalType === "update" && !input.target) {
    throw new Error("createProposal: 'update' proposals require a target");
  }
  if (input.proposalType === "create" && !input.newFrontmatter) {
    throw new Error("createProposal: 'create' proposals require newFrontmatter");
  }

  const dir = inboxProposalsPath(repoRoot);
  await mkdir(dir, { recursive: true });

  const proposalId = await nextProposalId(dir);
  const hashInput: FindDuplicateInput = {
    proposalType: input.proposalType,
    targetType: input.targetType,
    newBody: input.newBody,
  };
  if (input.target !== undefined) hashInput.target = input.target;
  const contentHash = computeProposalHash(hashInput);
  const created = new Date().toISOString();

  const fm: Record<string, unknown> = {
    id: proposalId,
    proposalType: input.proposalType,
    targetType: input.targetType,
    status: "pending",
    summary: input.summary,
    reason: input.reason,
    contentHash,
    created,
    provenance: {
      created_by: input.provenance.createdBy,
      session: input.provenance.session,
      ...(input.provenance.confidence !== undefined
        ? { confidence: input.provenance.confidence }
        : {}),
    },
  };
  if (input.target !== undefined) fm.target = input.target;
  if (input.newFrontmatter !== undefined) fm.newFrontmatter = input.newFrontmatter;

  const filePath = join(dir, `${proposalId}.md`);
  await writeFile(filePath, serializeFrontmatter(fm, input.newBody), "utf8");
  return { proposalId, path: filePath, contentHash };
}

export async function findDuplicate(
  repoRoot: string,
  _cfg: Config,
  input: FindDuplicateInput,
): Promise<string | null> {
  const target = computeProposalHash(input);
  const all = await listProposals(repoRoot, _cfg);
  const candidates: ProposalFile[] = [...all.pending, ...all.accepted];
  for (const p of candidates) {
    if (p.contentHash === target) return p.proposalId;
  }
  return null;
}
