import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runIntentClear, runIntentSet, runIntentShow } from "../src/commands/intent.js";

describe("runIntentSet — input validation", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function seedRepo(): string {
    const repo = mkdtempSync(join(tmpdir(), "cairn-intent-cli-"));
    dirs.push(repo);
    mkdirSync(join(repo, ".cairndex"), { recursive: true });
    writeFileSync(join(repo, ".cairndex", "index.md"), "# Index\n", "utf8");
    return repo;
  }

  it("rejects an all-separator input that would produce zero steps", async () => {
    const repo = seedRepo();
    const r = await runIntentSet({ cwd: repo, text: ";;;" });
    expect(r.exitCode).toBe(1);
    expect(r.message).toMatch(/zero steps/i);
    // No file should have been written.
    expect(existsSync(join(repo, ".cairndex", "state", "current-intent.md"))).toBe(false);
  });

  it("rejects whitespace-only input that survives trim() but parses to zero steps", async () => {
    const repo = seedRepo();
    const r = await runIntentSet({ cwd: repo, text: "  ;  ;  " });
    expect(r.exitCode).toBe(1);
    expect(r.message).toMatch(/zero steps/i);
  });

  it("rejects empty input with the trim-based guard", async () => {
    const repo = seedRepo();
    const r = await runIntentSet({ cwd: repo, text: "   " });
    expect(r.exitCode).toBe(1);
    expect(r.message).toMatch(/non-empty/i);
  });

  it("accepts a single non-empty step", async () => {
    const repo = seedRepo();
    const r = await runIntentSet({ cwd: repo, text: "ship the fix", silent: true });
    expect(r.exitCode).toBe(0);
    expect(r.intent?.steps).toEqual(["ship the fix"]);
  });

  it("accepts a normal three-step input and emits the banner", async () => {
    const repo = seedRepo();
    const r = await runIntentSet({
      cwd: repo,
      text: "audit api.ts; extract inbox hooks; rerun tests",
    });
    expect(r.exitCode).toBe(0);
    expect(r.body).toContain("Pre-flight intent");
    expect(r.intent?.steps).toHaveLength(3);
  });

  it("clear is silent and idempotent on a non-existent intent", async () => {
    const repo = seedRepo();
    const r = await runIntentClear({ cwd: repo, silent: true });
    expect(r.exitCode).toBe(0);
  });

  it("show prints `no active intent` when none has been set", async () => {
    const repo = seedRepo();
    const r = await runIntentShow({ cwd: repo });
    expect(r.exitCode).toBe(0);
    expect(r.body).toMatch(/no active intent/i);
  });
});
