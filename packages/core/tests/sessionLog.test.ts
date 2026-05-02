import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { appendToSession } from "../src/sessionLog.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-session-log-"));
  mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("appendToSession", () => {
  it("creates a session file with all standard sections when none exists", async () => {
    const r = await appendToSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date(Date.UTC(2026, 4, 2, 21, 30)),
      kind: "progress",
      text: "did X using Y",
    });
    expect(r.created).toBe(true);
    expect(r.sessionId).toBe("2026-05-02-2130");
    expect(r.section).toBe("## Progress");
    expect(existsSync(r.path)).toBe(true);

    const raw = readFileSync(r.path, "utf8");
    // Frontmatter
    expect(raw).toContain("id: 2026-05-02-2130");
    // All four standard sections present
    expect(raw).toContain("## Progress");
    expect(raw).toContain("## Verification");
    expect(raw).toContain("## Decisions");
    expect(raw).toContain("## Next");
    // Bullet was appended with timestamp prefix
    expect(raw).toContain("21:30 UTC — did X using Y");
  });

  it("appends to an existing session file without re-creating it", async () => {
    const first = await appendToSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date(Date.UTC(2026, 4, 2, 21, 30)),
      kind: "progress",
      text: "first entry",
    });
    expect(first.created).toBe(true);

    const second = await appendToSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date(Date.UTC(2026, 4, 2, 21, 32)),
      kind: "progress",
      text: "second entry",
    });
    expect(second.created).toBe(false);
    expect(second.path).toBe(first.path);

    const raw = readFileSync(first.path, "utf8");
    expect(raw).toContain("first entry");
    expect(raw).toContain("second entry");
    // Order: first before second
    expect(raw.indexOf("first entry")).toBeLessThan(raw.indexOf("second entry"));
  });

  it("routes different kinds to different sections", async () => {
    const targetPath = (
      await appendToSession({
        repoRoot: tmp,
        cfg: defaultConfig(),
        now: new Date(Date.UTC(2026, 4, 2, 21, 30)),
        kind: "progress",
        text: "p1",
      })
    ).path;
    await appendToSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date(Date.UTC(2026, 4, 2, 21, 31)),
      kind: "verify",
      text: "v1",
    });
    await appendToSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date(Date.UTC(2026, 4, 2, 21, 32)),
      kind: "decision",
      text: "d1",
    });

    const raw = readFileSync(targetPath, "utf8");
    // Each entry under its own section
    const progressIdx = raw.indexOf("## Progress");
    const verifyIdx = raw.indexOf("## Verification");
    const decisionsIdx = raw.indexOf("## Decisions");
    const p1Idx = raw.indexOf("p1");
    const v1Idx = raw.indexOf("v1");
    const d1Idx = raw.indexOf("d1");
    expect(progressIdx).toBeLessThan(p1Idx);
    expect(p1Idx).toBeLessThan(verifyIdx);
    expect(verifyIdx).toBeLessThan(v1Idx);
    expect(v1Idx).toBeLessThan(decisionsIdx);
    expect(decisionsIdx).toBeLessThan(d1Idx);
  });

  it("re-uses the newest session file when multiple exist (date-id sort)", async () => {
    // Pre-seed two session files with different ids.
    writeFileSync(
      join(tmp, ".cairndex/sessions/2026-05-01-0900.md"),
      "---\nid: 2026-05-01-0900\nsummary: older\n---\n## Progress\n",
      "utf8",
    );
    writeFileSync(
      join(tmp, ".cairndex/sessions/2026-05-02-2000.md"),
      "---\nid: 2026-05-02-2000\nsummary: newer\n---\n## Progress\n",
      "utf8",
    );
    const r = await appendToSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date(Date.UTC(2026, 4, 2, 21, 30)),
      kind: "progress",
      text: "appended",
    });
    expect(r.created).toBe(false);
    expect(r.sessionId).toBe("2026-05-02-2000"); // newer one
    const raw = readFileSync(r.path, "utf8");
    expect(raw).toContain("appended");
  });
});
