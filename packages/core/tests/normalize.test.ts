import { describe, expect, it } from "vitest";
import { normalizeFrontmatter, normalizeTags } from "../src/normalize.js";

describe("normalize", () => {
  it("normalizes tags to kebab-case lowercase", () => {
    expect(normalizeTags(["Auth", "Security_Hardening", " API Token "])).toEqual([
      "auth",
      "security-hardening",
      "api-token",
    ]);
  });

  it("removes duplicate tags", () => {
    expect(normalizeTags(["auth", "Auth", "AUTH"])).toEqual(["auth"]);
  });

  it("sorts top-level frontmatter keys into canonical order", () => {
    const input = {
      tags: ["a"],
      title: "x",
      id: "SPEC-001",
      status: "active",
      created: "2026-04-30",
    };
    const out = normalizeFrontmatter(input);
    expect(Object.keys(out)).toEqual(["id", "title", "status", "tags", "created"]);
  });

  it("normalizes the tags array inside frontmatter", () => {
    const out = normalizeFrontmatter({ id: "SPEC-001", tags: ["Foo Bar", "BAZ"] });
    expect(out.tags).toEqual(["foo-bar", "baz"]);
  });

  it("touches updated when refreshTimestamp is true", () => {
    const out = normalizeFrontmatter(
      { id: "SPEC-001", updated: "2026-01-01" },
      { refreshTimestamp: true, today: "2026-04-30" },
    );
    expect(out.updated).toBe("2026-04-30");
  });

  it("does not touch updated when refreshTimestamp is false", () => {
    const out = normalizeFrontmatter(
      { id: "SPEC-001", updated: "2026-01-01" },
      { refreshTimestamp: false, today: "2026-04-30" },
    );
    expect(out.updated).toBe("2026-01-01");
  });
});
