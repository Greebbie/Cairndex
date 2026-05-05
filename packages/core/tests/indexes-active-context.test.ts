import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { buildActiveContext, regenerateActiveContext } from "../src/indexes/activeContext.js";
import { activeContextPath } from "../src/paths.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-ac-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function setup(files: Record<string, string>) {
  for (const [path, body] of Object.entries(files)) {
    const full = join(tmp, ".cairndex", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
}

const baseIndex = `---
phase: implementing
phase_since: 2026-04-30
next_action: "Run cairndex doctor --fix on packages/web"
---

# Project Index
`;

describe("buildActiveContext", () => {
  it("returns phase and next_action from index.md when vault is otherwise empty", async () => {
    setup({ "index.md": baseIndex });
    const ctx = await buildActiveContext(tmp, defaultConfig());
    expect(ctx.phase).toBe("implementing");
    expect(ctx.phaseSince).toBe("2026-04-30");
    expect(ctx.nextAction).toBe("Run cairndex doctor --fix on packages/web");
    expect(ctx.activeGoal).toBeNull();
    expect(ctx.activeSpec).toBeNull();
    expect(ctx.activePlan).toBeNull();
    expect(ctx.currentTask).toBeNull();
    expect(ctx.warnings).toEqual([]);
    expect(ctx.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("falls back to default phase when index.md is missing", async () => {
    setup({});
    const ctx = await buildActiveContext(tmp, defaultConfig());
    expect(ctx.phase).toBe("discovering");
    expect(ctx.phaseSince).toBeNull();
    expect(ctx.nextAction).toBeNull();
  });

  it("picks the active spec/plan/task by status", async () => {
    setup({
      "index.md": baseIndex,
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: Memory Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
      "specs/SPEC-002.md":
        "---\nid: SPEC-002\ntitle: Old\nstatus: superseded\ncreated: 2026-04-01\nupdated: 2026-04-15\n---\n",
      "plans/PLAN-001.md":
        "---\nid: PLAN-001\ntitle: Cockpit Plan\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
      "tasks/TASK-007.md":
        "---\nid: TASK-007\ntitle: Build indexes\nstatus: in_progress\ncreated: 2026-05-02\nupdated: 2026-05-02\n---\n",
    });
    const ctx = await buildActiveContext(tmp, defaultConfig());
    expect(ctx.activeSpec).toEqual({ id: "SPEC-001", title: "Memory Cockpit", status: "active" });
    expect(ctx.activePlan?.id).toBe("PLAN-001");
    expect(ctx.currentTask).toEqual({
      id: "TASK-007",
      title: "Build indexes",
      status: "in_progress",
    });
  });

  it("warns when multiple active specs are found and picks most recently updated", async () => {
    setup({
      "index.md": baseIndex,
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: Older\nstatus: active\ncreated: 2026-04-01\nupdated: 2026-04-15\n---\n",
      "specs/SPEC-003.md":
        "---\nid: SPEC-003\ntitle: Newer\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    const ctx = await buildActiveContext(tmp, defaultConfig());
    expect(ctx.activeSpec?.id).toBe("SPEC-003");
    expect(ctx.warnings.some((w) => w.includes("multiple active spec"))).toBe(true);
  });

  it("prefers in_progress task; falls back to pending", async () => {
    setup({
      "index.md": baseIndex,
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: Older pending\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
      "tasks/TASK-002.md":
        "---\nid: TASK-002\ntitle: In progress\nstatus: in_progress\ncreated: 2026-05-02\nupdated: 2026-05-02\n---\n",
    });
    const ctx = await buildActiveContext(tmp, defaultConfig());
    expect(ctx.currentTask?.id).toBe("TASK-002");
  });

  it("uses the current task next_action as the handoff next action", async () => {
    setup({
      "index.md": baseIndex,
      "tasks/TASK-002.md":
        "---\nid: TASK-002\ntitle: In progress\nstatus: in_progress\nnext_action: Ship the repair flow\ncreated: 2026-05-02\nupdated: 2026-05-02\n---\n",
    });
    const ctx = await buildActiveContext(tmp, defaultConfig());
    expect(ctx.nextAction).toBe("Ship the repair flow");
    expect(ctx.warnings).toContain(
      "index.md next_action differs from TASK-002 next_action; workflow should sync them",
    );
  });

  it("warns when index current_task points at a completed task", async () => {
    setup({
      "index.md": `---
phase: implementing
current_task: TASK-001
---
# Project Index
`,
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: Already done\nstatus: done\ncreated: 2026-05-01\nupdated: 2026-05-02\ncompleted: 2026-05-02\n---\n",
    });
    const ctx = await buildActiveContext(tmp, defaultConfig());
    expect(ctx.currentTask).toBeNull();
    expect(ctx.warnings).toContain(
      "index.md current_task points at TASK-001, but that task is done",
    );
  });
});

describe("regenerateActiveContext", () => {
  it("writes active-context.json and reports changed=true on first write", async () => {
    setup({ "index.md": baseIndex });
    const result = await regenerateActiveContext(tmp, defaultConfig());
    expect(result.changed).toBe(true);
    expect(existsSync(activeContextPath(tmp))).toBe(true);
    const written = JSON.parse(readFileSync(activeContextPath(tmp), "utf8"));
    expect(written.phase).toBe("implementing");
  });

  it("reports changed=false on identical re-run (idempotent)", async () => {
    setup({ "index.md": baseIndex });
    await regenerateActiveContext(tmp, defaultConfig());
    const result = await regenerateActiveContext(tmp, defaultConfig());
    // generatedAt rotates each run, so changed compares all fields except generatedAt.
    expect(result.changed).toBe(false);
  });
});
