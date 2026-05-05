import {
  readLastSession,
  readActiveTask,
  readWhyContext,
  readSuggestedNext,
  readPendingMemory,
} from "./readers.js";
import type { ResumeView } from "./types.js";
import { scoreAllStoryCoverage } from "../health/storyCoverage.js";

export interface BuildResumeViewOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  /** Defaults to new Date() — provide a fixed value for testability of ageDays / builtAt. */
  today?: Date;
}

export async function buildResumeView(opts: BuildResumeViewOptions): Promise<ResumeView> {
  const today = opts.today ?? new Date();
  const sources: string[] = [];
  // Build baseOpts with conditional spreads so undefined optionals stay ABSENT
  // (required by exactOptionalPropertyTypes: true in this repo).
  const baseOpts = {
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
    sources,
  };

  const lastSession = await readLastSession(baseOpts);
  const activeTask = await readActiveTask({ ...baseOpts, today });
  const whyContext = activeTask
    ? await readWhyContext({ ...baseOpts, taskId: activeTask.id })
    : null;
  const suggestedNext = await readSuggestedNext(baseOpts, activeTask ?? undefined);
  const pendingMemory = await readPendingMemory(baseOpts);

  const coverageIndicators = await scoreAllStoryCoverage({
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
    today,
  });
  const coverageFlags = coverageIndicators
    .filter((i) => i.level !== "green")
    .map((i) => i.name);

  return {
    lastSession,
    activeTask,
    whyContext,
    suggestedNext,
    pendingMemory,
    coverageFlags,
    builtAt: today.toISOString(),
    sources,
  };
}
