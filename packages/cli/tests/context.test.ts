import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runContext } from "../src/commands/context.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-cli-ctx-"));
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
next_action: "do thing"
---

# Project Index
`;

describe("runContext", () => {
  it("writes a pack file under indexes/context-packs/ and returns its path", async () => {
    setup({
      "index.md": baseIndex,
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nbody\n",
    });
    const r = await runContext({ cwd: tmp, task: "fix web e2e", emitStdout: false });
    expect(r.exitCode).toBe(0);
    expect(r.outputPath).toBeTruthy();
    expect(r.outputPath?.replace(/\\/g, "/")).toContain(".cairndex/indexes/context-packs/");
    if (r.outputPath) expect(existsSync(r.outputPath)).toBe(true);
  });

  it("respects --vault / vaultRoot when provided", async () => {
    setup({ "index.md": baseIndex });
    const r = await runContext({
      cwd: process.cwd(),
      vaultRoot: tmp,
      task: "x",
      emitStdout: false,
    });
    expect(r.exitCode).toBe(0);
    if (r.outputPath) expect(r.outputPath.startsWith(tmp)).toBe(true);
  });

  it("returns the rendered body so callers can pipe to stdout", async () => {
    setup({ "index.md": baseIndex });
    const r = await runContext({ cwd: tmp, task: "x", emitStdout: false });
    expect(r.body).toContain("# Context Pack: x");
    expect(r.body).toContain("PROJECT-STATE");
  });

  it("rejects gracefully when vault is missing", async () => {
    const empty = mkdtempSync(join(tmpdir(), "cairn-cli-empty-"));
    try {
      const r = await runContext({ cwd: empty, task: "x", emitStdout: false });
      expect(r.exitCode).not.toBe(0);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("respects custom budget via opts.budget", async () => {
    setup({
      "index.md": baseIndex,
      "sessions/2026-05-01-1000.md":
        "---\nid: 2026-05-01-1000\ndate: 2026-05-01\nsummary: 'a'\n---\n" + "x".repeat(40_000) + "\n",
    });
    const r = await runContext({ cwd: tmp, task: "x", emitStdout: false, budget: 200 });
    expect(r.exitCode).toBe(0);
    // The session is huge, so under a tiny budget it should be trimmed (priority-1 items still kept).
    expect(r.body).toContain("PROJECT-STATE");
    // Read back the file to confirm trimmedItems metadata was set.
    if (r.outputPath) {
      const written = readFileSync(r.outputPath, "utf8");
      expect(written).toMatch(/trimmedItems:\s+[1-9]/);
    }
  });
});
