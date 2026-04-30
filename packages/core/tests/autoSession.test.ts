import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateAutoSession } from "../src/autoSession.js";
import { defaultConfig } from "../src/config.js";
import { parseFrontmatter } from "../src/frontmatter.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-as-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
  writeFileSync(
    join(tmp, ".cairndex/specs/SPEC-001-x.md"),
    "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
  );
  writeFileSync(
    join(tmp, ".cairndex/decisions/ADR-005-y.md"),
    "---\nid: ADR-005\ntitle: Y\nstatus: accepted\ncreated: 2026-04-30\n---\n",
  );
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("autoSession", () => {
  it("generates a session file with touches links from a transcript", async () => {
    const result = await generateAutoSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date("2026-04-30T15:30:00Z"),
      touchedPaths: [
        ".cairndex/specs/SPEC-001-x.md",
        ".cairndex/decisions/ADR-005-y.md",
        "src/auth/login.ts",
      ],
      summary: "",
    });
    expect(result.id).toBe("2026-04-30-1530");
    expect(existsSync(result.path)).toBe(true);
    const raw = readFileSync(result.path, "utf8");
    const parsed = parseFrontmatter(raw);
    const fm = parsed.data as {
      id: string;
      date: string;
      links: { type: string; target: string }[];
    };
    expect(fm.id).toBe("2026-04-30-1530");
    expect(fm.date).toBe("2026-04-30");
    expect(fm.links).toContainEqual({ type: "touches", target: "SPEC-001" });
    expect(fm.links).toContainEqual({ type: "touches", target: "ADR-005" });
    expect(parsed.content).toMatch(/SPEC-001/);
  });

  it("avoids overwriting an existing session file by suffixing", async () => {
    const existing = join(tmp, ".cairndex/sessions/2026-04-30-1530.md");
    writeFileSync(
      existing,
      "---\nid: 2026-04-30-1530\ndate: 2026-04-30\nsummary: pre-existing\n---\n",
    );
    const result = await generateAutoSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date("2026-04-30T15:30:00Z"),
      touchedPaths: [],
      summary: "",
    });
    expect(result.path).not.toBe(existing);
    expect(result.path).toMatch(/2026-04-30-1530-1\.md$/);
    expect(readFileSync(existing, "utf8")).toContain("pre-existing");
  });

  it("works with no touched paths (empty links array)", async () => {
    const result = await generateAutoSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date("2026-04-30T15:30:00Z"),
      touchedPaths: [],
      summary: "",
    });
    const raw = readFileSync(result.path, "utf8");
    const fm = parseFrontmatter(raw).data as { links: unknown[] };
    expect(fm.links).toEqual([]);
  });
});
