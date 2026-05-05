import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appendChangelog } from "../changelog.js";
import { computeProposalHash } from "../inbox/hash.js";
import { formatSequentialId, parseId } from "../ids.js";
import { signalsPath } from "../paths.js";
import { serializeFrontmatter } from "../frontmatter.js";
import type { CreateSignalInput, CreateSignalResult } from "./types.js";

const SIGNAL_PREFIX = "SIG";

async function listSignalIds(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const ids: string[] = [];
  for (const e of entries) {
    if (!e.endsWith(".md")) continue;
    const stem = e.replace(/\.md$/, "");
    const parsed = parseId(stem);
    if (parsed && parsed.prefix === SIGNAL_PREFIX) ids.push(parsed.raw);
  }
  return ids;
}

/**
 * Compute the next SIG-NNN id by scanning the signals/ directory for existing
 * SIG-* files. Mirrors `nextProposalId()` in `inbox/create.ts`.
 */
export async function nextSignalId(repoRoot: string): Promise<string> {
  const dir = signalsPath(repoRoot);
  const existing = await listSignalIds(dir);
  let max = 0;
  for (const id of existing) {
    const p = parseId(id);
    if (p && p.prefix === SIGNAL_PREFIX && p.number > max) max = p.number;
  }
  return formatSequentialId(SIGNAL_PREFIX, max + 1);
}

/**
 * Write an automated-heuristic signal file to `signals/SIG-NNN.md`.
 *
 * Signals are distinct from inbox proposals:
 *   - No proposal lifecycle (no status / proposalType).
 *   - No auto-accept path — human review is always required.
 *   - Identified by SIG-NNN, not PROP-NNN.
 *   - Source field (`auto-distill` | `auto-consolidate`) replaces `proposalType`.
 *
 * The `newFrontmatter` field is preserved as a seed for the future
 * `cairndex signal promote` command, which will turn this into an inbox
 * proposal draft for human review.
 */
export async function createSignal(
  repoRoot: string,
  input: CreateSignalInput,
): Promise<CreateSignalResult> {
  const dir = signalsPath(repoRoot);
  await mkdir(dir, { recursive: true });

  const signalId = await nextSignalId(repoRoot);
  const contentHash = computeProposalHash({
    proposalType: "create",
    targetType: input.targetType,
    newBody: input.newBody,
  });
  const created = new Date().toISOString();

  const fm: Record<string, unknown> = {
    id: signalId,
    source: input.source,
    targetType: input.targetType,
    summary: input.summary,
    reason: input.reason,
    contentHash,
    created,
    provenance: {
      created_by: input.source,
      session: input.provenance.session,
      ...(input.provenance.confidence !== undefined
        ? { confidence: input.provenance.confidence }
        : {}),
    },
  };
  if (input.newFrontmatter !== undefined) fm.newFrontmatter = input.newFrontmatter;

  const filePath = join(dir, `${signalId}.md`);
  await writeFile(filePath, serializeFrontmatter(fm, input.newBody), "utf8");

  // Non-load-bearing activity entry. Failure here does not prevent the signal
  // from being written.
  await appendChangelog(
    repoRoot,
    `Signal ${signalId} emitted (${input.source} → ${input.targetType}): ${input.summary}`,
  );

  return { signalId, path: filePath, contentHash };
}
