import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseFrontmatter } from "../src/frontmatter.js";
import { repairHandoff } from "../src/handoffRepair.js";

describe("handoffRepair", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function seed(): string {
    const repo = mkdtempSync(join(tmpdir(), "cairn-handoff-repair-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "tasks"), { recursive: true });
    mkdirSync(join(vault, "changes"), { recursive: true });
    writeFileSync(join(vault, "config.yaml"), "schemaVersion: 1\n", "utf8");
    writeFileSync(
      join(vault, "index.md"),
      "---\nphase: implementing\nphase_since: 2026-05-01\ncurrent_task: TASK-001\n---\n# Index\n",
      "utf8",
    );
    writeFileSync(
      join(vault, "tasks", "TASK-001.md"),
      "---\nid: TASK-001\ntitle: Old task\nstatus: done\ncreated: 2026-05-01\nupdated: 2026-05-01\nprovenance:\n  created_by: test\n  session: manual\nverification:\n  run: seeded\n---\nbody\n",
      "utf8",
    );
    return repo;
  }

  it("clears stale current_task and rebuilds handoff surfaces", async () => {
    const repo = seed();
    const result = await repairHandoff(repo, defaultConfig());

    expect(result.actions.map((a) => a.id)).toContain("repair-current-task-pointer");
    expect(result.actions.map((a) => a.id)).toContain("rebuild-resume");
    expect(result.actions.map((a) => a.id)).toContain("rebuild-context-pack");
    expect(result.packPath).toBeTruthy();
    expect(existsSync(join(repo, ".cairndex", "state", "resume.json"))).toBe(true);
    expect(existsSync(result.packPath ?? "")).toBe(true);

    const idx = readFileSync(join(repo, ".cairndex", "index.md"), "utf8");
    const { data } = parseFrontmatter<{ current_task?: string }>(idx);
    expect(data.current_task).toBeUndefined();
    expect(
      result.after.checks.some((c) => c.detail.includes("TASK-001, but that task is done")),
    ).toBe(false);
  });

  it("can create a task, switch to it, set next_action, and reach ready", async () => {
    const repo = seed();
    const result = await repairHandoff(repo, defaultConfig(), {
      createTaskTitle: "Implement handoff repair",
      nextAction: "Run full validation",
    });

    expect(result.createdTaskId).toBe("TASK-002");
    expect(result.after.ready).toBe(true);
    const taskRaw = readFileSync(
      join(repo, ".cairndex", "tasks", "TASK-002-implement-handoff-repair.md"),
      "utf8",
    );
    const { data } = parseFrontmatter<{ status?: string; next_action?: string }>(taskRaw);
    expect(data.status).toBe("in_progress");
    expect(data.next_action).toBe("Run full validation");
  });
});
