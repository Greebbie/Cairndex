import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertContained } from "../src/safePath.js";

// Use process.cwd()-relative paths so they resolve correctly on all platforms.
const BASE = resolve(join(".", "test-vault-base"));
const INSIDE = join(BASE, "rules", "operating-rules.md");
const OUTSIDE_DOT_DOT = join(BASE, "..", "outside.md");

describe("assertContained", () => {
  it("returns the resolved path when the candidate is inside base", () => {
    const result = assertContained(INSIDE, BASE);
    expect(result).toBe(resolve(INSIDE));
  });

  it("throws when a dot-dot segment escapes the base", () => {
    expect(() => assertContained(OUTSIDE_DOT_DOT, BASE)).toThrow("path traversal");
  });

  it("throws when an absolute path outside the base is given", () => {
    // Use a path that is definitely not under BASE on any platform.
    const other = resolve(join(".", "somewhere-else", "file.md"));
    expect(() => assertContained(other, BASE)).toThrow("path traversal");
  });
});
