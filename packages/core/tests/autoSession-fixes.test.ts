import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateAutoSession, parseTranscriptJsonl } from "../src/autoSession.js";
import { changelogPath } from "../src/changelog.js";
import { defaultConfig } from "../src/config.js";

/**
 * Phase H regressions:
 *   - H2: PROP-NNN ids must NOT appear in session links.touches (they live in
 *         inbox/, not in any durable folder, so the validator can't resolve them).
 *   - H3: When two auto-sessions land in the same minute, the FILENAME and the
 *         frontmatter `id` field must agree — both must include the disambiguating
 *         suffix. Previously only the filename got `-1` and the id collided.
 *   - H1: generateAutoSession must append a `Session <id> recorded` entry to
 *         <vault>/changes/changelog.md so the Dashboard's Recent Activity card sees it.
 */
describe("generateAutoSession — Phase H fixes", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function repo(): string {
    const d = mkdtempSync(join(tmpdir(), "cairn-autosess-"));
    dirs.push(d);
    return d;
  }

  it("H2: PROP-NNN ids referenced in touchedPaths are NOT linked as touches", async () => {
    const r = repo();
    const result = await generateAutoSession({
      repoRoot: r,
      cfg: defaultConfig(),
      now: new Date("2026-05-03T12:00:00Z"),
      touchedPaths: [
        ".cairndex/inbox/proposed-memory-updates/PROP-001.md",
        ".cairndex/specs/SPEC-001.md",
      ],
    });
    const content = readFileSync(result.path, "utf8");
    // Critical assertion: `target: PROP-001` must NOT appear ANYWHERE in the
    // serialized session — that's the form the reference-integrity validator scans.
    expect(content).not.toMatch(/target: PROP-001/);
    // SPEC-001 should still show up as a touches target (it's a durable node).
    expect(content).toMatch(/target: SPEC-001/);
    // The PROP file path is fine in the "Files touched" prose list — only the
    // structured frontmatter link is what the validator complains about.
    expect(content).toContain("PROP-001.md");
  });

  it("H3: two sessions in the same minute get unique frontmatter ids (suffix matches filename)", async () => {
    const r = repo();
    const sameMinute = new Date("2026-05-03T15:30:00Z");

    const first = await generateAutoSession({
      repoRoot: r,
      cfg: defaultConfig(),
      now: sameMinute,
      touchedPaths: [],
    });
    const second = await generateAutoSession({
      repoRoot: r,
      cfg: defaultConfig(),
      now: sameMinute,
      touchedPaths: [],
    });

    expect(first.id).toBe("2026-05-03-1530");
    expect(second.id).toBe("2026-05-03-1530-1");
    expect(first.id).not.toBe(second.id);

    // Frontmatter id field must match the filename's id.
    const firstContent = readFileSync(first.path, "utf8");
    const secondContent = readFileSync(second.path, "utf8");
    expect(firstContent).toMatch(/^id: 2026-05-03-1530$/m);
    expect(secondContent).toMatch(/^id: 2026-05-03-1530-1$/m);

    // Both files distinct on disk.
    expect(first.path).not.toBe(second.path);
    expect(existsSync(first.path)).toBe(true);
    expect(existsSync(second.path)).toBe(true);
  });

  it("H1: writing a session appends a `Session <id> recorded` line to the changelog", async () => {
    const r = repo();
    const result = await generateAutoSession({
      repoRoot: r,
      cfg: defaultConfig(),
      now: new Date("2026-05-03T09:15:00Z"),
      touchedPaths: ["a.ts", "b.ts"],
      toolCounts: { Edit: 2, Write: 1, Bash: 0, Read: 3 },
    });
    const log = readFileSync(changelogPath(r), "utf8");
    expect(log).toContain(`Session ${result.id} recorded`);
    // Tool-count summary surfaces in the changelog line for at-a-glance scan.
    expect(log).toMatch(/Edit×2/);
  });
});

describe("parseTranscriptJsonl — H2 cross-check", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("parseTranscriptJsonl still surfaces PROP-NNN ids — the filter applies only at the auto-session caller", async () => {
    // parseTranscriptJsonl is also used by `cairndex status` / `last-turn-summary`
    // which DO want to count PROP references. Confirm we didn't over-filter at the
    // wrong layer.
    const dir = mkdtempSync(join(tmpdir(), "cairn-transcript-"));
    dirs.push(dir);
    const transcript = join(dir, "t.jsonl");
    const entry = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Edit",
            input: { file_path: "inbox/PROP-007.md" },
          },
        ],
      },
    });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(transcript, entry, "utf8");
    const parsed = await parseTranscriptJsonl(transcript);
    expect(parsed.idsReferenced).toContain("PROP-007");
  });
});
