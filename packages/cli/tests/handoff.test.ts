import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHandoffRepair } from "../src/commands/handoff.js";

describe("handoff CLI commands", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function seed(): string {
    const repo = mkdtempSync(join(tmpdir(), "cairn-cli-handoff-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "tasks"), { recursive: true });
    mkdirSync(join(vault, "changes"), { recursive: true });
    writeFileSync(join(vault, "config.yaml"), "schemaVersion: 1\n", "utf8");
    writeFileSync(
      join(vault, "index.md"),
      "---\nphase: implementing\ncurrent_task: TASK-001\n---\n# Index\n",
      "utf8",
    );
    writeFileSync(
      join(vault, "tasks", "TASK-001.md"),
      "---\nid: TASK-001\ntitle: Done\nstatus: done\ncreated: 2026-05-01\nupdated: 2026-05-01\nprovenance:\n  created_by: test\n  session: manual\nverification:\n  run: seeded\n---\nbody\n",
      "utf8",
    );
    return repo;
  }

  it("prints a readable repair summary", async () => {
    const repo = seed();
    const r = await runHandoffRepair({ cwd: repo });
    expect(r.exitCode).toBe(0);
    expect(r.message).toMatch(/handoff repair: blocked -> blocked/);
    expect(r.message).toMatch(/Repair current task pointer/);
    expect(r.message).toMatch(/Rebuild context pack/);
  });
});
