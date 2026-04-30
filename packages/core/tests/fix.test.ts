import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseFrontmatter } from "../src/frontmatter.js";
import { applyAutoFixes } from "../src/validate/fix.js";
import { runValidation } from "../src/validate/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-fix-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("auto-fix", () => {
  it("normalizes non-kebab-case tags on disk", async () => {
    const f = join(tmp, ".cairndex/specs/SPEC-001-x.md");
    writeFileSync(
      f,
      '---\nid: SPEC-001\ntitle: X\nstatus: active\ntags: ["Foo Bar", "BAZ"]\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n',
    );
    const issues = await runValidation(tmp, defaultConfig());
    const r = await applyAutoFixes(tmp, defaultConfig(), issues);
    expect(r.fixed.some((i) => i.rule === "tag-format")).toBe(true);
    const after = parseFrontmatter(readFileSync(f, "utf8")).data as { tags: string[] };
    expect(after.tags).toEqual(["foo-bar", "baz"]);
  });

  it("adds reciprocal superseded_by link to target ADR", async () => {
    writeFileSync(
      join(tmp, ".cairndex/decisions/ADR-001-old.md"),
      "---\nid: ADR-001\ntitle: Old\nstatus: superseded\ncreated: 2026-04-01\n---\n",
    );
    writeFileSync(
      join(tmp, ".cairndex/decisions/ADR-002-new.md"),
      "---\nid: ADR-002\ntitle: New\nstatus: accepted\ncreated: 2026-04-30\nlinks:\n  - { type: supersedes, target: ADR-001 }\n---\n",
    );
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "bidirectional")).toBe(true);
    await applyAutoFixes(tmp, defaultConfig(), issues);
    const after = parseFrontmatter(
      readFileSync(join(tmp, ".cairndex/decisions/ADR-001-old.md"), "utf8"),
    ).data as { links: { type: string; target: string }[] };
    expect(after.links).toContainEqual({ type: "superseded_by", target: "ADR-002" });
  });

  it("returns separate lists of fixed and unfixed issues", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: done\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    // missing verification — not fixable
    const issues = await runValidation(tmp, defaultConfig());
    const r = await applyAutoFixes(tmp, defaultConfig(), issues);
    expect(r.unfixed.some((i) => i.rule === "verification-bound")).toBe(true);
    expect(r.fixed.find((i) => i.rule === "verification-bound")).toBeUndefined();
  });
});
