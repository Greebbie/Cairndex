import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appendChangelog } from "../changelog.js";
import type { Config } from "../config.js";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.js";
import { inboxProposalsPath } from "../paths.js";
import { readProposal } from "./read.js";

export async function rejectProposal(
  repoRoot: string,
  _cfg: Config,
  proposalId: string,
  reason: string,
): Promise<void> {
  const path = join(inboxProposalsPath(repoRoot), `${proposalId}.md`);
  const proposal = await readProposal(path);
  if (!proposal) throw new Error(`proposal ${proposalId} not found at ${path}`);
  if (proposal.status === "accepted") {
    throw new Error(`proposal ${proposalId} is already accepted; cannot reject`);
  }
  const raw = await readFile(path, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  const next: Record<string, unknown> = {
    ...data,
    status: "rejected",
    rejectedAt: new Date().toISOString(),
    rejectionReason: reason,
  };
  await writeFile(path, serializeFrontmatter(next, content), "utf8");
  await appendChangelog(repoRoot, `Rejected ${proposalId}: ${reason}`);
}
