import type { Config } from "../config.js";
import { type ActiveContext, regenerateActiveContext } from "./activeContext.js";
import { type BacklinksSnapshot, regenerateBacklinksSnapshot } from "./backlinksSnapshot.js";
import { type ImplementationLine, regenerateImplementationLine } from "./implementationLine.js";
import { type MemoryHealth, regenerateMemoryHealth } from "./memoryHealth.js";
import { type NodeSummary, regenerateNodeSummary } from "./nodeSummary.js";

export interface RegenerateAllResult {
  changed: {
    activeContext: boolean;
    nodeSummary: boolean;
    memoryHealth: boolean;
    backlinks: boolean;
    implementationLine: boolean;
  };
  data: {
    activeContext: ActiveContext;
    nodeSummary: NodeSummary;
    memoryHealth: MemoryHealth;
    backlinks: BacklinksSnapshot;
    implementationLine: ImplementationLine;
  };
  anyChanged: boolean;
}

/** Single entry point for refreshing every derived file under <projectRoot>/indexes/.
 *  Watcher and CLI commands both call this. Each sub-regenerator is idempotent — only writes
 *  when the (non-`generatedAt`) content actually changed. */
export async function regenerateAllIndexes(
  repoRoot: string,
  cfg: Config,
): Promise<RegenerateAllResult> {
  const ac = await regenerateActiveContext(repoRoot, cfg);
  const ns = await regenerateNodeSummary(repoRoot, cfg);
  const mh = await regenerateMemoryHealth(repoRoot, cfg);
  const bl = await regenerateBacklinksSnapshot(repoRoot, cfg);
  const il = await regenerateImplementationLine(repoRoot, cfg);
  return {
    changed: {
      activeContext: ac.changed,
      nodeSummary: ns.changed,
      memoryHealth: mh.changed,
      backlinks: bl.changed,
      implementationLine: il.changed,
    },
    data: {
      activeContext: ac.ctx,
      nodeSummary: ns.summary,
      memoryHealth: mh.health,
      backlinks: bl.snapshot,
      implementationLine: il.line,
    },
    anyChanged: ac.changed || ns.changed || mh.changed || bl.changed || il.changed,
  };
}
