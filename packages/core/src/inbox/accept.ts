import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Config, folderForNodeType } from "../config.js";
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

async function markAccepted(proposalPath: string, targetId: string): Promise<void> {
  const raw = await readFile(proposalPath, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  const next: Record<string, unknown> = {
    ...data,
    status: "accepted",
    acceptedAt: new Date().toISOString(),
    acceptedTarget: targetId,
  };
  await writeFile(proposalPath, serializeFrontmatter(next, content), "utf8");
}

export async function acceptProposal(
  repoRoot: string,
  cfg: Config,
  proposalId: string,
): Promise<AcceptResult> {
  const proposalPath = join(inboxProposalsPath(repoRoot), `${proposalId}.md`);
  const proposal = await readProposal(proposalPath);
  if (!proposal) throw new Error(`proposal ${proposalId} not found at ${proposalPath}`);
  if (proposal.status !== "pending") {
    throw new Error(`proposal ${proposalId} is ${proposal.status}, only pending can be accepted`);
  }

  const folder = nodeFolderPath(repoRoot, folderForNodeType(cfg, proposal.targetType));

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
    await markAccepted(proposalPath, proposal.target);
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
  const slug = slugify(String(fm.title ?? newId));
  const filePath = join(folder, `${newId}-${slug}.md`);
  await writeFile(filePath, serializeFrontmatter(fm, proposal.newBody), "utf8");
  await markAccepted(proposalPath, newId);
  return { proposalId, targetId: newId, targetPath: filePath, action: "created" };
}
