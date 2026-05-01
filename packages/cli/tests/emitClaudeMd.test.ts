import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runEmitClaudeMd } from "../src/commands/emitClaudeMd.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-cli-emit-"));
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
next_action: "Run cairndex doctor"
---

# x
`;

describe("runEmitClaudeMd", () => {
  it("creates CLAUDE.md with the agent-surface region when none exists", async () => {
    setup({ "index.md": baseIndex });
    const r = await runEmitClaudeMd({ cwd: tmp });
    expect(r.exitCode).toBe(0);
    const claudeMdPath = join(tmp, "CLAUDE.md");
    expect(existsSync(claudeMdPath)).toBe(true);
    const content = readFileSync(claudeMdPath, "utf8");
    expect(content).toContain("<!-- cairndex:start v1 -->");
    expect(content).toContain("<!-- cairndex:end -->");
    expect(content).toContain("Phase: implementing");
  });

  it("preserves user content outside the region (idempotent replace)", async () => {
    setup({ "index.md": baseIndex });
    const claudeMdPath = join(tmp, "CLAUDE.md");
    writeFileSync(
      claudeMdPath,
      "# My personal notes\n\nDo this. Do that.\n\n<!-- cairndex:start v1 -->\nold content\n<!-- cairndex:end -->\n\nMore notes.\n",
    );
    await runEmitClaudeMd({ cwd: tmp });
    const content = readFileSync(claudeMdPath, "utf8");
    expect(content).toContain("My personal notes");
    expect(content).toContain("Do this. Do that.");
    expect(content).toContain("More notes.");
    expect(content).toContain("Phase: implementing");
    expect(content).not.toContain("old content");
  });

  it("respects --vault / vaultRoot when provided", async () => {
    setup({ "index.md": baseIndex });
    await runEmitClaudeMd({ cwd: process.cwd(), vaultRoot: tmp });
    expect(existsSync(join(tmp, "CLAUDE.md"))).toBe(true);
  });

  it("returns non-zero when vault is missing", async () => {
    const empty = mkdtempSync(join(tmpdir(), "cairn-cli-empty-"));
    try {
      const r = await runEmitClaudeMd({ cwd: empty });
      expect(r.exitCode).toBe(1);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
