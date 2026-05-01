import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseTranscriptJsonl } from "../src/autoSession.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-transcript-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeTranscript(lines: unknown[]): string {
  const path = join(tmp, "transcript.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n"), "utf8");
  return path;
}

describe("parseTranscriptJsonl", () => {
  it("extracts file paths, IDs, and tool counts from a Claude Code transcript", async () => {
    const path = writeTranscript([
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Edit",
              input: {
                file_path: "/repo/.cairndex/specs/SPEC-001.md",
                old_string: "x",
                new_string: "y",
              },
            },
          ],
        },
      },
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Write",
              input: { file_path: "/repo/.cairndex/decisions/ADR-007.md", content: "..." },
            },
            { type: "tool_use", name: "Bash", input: { command: "pnpm test" } },
            { type: "tool_use", name: "Bash", input: { command: "git status" } },
          ],
        },
      },
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", name: "Read", input: { file_path: "/repo/src/auth.ts" } },
            { type: "tool_use", name: "Read", input: { file_path: "/repo/src/auth.ts" } },
          ],
        },
      },
    ]);

    const result = await parseTranscriptJsonl(path);

    expect(result.touchedPaths).toContain("/repo/.cairndex/specs/SPEC-001.md");
    expect(result.touchedPaths).toContain("/repo/.cairndex/decisions/ADR-007.md");
    expect(result.touchedPaths).toContain("/repo/src/auth.ts");
    // distinct paths only — Read of same file twice should appear once
    expect(result.touchedPaths.filter((p) => p === "/repo/src/auth.ts")).toHaveLength(1);

    expect(result.idsReferenced).toContain("SPEC-001");
    expect(result.idsReferenced).toContain("ADR-007");

    expect(result.toolCounts.Edit).toBe(1);
    expect(result.toolCounts.Write).toBe(1);
    expect(result.toolCounts.Bash).toBe(2);
    expect(result.toolCounts.Read).toBe(2);
  });

  it("returns an empty result for a missing transcript", async () => {
    const result = await parseTranscriptJsonl(join(tmp, "missing.jsonl"));
    expect(result.touchedPaths).toEqual([]);
    expect(result.idsReferenced).toEqual([]);
    expect(result.toolCounts).toEqual({ Edit: 0, Write: 0, Bash: 0, Read: 0 });
  });

  it("ignores malformed JSONL lines without throwing", async () => {
    const path = join(tmp, "transcript.jsonl");
    writeFileSync(
      path,
      [
        "{not real json",
        JSON.stringify({
          type: "assistant",
          message: {
            content: [{ type: "tool_use", name: "Edit", input: { file_path: "/a.md" } }],
          },
        }),
      ].join("\n"),
      "utf8",
    );
    const result = await parseTranscriptJsonl(path);
    expect(result.touchedPaths).toContain("/a.md");
    expect(result.toolCounts.Edit).toBe(1);
  });
});
