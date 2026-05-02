import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Config, folderForNodeType } from "../config.js";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.js";
import { formatSequentialId, parseId } from "../ids.js";
import { inboxProposalsPath, nodeFolderPath } from "../paths.js";
import { applyPatch } from "./applyPatch.js";
import { computeProposalHash } from "./hash.js";
import { listProposals } from "./read.js";
import type { CreateProposalInput, FindDuplicateInput, Patch, ProposalFile } from "./types.js";

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

async function findTargetFile(folder: string, id: string): Promise<string | null> {
  if (!existsSync(folder)) return null;
  const entries = await readdir(folder);
  const direct = `${id}.md`;
  if (entries.includes(direct)) return join(folder, direct);
  const match = entries.find((e) => e.startsWith(`${id}-`) && e.endsWith(".md"));
  return match ? join(folder, match) : null;
}

export interface CreateProposalResult {
  proposalId: string;
  path: string;
  contentHash: string;
}

export async function createProposal(
  repoRoot: string,
  cfg: Config,
  input: CreateProposalInput,
): Promise<CreateProposalResult> {
  if (input.proposalType === "update" && !input.target) {
    throw new Error("createProposal: 'update' proposals require a target");
  }
  if (input.proposalType === "create" && !input.newFrontmatter) {
    throw new Error("createProposal: 'create' proposals require newFrontmatter");
  }

  const hasBody = typeof input.newBody === "string";
  const hasPatch = Array.isArray(input.patch) && input.patch.length > 0;
  if (!hasBody && !hasPatch) {
    throw new Error("createProposal: exactly one of newBody or patch must be provided");
  }
  if (hasBody && hasPatch) {
    throw new Error("createProposal: exactly one of newBody or patch must be provided (got both)");
  }
  if (hasPatch && input.proposalType !== "update") {
    throw new Error("createProposal: patch is only valid on update proposals");
  }

  let resolvedNewBody: string;
  let patchToPersist: Patch | undefined;
  if (hasPatch) {
    const folder = nodeFolderPath(repoRoot, folderForNodeType(cfg, input.targetType));
    const targetPath = await findTargetFile(folder, input.target as string);
    if (!targetPath) {
      throw new Error(`createProposal: target ${input.target} not found in ${folder}`);
    }
    const raw = await readFile(targetPath, "utf8");
    const { content } = parseFrontmatter<Record<string, unknown>>(raw);
    resolvedNewBody = applyPatch(content, input.patch as Patch);
    patchToPersist = input.patch as Patch;
  } else {
    resolvedNewBody = input.newBody as string;
  }

  const dir = inboxProposalsPath(repoRoot);
  await mkdir(dir, { recursive: true });

  const proposalId = await nextProposalId(dir);
  const hashInput: FindDuplicateInput = {
    proposalType: input.proposalType,
    targetType: input.targetType,
    newBody: resolvedNewBody,
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
  if (patchToPersist !== undefined) fm.patch = patchToPersist;

  const filePath = join(dir, `${proposalId}.md`);
  await writeFile(filePath, serializeFrontmatter(fm, resolvedNewBody), "utf8");
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
