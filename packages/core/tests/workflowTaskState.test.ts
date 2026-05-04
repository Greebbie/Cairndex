import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseFrontmatter } from "../src/frontmatter.js";
import { completeTask, setPhase, switchTask } from "../src/workflow/taskState.js";

describe("workflow/taskState", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function seed(): { repo: string } {
    const repo = mkdtempSync(join(tmpdir(), "cairn-wf-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "tasks"), { recursive: true });
    mkdirSync(join(vault, "changes"), { recursive: true });
    writeFileSync(
      join(vault, "index.md"),
      "---\nphase: implementing\nphase_since: 2026-04-01\nnext_action: 'go'\n---\n# Index\n",
      "utf8",
    );
    return { repo };
  }

  function writeTask(repo: string, id: string, status: string): string {
    const p = join(repo, ".cairndex", "tasks", `${id}.md`);
    writeFileSync(
      p,
      `---\nid: ${id}\ntitle: Task ${id}\nstatus: ${status}\ncreated: 2026-04-01\nupdated: 2026-04-01\n---\nbody\n`,
      "utf8",
    );
    return p;
  }

  function readStatus(path: string): string {
    const raw = readFileSync(path, "utf8");
    const { data } = parseFrontmatter<{ status?: string }>(raw);
    return String(data.status ?? "");
  }

  describe("switchTask", () => {
    it("promotes the target to in_progress and demotes the previous current task", async () => {
      const { repo } = seed();
      const a = writeTask(repo, "TASK-001", "in_progress");
      const b = writeTask(repo, "TASK-002", "pending");
      const r = await switchTask(repo, defaultConfig(), "TASK-002");
      expect(readStatus(a)).toBe("pending");
      expect(readStatus(b)).toBe("in_progress");
      expect(r.changed.map((c) => c.id).sort()).toEqual(["TASK-001", "TASK-002"]);
      expect(r.summary).toMatch(/TASK-002/);
      expect(r.summary).toMatch(/demoted TASK-001/);
    });

    it("works with no prior in_progress task", async () => {
      const { repo } = seed();
      const a = writeTask(repo, "TASK-001", "pending");
      const r = await switchTask(repo, defaultConfig(), "TASK-001");
      expect(readStatus(a)).toBe("in_progress");
      expect(r.summary).toMatch(/^task switch → TASK-001$/);
    });

    it("rejects switching to a done task", async () => {
      const { repo } = seed();
      writeTask(repo, "TASK-001", "done");
      await expect(switchTask(repo, defaultConfig(), "TASK-001")).rejects.toThrow(
        /is done — re-open/,
      );
    });

    it("rejects unknown task ids with a helpful message listing known ones", async () => {
      const { repo } = seed();
      writeTask(repo, "TASK-001", "pending");
      await expect(switchTask(repo, defaultConfig(), "TASK-999")).rejects.toThrow(
        /TASK-999 not found.*TASK-001/,
      );
    });

    it("appends a changelog entry so the activity feed reflects the switch", async () => {
      const { repo } = seed();
      writeTask(repo, "TASK-001", "pending");
      await switchTask(repo, defaultConfig(), "TASK-001");
      const log = readFileSync(join(repo, ".cairndex", "changes", "changelog.md"), "utf8");
      expect(log).toMatch(/task switch → TASK-001/);
    });
  });

  describe("completeTask", () => {
    it("marks the explicit task as done and writes a `completed` date", async () => {
      const { repo } = seed();
      const path = writeTask(repo, "TASK-001", "in_progress");
      await completeTask(repo, defaultConfig(), "TASK-001");
      const raw = readFileSync(path, "utf8");
      const { data } = parseFrontmatter<{ status?: string; completed?: string }>(raw);
      expect(data.status).toBe("done");
      expect(data.completed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("defaults to the active-context current task when no id is given", async () => {
      const { repo } = seed();
      const path = writeTask(repo, "TASK-007", "in_progress");
      await completeTask(repo, defaultConfig());
      expect(readStatus(path)).toBe("done");
    });

    it("errors clearly when there is no current task and no id given", async () => {
      const { repo } = seed();
      await expect(completeTask(repo, defaultConfig())).rejects.toThrow(
        /no current task to complete/,
      );
    });

    it("rejects re-completing a done task", async () => {
      const { repo } = seed();
      writeTask(repo, "TASK-001", "done");
      await expect(completeTask(repo, defaultConfig(), "TASK-001")).rejects.toThrow(/already done/);
    });
  });

  describe("setPhase", () => {
    it("mutates index.md frontmatter and bumps phase_since", async () => {
      const { repo } = seed();
      const r = await setPhase(repo, "testing");
      expect(r.from).toBe("implementing");
      expect(r.to).toBe("testing");
      expect(r.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const raw = readFileSync(join(repo, ".cairndex", "index.md"), "utf8");
      const { data } = parseFrontmatter<{ phase?: string; phase_since?: string }>(raw);
      expect(data.phase).toBe("testing");
      expect(data.phase_since).toBe(r.since);
    });

    it("creates index.md when the vault has no index file yet", async () => {
      const repo = mkdtempSync(join(tmpdir(), "cairn-wf-noindex-"));
      dirs.push(repo);
      mkdirSync(join(repo, ".cairndex"), { recursive: true });
      const r = await setPhase(repo, "discovering");
      expect(r.from).toBeNull();
      expect(r.to).toBe("discovering");
    });

    it("rejects empty phase names", async () => {
      const { repo } = seed();
      await expect(setPhase(repo, "   ")).rejects.toThrow(/non-empty/);
    });
  });
});
