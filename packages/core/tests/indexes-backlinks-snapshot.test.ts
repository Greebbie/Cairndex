import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  buildBacklinksSnapshot,
  regenerateBacklinksSnapshot,
} from "../src/indexes/backlinksSnapshot.js";
import { backlinksPath } from "../src/paths.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-bls-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function setup(files: Record<string, string>) {
  for (const [path, body] of Object.entries(files)) {
    const full = join(tmp, ".cairndex", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
}

describe("buildBacklinksSnapshot", () => {
  it("produces a serializable snapshot from the in-memory backlinks index", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
      "decisions/ADR-001.md":
        "---\nid: ADR-001\ntitle: A\nstatus: accepted\ncreated: 2026-04-30\nlinks:\n  - { type: implements, target: SPEC-001 }\n---\n",
    });
    const snap = await buildBacklinksSnapshot(tmp, defaultConfig());
    expect(snap.entries).toContainEqual(
      expect.objectContaining({
        target: "SPEC-001",
        backlinks: [{ from: "ADR-001", fromType: "decision", type: "implements" }],
      }),
    );
    expect(snap.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns an empty snapshot for an empty vault", async () => {
    setup({});
    const snap = await buildBacklinksSnapshot(tmp, defaultConfig());
    expect(snap.entries).toEqual([]);
  });
});

describe("regenerateBacklinksSnapshot", () => {
  it("writes backlinks.json to indexes/", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    });
    const result = await regenerateBacklinksSnapshot(tmp, defaultConfig());
    expect(result.changed).toBe(true);
    expect(existsSync(backlinksPath(tmp))).toBe(true);
    JSON.parse(readFileSync(backlinksPath(tmp), "utf8"));
  });

  it("is idempotent across runs", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    });
    await regenerateBacklinksSnapshot(tmp, defaultConfig());
    const result = await regenerateBacklinksSnapshot(tmp, defaultConfig());
    expect(result.changed).toBe(false);
  });
});
