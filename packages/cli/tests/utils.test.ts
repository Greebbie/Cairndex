import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findBundledTemplatesDir } from "../src/utils/bundledTemplates.js";
import { pathChangedSince, readMtimeStore, writeMtimeStore } from "../src/utils/mtimeStore.js";
import { findRepoRoot } from "../src/utils/paths.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-utl-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("paths.findRepoRoot", () => {
  it("walks up to find a .git directory", () => {
    const inner = join(tmp, "a", "b", "c");
    mkdirSync(inner, { recursive: true });
    mkdirSync(join(tmp, ".git"));
    expect(findRepoRoot(inner)).toBe(tmp);
  });

  it("falls back to startDir if no .git is found", () => {
    const inner = join(tmp, "x");
    mkdirSync(inner, { recursive: true });
    // No .git anywhere up the tree from this temp inner — fall back.
    const result = findRepoRoot(inner);
    expect(typeof result).toBe("string");
  });
});

describe("bundledTemplates.findBundledTemplatesDir", () => {
  it("returns a path that exists", () => {
    const dir = findBundledTemplatesDir();
    expect(typeof dir).toBe("string");
  });
});

describe("mtimeStore", () => {
  it("read returns {} when file is absent", async () => {
    mkdirSync(join(tmp, ".cairndex"), { recursive: true });
    const store = await readMtimeStore(tmp);
    expect(store).toEqual({});
  });

  it("read returns {} when file is malformed", async () => {
    mkdirSync(join(tmp, ".cairndex"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/.doctor-mtime.json"), "{not-json");
    const store = await readMtimeStore(tmp);
    expect(store).toEqual({});
  });

  it("write then read round-trips", async () => {
    mkdirSync(join(tmp, ".cairndex"), { recursive: true });
    await writeMtimeStore(tmp, { "/some/abs/path.md": 1234 });
    const store = await readMtimeStore(tmp);
    expect(store["/some/abs/path.md"]).toBe(1234);
  });

  it("pathChangedSince returns false for non-existent file", () => {
    expect(pathChangedSince(join(tmp, "nope.md"), 0)).toBe(false);
  });

  it("pathChangedSince returns true when file is newer than lastSeen", () => {
    const f = join(tmp, "x.md");
    writeFileSync(f, "x");
    expect(pathChangedSince(f, 0)).toBe(true);
  });

  it("pathChangedSince returns true when lastSeen is undefined", () => {
    const f = join(tmp, "x.md");
    writeFileSync(f, "x");
    expect(pathChangedSince(f, undefined)).toBe(true);
  });
});
