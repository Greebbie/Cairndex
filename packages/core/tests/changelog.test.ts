import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendChangelog, changelogPath } from "../src/changelog.js";
import { vaultPath } from "../src/paths.js";

describe("appendChangelog", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function repo(): string {
    const d = mkdtempSync(join(tmpdir(), "cairn-changelog-"));
    dirs.push(d);
    return d;
  }

  it("creates the changelog file with a header on first write", async () => {
    const r = repo();
    await appendChangelog(r, "first event", new Date("2026-05-03T00:00:00Z"));
    const path = changelogPath(r);
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf8");
    expect(content).toContain("# Changelog");
    expect(content).toContain("- 2026-05-03 — first event");
  });

  it("appends subsequent entries without rewriting the header", async () => {
    const r = repo();
    await appendChangelog(r, "first", new Date("2026-05-01T00:00:00Z"));
    await appendChangelog(r, "second", new Date("2026-05-02T00:00:00Z"));
    await appendChangelog(r, "third", new Date("2026-05-03T00:00:00Z"));
    const content = readFileSync(changelogPath(r), "utf8");
    // Single header + three entries.
    expect(content.match(/# Changelog/g)?.length).toBe(1);
    expect(content).toContain("- 2026-05-01 — first");
    expect(content).toContain("- 2026-05-02 — second");
    expect(content).toContain("- 2026-05-03 — third");
  });

  it("uses the dashboard-compatible bullet format `- YYYY-MM-DD — <summary>`", async () => {
    const r = repo();
    await appendChangelog(r, "Proposed PROP-007: foo", new Date("2026-05-03T12:34:56Z"));
    const content = readFileSync(changelogPath(r), "utf8");
    // Matches the LINE_RE in packages/server/src/routes/dashboard.ts.
    expect(content).toMatch(/^- 2026-05-03 — Proposed PROP-007: foo$/m);
  });

  it("swallows errors silently — never throws even if the path is invalid", async () => {
    // Pass a path that resolves to a non-writable / nonsense parent. The function
    // should still resolve without rejecting (observability is non-load-bearing).
    await expect(appendChangelog("\0not-a-real-path\0", "x")).resolves.toBeUndefined();
  });

  it("changelogPath is layout-aware (works for both legacy and central via vaultPath)", () => {
    const r = repo();
    // Without a pointer file, vaultPath returns <repo>/.cairndex/, so the changelog
    // lives at <repo>/.cairndex/changes/changelog.md.
    expect(changelogPath(r)).toBe(join(vaultPath(r), "changes", "changelog.md"));
  });
});
