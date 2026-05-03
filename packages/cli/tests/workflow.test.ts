import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPhaseSet, runTaskComplete, runTaskSwitch } from "../src/commands/workflow.js";

describe("workflow CLI commands", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function seed(): string {
    const repo = mkdtempSync(join(tmpdir(), "cairn-cli-wf-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "tasks"), { recursive: true });
    mkdirSync(join(vault, "changes"), { recursive: true });
    writeFileSync(
      join(vault, "index.md"),
      "---\nphase: implementing\nphase_since: 2026-04-01\n---\n# Index\n",
      "utf8",
    );
    return repo;
  }

  function writeTask(repo: string, id: string, status: string): void {
    writeFileSync(
      join(repo, ".cairndex", "tasks", `${id}.md`),
      `---\nid: ${id}\ntitle: Task ${id}\nstatus: ${status}\ncreated: 2026-04-01\nupdated: 2026-04-01\n---\nbody\n`,
      "utf8",
    );
  }

  it("task switch returns 0 and reports the status transition", async () => {
    const repo = seed();
    writeTask(repo, "TASK-001", "in_progress");
    writeTask(repo, "TASK-002", "pending");
    const r = await runTaskSwitch({ cwd: repo, taskId: "TASK-002" });
    expect(r.exitCode).toBe(0);
    expect(r.message).toMatch(/task switch → TASK-002/);
    expect(r.message).toMatch(/TASK-002.*pending → in_progress/);
    expect(r.message).toMatch(/TASK-001.*in_progress → pending/);
  });

  it("task switch returns 1 with a clear message for an unknown id", async () => {
    const repo = seed();
    writeTask(repo, "TASK-001", "pending");
    const r = await runTaskSwitch({ cwd: repo, taskId: "TASK-999" });
    expect(r.exitCode).toBe(1);
    expect(r.message).toMatch(/TASK-999 not found/);
  });

  it("task complete with no id falls back to the active context current task", async () => {
    const repo = seed();
    writeTask(repo, "TASK-007", "in_progress");
    const r = await runTaskComplete({ cwd: repo });
    expect(r.exitCode).toBe(0);
    expect(r.message).toMatch(/TASK-007/);
    const raw = readFileSync(join(repo, ".cairndex", "tasks", "TASK-007.md"), "utf8");
    expect(raw).toMatch(/status: done/);
    expect(raw).toMatch(/completed:/);
  });

  it("task complete with no current task and no id returns 1 with a clear message", async () => {
    const repo = seed();
    const r = await runTaskComplete({ cwd: repo });
    expect(r.exitCode).toBe(1);
    expect(r.message).toMatch(/no current task to complete/);
  });

  it("phase set updates index.md and reports from→to", async () => {
    const repo = seed();
    const r = await runPhaseSet({ cwd: repo, phase: "testing" });
    expect(r.exitCode).toBe(0);
    expect(r.message).toMatch(/phase → testing \(was implementing\)/);
    const raw = readFileSync(join(repo, ".cairndex", "index.md"), "utf8");
    expect(raw).toMatch(/phase: testing/);
  });

  it("phase set rejects empty names with exit 1", async () => {
    const repo = seed();
    const r = await runPhaseSet({ cwd: repo, phase: "  " });
    expect(r.exitCode).toBe(1);
    expect(r.message).toMatch(/non-empty/);
  });

  it("missing vault returns 1 with a guidance message", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-cli-wf-empty-"));
    dirs.push(repo);
    const r = await runTaskSwitch({ cwd: repo, taskId: "TASK-001" });
    expect(r.exitCode).toBe(1);
    expect(r.message).toBeDefined();
  });
});
