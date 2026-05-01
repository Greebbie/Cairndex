import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { regenerateRecentChanges } from "../src/indexUpdate.js";

let tmp: string;
const cfg = defaultConfig();

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-index-update-"));
  mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/changes"), { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const INDEX_WITH_MARKERS = `---
phase: discovering
---

# Project Index

**Status:** initialized

## Must-know now

- (Add references as decisions/specs accumulate.)

## Recent changes

<!-- cairndex:recent-changes:start -->
(seed)
<!-- cairndex:recent-changes:end -->

## Read next

- \`.cairndex/rules/operating-rules.md\`
`;

describe("regenerateRecentChanges", () => {
  it("returns false when index.md is missing", async () => {
    const ok = await regenerateRecentChanges(tmp, cfg);
    expect(ok).toBe(false);
    expect(existsSync(join(tmp, ".cairndex/index.md"))).toBe(false);
  });

  it("returns false when index.md has no managed markers", async () => {
    writeFileSync(join(tmp, ".cairndex/index.md"), "# Project Index\n\n(no markers)\n", "utf8");
    const before = readFileSync(join(tmp, ".cairndex/index.md"), "utf8");
    const ok = await regenerateRecentChanges(tmp, cfg);
    const after = readFileSync(join(tmp, ".cairndex/index.md"), "utf8");
    expect(ok).toBe(false);
    expect(after).toBe(before);
  });

  it("rewrites only the content between markers", async () => {
    writeFileSync(join(tmp, ".cairndex/index.md"), INDEX_WITH_MARKERS, "utf8");
    writeFileSync(
      join(tmp, ".cairndex/changes/changelog.md"),
      "# Changelog\n\n- 2026-05-01 — created SPEC-001\n- 2026-04-30 — initialized vault\n",
      "utf8",
    );
    writeFileSync(
      join(tmp, ".cairndex/sessions/2026-05-01-1200.md"),
      "---\nid: 2026-05-01-1200\ndate: 2026-05-01\nsummary: implemented login\n---\n",
      "utf8",
    );

    const ok = await regenerateRecentChanges(tmp, cfg);
    expect(ok).toBe(true);

    const updated = readFileSync(join(tmp, ".cairndex/index.md"), "utf8");
    // user content outside markers is preserved
    expect(updated).toContain("# Project Index");
    expect(updated).toContain("Must-know now");
    expect(updated).toContain("Read next");
    // managed block contains entries
    expect(updated).toContain("<!-- cairndex:recent-changes:start -->");
    expect(updated).toContain("<!-- cairndex:recent-changes:end -->");
    expect(updated).toContain("created SPEC-001");
    expect(updated).toContain("2026-05-01-1200");
    expect(updated).not.toContain("(seed)");
  });

  it("is idempotent when nothing has changed", async () => {
    writeFileSync(join(tmp, ".cairndex/index.md"), INDEX_WITH_MARKERS, "utf8");
    writeFileSync(
      join(tmp, ".cairndex/changes/changelog.md"),
      "# Changelog\n\n- 2026-05-01 — created SPEC-001\n",
      "utf8",
    );

    await regenerateRecentChanges(tmp, cfg);
    const after1 = readFileSync(join(tmp, ".cairndex/index.md"), "utf8");
    const ok2 = await regenerateRecentChanges(tmp, cfg);
    const after2 = readFileSync(join(tmp, ".cairndex/index.md"), "utf8");
    // second call is a no-op (same content) — returns false.
    expect(ok2).toBe(false);
    expect(after2).toBe(after1);
  });
});
