import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runContext } from "../src/commands/context.js";

describe("CLI error messages", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("context returns a layout-agnostic 'no project memory' error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cairn-empty-"));
    dirs.push(dir);
    const r = await runContext({ cwd: dir, emitStdout: false });
    expect(r.exitCode).toBe(1);
    expect(r.message).toMatch(/no project memory/i);
    expect(r.message).toMatch(/cairndex init|project register/);
    expect(r.message).not.toMatch(/^no \.cairndex\//);
  });
});
