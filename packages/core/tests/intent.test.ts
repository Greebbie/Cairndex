import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearIntent, intentFilePath, readIntent, writeIntent } from "../src/intent.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-intent-"));
  mkdirSync(join(tmp, ".cairndex"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("intent module", () => {
  it("writes and reads back a 3-step intent", async () => {
    const written = await writeIntent(tmp, {
      text: "audit api.ts; extract inbox hooks; rerun tests",
      taskId: "TASK-007",
      sessionId: "sess-abc",
      now: Date.UTC(2026, 4, 5, 12, 0),
    });
    expect(written.steps).toEqual(["audit api.ts", "extract inbox hooks", "rerun tests"]);
    expect(written.taskId).toBe("TASK-007");
    expect(written.sessionId).toBe("sess-abc");

    const path = intentFilePath(tmp);
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf8");
    expect(raw).toContain("set_at: '2026-05-05T12:00:00.000Z'");
    expect(raw).toContain("task_id: TASK-007");

    const round = await readIntent(tmp);
    expect(round?.steps).toEqual(written.steps);
    expect(round?.taskId).toBe("TASK-007");
    expect(round?.sessionId).toBe("sess-abc");
  });

  it("caps the input at 3 steps and truncates long ones", async () => {
    const longStep = "x".repeat(120);
    const r = await writeIntent(tmp, {
      text: `step1; step2; step3; step4 will be dropped; ${longStep}`,
    });
    expect(r.steps.length).toBe(3);
    expect(r.steps[0]).toBe("step1");
    expect(r.steps[2]).toBe("step3");
  });

  it("clamps a single overlong step to 80 chars (with ellipsis)", async () => {
    const longStep = "y".repeat(120);
    const r = await writeIntent(tmp, { text: longStep });
    expect(r.steps).toHaveLength(1);
    const [step] = r.steps;
    expect(step).toBeDefined();
    expect((step as string).length).toBeLessThanOrEqual(80);
    expect((step as string).endsWith("…")).toBe(true);
  });

  it("falls back to newline split when no semicolon present", async () => {
    const r = await writeIntent(tmp, { text: "a\nb\nc" });
    expect(r.steps).toEqual(["a", "b", "c"]);
  });

  it("readIntent returns null when no intent file exists", async () => {
    expect(await readIntent(tmp)).toBeNull();
  });

  it("clearIntent removes the file and is idempotent", async () => {
    await writeIntent(tmp, { text: "x" });
    expect(existsSync(intentFilePath(tmp))).toBe(true);

    const removed = await clearIntent(tmp);
    expect(removed).toBe(true);
    expect(existsSync(intentFilePath(tmp))).toBe(false);

    // second call: nothing to remove, returns false but does not throw
    expect(await clearIntent(tmp)).toBe(false);
  });

  it("writes atomically — no `.tmp` artifact remains after a successful write", async () => {
    // Atomic write stages to `<file>.tmp` then renames into place. After a clean write
    // the staging file must not be left behind, otherwise repeated writes would litter
    // the state directory and a future watcher pattern that matches `current-intent.md*`
    // would double-fire.
    await writeIntent(tmp, { text: "step1; step2" });
    const stateDir = dirname(intentFilePath(tmp));
    const entries = readdirSync(stateDir);
    expect(entries).toContain("current-intent.md");
    expect(entries.some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("clamps an overlong emoji-bearing step without splitting a surrogate pair", async () => {
    // A step containing an astral-plane character (👍 = U+1F44D, two UTF-16 code units)
    // must not be cut mid-surrogate when truncated. Using `Array.from` for length
    // counting yields code points, so the character either fits whole or is replaced by
    // the ellipsis. Verify the result is well-formed by re-encoding it through Buffer.
    const step = `${"a".repeat(78)}👍extra`; // 78 ASCII + 1 emoji + "extra" = > 80 code points
    const r = await writeIntent(tmp, { text: step });
    const [out] = r.steps;
    expect(out).toBeDefined();
    // No lone high or low surrogate (well-formed UTF-16).
    expect(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out as string),
    ).toBe(false);
    // Code-point length stays at the cap (cap chars including the trailing ellipsis).
    expect(Array.from(out as string).length).toBeLessThanOrEqual(80);
  });
});
