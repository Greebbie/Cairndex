import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appendChangelog } from "../changelog.js";
import { type Config, folderForNodeType, isImmutableType } from "../config.js";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.js";
import { formatSequentialId, parseId } from "../ids.js";
import { inboxProposalsPath, nodeFolderPath } from "../paths.js";
import { applyPatch } from "./applyPatch.js";
import { PREFIX_FOR_TYPE } from "./idPrefix.js";
import { readProposal } from "./read.js";
import type { AcceptResult } from "./types.js";

async function findTargetFile(folder: string, id: string): Promise<string | null> {
  if (!existsSync(folder)) return null;
  const entries = await readdir(folder);
  const direct = `${id}.md`;
  if (entries.includes(direct)) return join(folder, direct);
  // Allow `<id>-<slug>.md`.
  const match = entries.find((e) => e.startsWith(`${id}-`) && e.endsWith(".md"));
  return match ? join(folder, match) : null;
}

async function nextNodeId(folder: string, prefix: string): Promise<string> {
  if (!existsSync(folder)) return formatSequentialId(prefix, 1);
  const entries = await readdir(folder);
  let max = 0;
  for (const e of entries) {
    if (!e.endsWith(".md")) continue;
    const stem = e.replace(/\.md$/, "").split("-").slice(0, 2).join("-");
    const parsed = parseId(stem);
    if (parsed && parsed.prefix === prefix && parsed.number > max) max = parsed.number;
  }
  return formatSequentialId(prefix, max + 1);
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "untitled"
  );
}

async function markAccepted(
  proposalPath: string,
  targetId: string,
  acceptedBy: "user" | "auto",
): Promise<void> {
  const raw = await readFile(proposalPath, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  const next: Record<string, unknown> = {
    ...data,
    status: "accepted",
    acceptedAt: new Date().toISOString(),
    acceptedTarget: targetId,
    acceptedBy,
  };
  await writeFile(proposalPath, serializeFrontmatter(next, content), "utf8");
}

export interface AcceptOptions {
  /**
   * Who triggered the accept — "user" (default, manual review) or "auto"
   * (auto-accept gate fired because the proposal's confidence cleared the
   * user's `autoAcceptConfidenceThreshold` preference). The marker lands on
   * the proposal frontmatter (`acceptedBy:`) and in the changelog line so
   * the timeline / UI can distinguish machine vs human approvals.
   */
  acceptedBy?: "user" | "auto";
}

export async function acceptProposal(
  repoRoot: string,
  cfg: Config,
  proposalId: string,
  options: AcceptOptions = {},
): Promise<AcceptResult> {
  const acceptedBy = options.acceptedBy ?? "user";
  const proposalPath = join(inboxProposalsPath(repoRoot), `${proposalId}.md`);
  const proposal = await readProposal(proposalPath);
  if (!proposal) throw new Error(`proposal ${proposalId} not found at ${proposalPath}`);
  if (proposal.status !== "pending") {
    throw new Error(`proposal ${proposalId} is ${proposal.status}, only pending can be accepted`);
  }

  if (proposal.proposalType === "update" && isImmutableType(cfg, proposal.targetType)) {
    throw new Error(
      `acceptProposal: cannot accept update of immutable type '${proposal.targetType}' (${proposalId}). Immutable types are append-only by convention — create a new ${proposal.targetType} entry that supersedes the old one instead. (Configurable via .cairndex/config.yaml → immutable_types.)`,
    );
  }

  const folder = nodeFolderPath(repoRoot, folderForNodeType(cfg, proposal.targetType));
  // Self-heal: a proposal can target a folder that doesn't exist yet (fresh
  // vault, custom node type). mkdir is idempotent and cheaper than failing
  // the accept and asking the user to re-create the directory by hand.
  await mkdir(folder, { recursive: true });

  if (proposal.proposalType === "update") {
    if (!proposal.target) throw new Error(`proposal ${proposalId} has no target`);
    const targetPath = await findTargetFile(folder, proposal.target);
    if (!targetPath) throw new Error(`target ${proposal.target} not found in ${folder}`);
    const raw = await readFile(targetPath, "utf8");
    const { data, content: currentBody } = parseFrontmatter<Record<string, unknown>>(raw);
    const today = new Date().toISOString().slice(0, 10);
    const nextFm: Record<string, unknown> = {
      ...data,
      ...(proposal.newFrontmatter ?? {}),
      updated: today,
    };
    const nextBody = proposal.patch ? applyPatch(currentBody, proposal.patch) : proposal.newBody;
    await writeFile(targetPath, serializeFrontmatter(nextFm, nextBody), "utf8");
    await markAccepted(proposalPath, proposal.target, acceptedBy);
    const verb = acceptedBy === "auto" ? "Auto-accepted" : "Accepted";
    await appendChangelog(
      repoRoot,
      `${verb} ${proposalId} → updated ${proposal.targetType}/${proposal.target}`,
    );
    return {
      proposalId,
      targetId: proposal.target,
      targetPath,
      action: "updated",
    };
  }

  // proposalType === "create"
  const prefix = PREFIX_FOR_TYPE[proposal.targetType];
  if (!prefix) throw new Error(`no id prefix configured for type ${proposal.targetType}`);
  const newId = await nextNodeId(folder, prefix);
  const fm: Record<string, unknown> = {
    id: newId,
    ...(proposal.newFrontmatter ?? {}),
  };
  if (!fm.created) fm.created = new Date().toISOString().slice(0, 10);
  if (!fm.updated) fm.updated = fm.created;
  // Carry the proposal's provenance forward into the durable node. Without this
  // the audit trail of "who proposed this" gets lost on accept, and the
  // provenance-present validator flags the new node as missing required metadata.
  // Caller-supplied newFrontmatter wins if it explicitly provides provenance.
  if (!fm.provenance) {
    const prov: Record<string, unknown> = {
      created_by: proposal.provenance.createdBy,
      session: proposal.provenance.session,
    };
    if (proposal.provenance.confidence !== undefined) {
      prov.confidence = proposal.provenance.confidence;
    }
    fm.provenance = prov;
  }
  const slug = slugify(String(fm.title ?? newId));
  const filePath = join(folder, `${newId}-${slug}.md`);
  await writeFile(filePath, serializeFrontmatter(fm, proposal.newBody), "utf8");
  await markAccepted(proposalPath, newId, acceptedBy);
  const verb = acceptedBy === "auto" ? "Auto-accepted" : "Accepted";
  await appendChangelog(
    repoRoot,
    `${verb} ${proposalId} → created ${proposal.targetType}/${newId}`,
  );
  return { proposalId, targetId: newId, targetPath: filePath, action: "created" };
}
