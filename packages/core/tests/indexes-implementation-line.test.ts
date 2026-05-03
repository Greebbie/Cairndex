import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  buildImplementationLine,
  implementationLinePath,
  regenerateImplementationLine,
} from "../src/indexes/implementationLine.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-impl-"));
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

describe("buildImplementationLine", () => {
  it("returns an empty line when the vault has no tasks", async () => {
    setup({});
    const line = await buildImplementationLine(tmp, defaultConfig());
    expect(line.entries).toEqual([]);
    expect(line.byPlan).toEqual({});
    expect(line.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("orders entries: done (newest completed first) → in_progress → pending → others", async () => {
    setup({
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: Old ship\nstatus: done\ncreated: 2026-04-01\nupdated: 2026-04-15\ncompleted: '2026-04-15'\n---\n",
      "tasks/TASK-002.md":
        "---\nid: TASK-002\ntitle: New ship\nstatus: done\ncreated: 2026-05-01\nupdated: 2026-05-02\ncompleted: '2026-05-02'\n---\n",
      "tasks/TASK-003.md":
        "---\nid: TASK-003\ntitle: Working on this\nstatus: in_progress\ncreated: 2026-05-01\nupdated: 2026-05-02\n---\n",
      "tasks/TASK-004.md":
        "---\nid: TASK-004\ntitle: Pending one\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
      "tasks/TASK-005.md":
        "---\nid: TASK-005\ntitle: Other status\nstatus: blocked\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    const line = await buildImplementationLine(tmp, defaultConfig());
    expect(line.entries.map((e) => e.taskId)).toEqual([
      "TASK-002", // done, newest completed
      "TASK-001", // done, older completed
      "TASK-003", // in_progress
      "TASK-004", // pending
      "TASK-005", // blocked (sorts after pending)
    ]);
  });

  it("extracts the planId from the first PLAN-* link (object-style)", async () => {
    setup({
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: Linked\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\nlinks:\n  - type: implements\n    target: PLAN-001\n  - type: related\n    target: SPEC-002\n---\n",
    });
    const line = await buildImplementationLine(tmp, defaultConfig());
    expect(line.entries[0]?.planId).toBe("PLAN-001");
    expect(line.byPlan["PLAN-001"]).toEqual(["TASK-001"]);
  });

  it("extracts the planId from string-style links (`links: [PLAN-001]`)", async () => {
    setup({
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: Linked\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\nlinks:\n  - PLAN-001\n  - ADR-002\n---\n",
    });
    const line = await buildImplementationLine(tmp, defaultConfig());
    expect(line.entries[0]?.planId).toBe("PLAN-001");
  });

  it("groups unlinked tasks under the literal '(unlinked)' bucket", async () => {
    setup({
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: Has plan\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\nlinks:\n  - PLAN-001\n---\n",
      "tasks/TASK-002.md":
        "---\nid: TASK-002\ntitle: No plan\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    const line = await buildImplementationLine(tmp, defaultConfig());
    expect(line.byPlan["PLAN-001"]).toEqual(["TASK-001"]);
    expect(line.byPlan["(unlinked)"]).toEqual(["TASK-002"]);
  });

  it("captures sessionId from provenance.session", async () => {
    setup({
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: T\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\nprovenance:\n  created_by: claude-code\n  session: 2026-05-01-1230\n---\n",
    });
    const line = await buildImplementationLine(tmp, defaultConfig());
    expect(line.entries[0]?.sessionId).toBe("2026-05-01-1230");
  });
});

describe("regenerateImplementationLine", () => {
  it("writes the index file under indexes/implementation-line.json", async () => {
    setup({
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: T\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    const r = await regenerateImplementationLine(tmp, defaultConfig());
    expect(r.changed).toBe(true);
    expect(existsSync(implementationLinePath(tmp))).toBe(true);
    const written = JSON.parse(readFileSync(implementationLinePath(tmp), "utf8"));
    expect(written.entries).toHaveLength(1);
    expect(written.entries[0].taskId).toBe("TASK-001");
  });

  it("is idempotent — second call with no changes does not rewrite", async () => {
    setup({
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: T\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    await regenerateImplementationLine(tmp, defaultConfig());
    const second = await regenerateImplementationLine(tmp, defaultConfig());
    expect(second.changed).toBe(false);
  });

  it("detects content changes (new task added) and rewrites", async () => {
    setup({
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: T\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    await regenerateImplementationLine(tmp, defaultConfig());
    setup({
      "tasks/TASK-002.md":
        "---\nid: TASK-002\ntitle: U\nstatus: pending\ncreated: 2026-05-02\nupdated: 2026-05-02\n---\n",
    });
    const r = await regenerateImplementationLine(tmp, defaultConfig());
    expect(r.changed).toBe(true);
    expect(r.line.entries.map((e) => e.taskId).sort()).toEqual(["TASK-001", "TASK-002"]);
  });
});
