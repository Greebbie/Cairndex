import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMemoryHealth, buildResumeView, defaultConfig, renderAgentFlavor } from "@cairndex/core";
import { runEmitClaudeMd } from "../src/commands/emitClaudeMd.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-cli-emit-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Minimal vault scaffold — just the .cairndex/ dir hierarchy. */
function setupVault(files: Record<string, string> = {}) {
  mkdirSync(join(tmp, ".cairndex", "sessions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex", "tasks"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex", "state"), { recursive: true });
  for (const [path, body] of Object.entries(files)) {
    const full = join(tmp, ".cairndex", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
}

describe("runEmitClaudeMd (post-resume swap)", () => {
  it("populates CLAUDE.md region with renderAgentFlavor(buildResumeView()) content", async () => {
    setupVault({
      "sessions/2026-05-05-1000.md":
        "---\nid: 2026-05-05-1000\ndate: 2026-05-05\nsummary: 'did X'\nnarrative_status: confirmed\n---\n",
      "tasks/TASK-007.md":
        "---\nid: TASK-007\ntitle: 'ship'\nstatus: in_progress\ncreated: 2026-05-05\nupdated: 2026-05-05\nnext_action: 'test'\n---\n",
    });

    // Compute expected BEFORE running emitClaudeMd so the vault state is identical
    // (resume-consumption scorer checks for state/resume.json which emitClaudeMd writes).
    const view = await buildResumeView({ cwd: tmp });
    const health = await buildMemoryHealth(tmp, defaultConfig());
    const expected = renderAgentFlavor(view, { health }).trim();

    await runEmitClaudeMd({ cwd: tmp });

    const claudeMd = await readFile(join(tmp, "CLAUDE.md"), "utf8");
    const start = claudeMd.indexOf("<!-- cairndex:start v1 -->");
    const end = claudeMd.indexOf("<!-- cairndex:end -->");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const region = claudeMd
      .slice(start + "<!-- cairndex:start v1 -->".length, end)
      .trim();

    expect(region).toBe(expected);
  });

  it("writes state/resume.json and state/resume.md as a side effect", async () => {
    setupVault();
    await runEmitClaudeMd({ cwd: tmp });
    expect(existsSync(join(tmp, ".cairndex", "state", "resume.json"))).toBe(true);
    expect(existsSync(join(tmp, ".cairndex", "state", "resume.md"))).toBe(true);
  });

  it("creates CLAUDE.md with the cairndex region when none exists", async () => {
    setupVault();
    const r = await runEmitClaudeMd({ cwd: tmp });
    expect(r.exitCode).toBe(0);
    const claudeMdPath = join(tmp, "CLAUDE.md");
    expect(existsSync(claudeMdPath)).toBe(true);
    const content = await readFile(claudeMdPath, "utf8");
    expect(content).toContain("<!-- cairndex:start v1 -->");
    expect(content).toContain("<!-- cairndex:end -->");
    // New flavor: active task or pending memory line is always present
    expect(content).toContain("Pending memory:");
  });

  it("preserves user content outside the region (idempotent replace)", async () => {
    setupVault();
    const claudeMdPath = join(tmp, "CLAUDE.md");
    writeFileSync(
      claudeMdPath,
      "# My personal notes\n\nDo this. Do that.\n\n<!-- cairndex:start v1 -->\nold content\n<!-- cairndex:end -->\n\nMore notes.\n",
    );
    await runEmitClaudeMd({ cwd: tmp });
    const content = await readFile(claudeMdPath, "utf8");
    expect(content).toContain("My personal notes");
    expect(content).toContain("Do this. Do that.");
    expect(content).toContain("More notes.");
    expect(content).not.toContain("old content");
  });

  it("respects --vault / vaultRoot when provided", async () => {
    setupVault();
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
