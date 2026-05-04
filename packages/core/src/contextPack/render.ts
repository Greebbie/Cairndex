import {
  LEGACY_PROJECT_ID,
  inboxProposalsHint,
  searchVaultHint,
} from "../agentSurface/layoutHints.js";
import { serializeFrontmatter } from "../frontmatter.js";
import type { ContextPackItem, ContextPackOutput } from "./types.js";

function buildFooter(projectId: string): string {
  return `---

If you need more than what's listed here, \`${searchVaultHint(projectId)}\` directly.

Durable memory changes (decisions, specs, insights, plan/task state) should
propose through \`${inboxProposalsHint(projectId)}\` unless the user
explicitly accepts inline.
`;
}

function tokenLine(p: ContextPackOutput): string {
  const pct = Math.min(100, Math.round((p.tokenEstimate / Math.max(1, p.tokenBudget)) * 100));
  const trimmed = p.trimmedItems > 0 ? `; ${p.trimmedItems} items trimmed by budget` : "";
  return `Token estimate: ${p.tokenEstimate} / ${p.tokenBudget} (${pct}%)${trimmed}`;
}

function renderItem(item: ContextPackItem, index: number): string {
  const status = item.status ? ` (${item.status})` : "";
  const lines: string[] = [];
  lines.push(`## ${index}. ${item.id}${status}`);
  if (item.id !== item.title) lines.push(`*${item.title}*`);
  lines.push("");
  lines.push(`> reason: ${item.reason}`);
  if (item.body.trim().length > 0) {
    lines.push("");
    lines.push(item.body.trim());
  }
  return lines.join("\n");
}

function buildFrontmatterData(p: ContextPackOutput) {
  return {
    id: p.packId,
    type: "context-pack",
    task: p.task,
    builtAt: p.builtAt,
    tokenEstimate: p.tokenEstimate,
    tokenBudget: p.tokenBudget,
    trimmedItems: p.trimmedItems,
    items: p.items.map((i) => ({
      id: i.id,
      type: i.type,
      reason: i.reason,
    })),
    warnings: p.warnings,
  };
}

function buildBody(pack: ContextPackOutput, projectId: string): string {
  const sections: string[] = [];
  sections.push(`# Context Pack: ${pack.task}`);
  sections.push("");
  sections.push(tokenLine(pack));
  if (pack.warnings.length > 0) {
    sections.push("");
    sections.push("> Warnings:");
    for (const w of pack.warnings) sections.push(`> - ${w}`);
  }
  sections.push("");
  pack.items.forEach((it, idx) => {
    sections.push(renderItem(it, idx + 1));
    sections.push("");
  });
  sections.push(buildFooter(projectId));
  return sections.join("\n");
}

export function renderContextPack(
  pack: ContextPackOutput,
  projectId: string = LEGACY_PROJECT_ID,
): string {
  return serializeFrontmatter(buildFrontmatterData(pack), buildBody(pack, projectId));
}
