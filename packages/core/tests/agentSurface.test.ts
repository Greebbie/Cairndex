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

describe("renderAgentSurface (Recommended template)", () => {
  it("includes phase/active goal/spec/plan/task and next action", () => {
    const out = renderAgentSurface(baseCtx, baseHealth);
    expect(out).toContain("Phase: implementing");
    expect(out).toContain("Active goal: GOAL-002");
    expect(out).toContain("Active spec: SPEC-003");
    expect(out).toContain("Active plan: PLAN-002");
    expect(out).toMatch(/current.+TASK-007/);
    expect(out).toContain("Current task: TASK-007");
    expect(out).toContain("Next action: Run cairndex doctor --fix on packages/web");
  });

  it("renders memory health on a single line with red/yellow/green counts", () => {
    const out = renderAgentSurface(baseCtx, baseHealth);
    expect(out).toMatch(/Memory health:.*green 12.*yellow 3.*red 1/);
  });

  it("includes the cairndex context command hint", () => {
    const out = renderAgentSurface(baseCtx, baseHealth);
    expect(out).toMatch(/cairndex context/);
  });

  it("includes the inbox proposal note", () => {
    const out = renderAgentSurface(baseCtx, baseHealth);
    expect(out).toMatch(/inbox.*proposed-memory-updates/);
  });

  it("omits empty sections gracefully when active info is missing", () => {
    const minimal: ActiveContext = {
      ...baseCtx,
      activeGoal: null,
      activeSpec: null,
      activePlan: null,
      currentTask: null,
    };
    const out = renderAgentSurface(minimal, baseHealth);
    expect(out).not.toContain("Active goal:");
    expect(out).not.toContain("Active spec:");
    expect(out).not.toContain("Active plan:");
    expect(out).not.toContain("Current task:");
    expect(out).toContain("Phase: implementing");
  });
});
