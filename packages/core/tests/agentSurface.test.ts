/**
 * Tests for the legacy `renderAgentSurface` function.
 *
 * Most tests that asserted the OLD output shape have been RETIRED as of Task 2.7 (2026-05):
 *
 * - "includes phase/active goal/spec/plan/task and next action" — RETIRED.
 *   `renderAgentSurface` is @deprecated. The new agent-surface output comes from
 *   `renderAgentFlavor(buildResumeView())` which is task-centric, not phase/goal-centric.
 *
 * - "renders memory health on a single line with red/yellow/green counts" — RETIRED.
 *   Memory health counts are not in the new agent flavor. They will return in Phase 5
 *   (story coverage), not as a line from `renderAgentSurface`.
 *
 * - "includes the inbox proposal note" / "uses .cairndex-relative inbox path" /
 *   "uses project-relative inbox path when given a central project id" — RETIRED.
 *   The inbox-proposal hint is not in `renderAgentFlavor`. Durable-write guidance is
 *   provided by the minimal operating contract block in `renderAgentFlavor`.
 *
 * - "omits empty sections gracefully when active info is missing" — RETIRED.
 *   `renderAgentSurface` is @deprecated; this behaviour is no longer a regression target.
 *
 * Remaining tests cover invariants that are still relied on by the two surviving callers
 * (`bootstrap.ts` and `watcherActions.ts`) until those are migrated.
 */
import { describe, expect, it } from "vitest";
import { renderAgentSurface } from "../src/agentSurface/template.js";
import type { ActiveContext } from "../src/indexes/activeContext.js";
import type { MemoryHealth } from "../src/indexes/memoryHealth.js";

const baseCtx: ActiveContext = {
  phase: "implementing",
  phaseSince: "2026-04-30",
  activeGoal: { id: "GOAL-002", title: "Memory cockpit MVP", status: "active" },
  activeSpec: { id: "SPEC-003", title: "Memory cockpit", status: "active" },
  activePlan: {
    id: "PLAN-002",
    title: "Cockpit plan",
    status: "active",
    currentTaskId: "TASK-007",
  },
  currentTask: { id: "TASK-007", title: "Fix web e2e", status: "in_progress" },
  nextAction: "Run cairndex doctor --fix on packages/web",
  warnings: [],
  generatedAt: "2026-05-02T01:00:00.000Z",
};

const baseHealth: MemoryHealth = {
  generatedAt: "2026-05-02T01:00:00.000Z",
  counts: { red: 1, yellow: 3, green: 12 },
  issues: [],
};

describe("renderAgentSurface (legacy — @deprecated)", () => {
  // Survival invariant: bootstrap.ts and watcherActions.ts still call this.
  // These tests prevent silent regressions until those callers are migrated.
  it("returns a non-empty string for a fully-populated context", () => {
    const out = renderAgentSurface(baseCtx, baseHealth);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("includes the cairndex context command hint (relied on by surviving callers)", () => {
    const out = renderAgentSurface(baseCtx, baseHealth);
    expect(out).toMatch(/cairndex context/);
  });
});
