import { describe, expect, it } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "../src/frontmatter.js";

const SAMPLE = `---
id: SPEC-001
title: Test
status: active
created: 2026-04-30
updated: 2026-04-30
---

## Body
hello world
`;

describe("frontmatter", () => {
  it("parses frontmatter and body", () => {
    const { data, content } = parseFrontmatter<{ id: string; title: string }>(SAMPLE);
    expect(data.id).toBe("SPEC-001");
    expect(data.title).toBe("Test");
    expect(content).toContain("## Body");
    expect(content).toContain("hello world");
  });

  it("serializes back to markdown with frontmatter", () => {
    const out = serializeFrontmatter(
      {
        id: "SPEC-002",
        title: "Out",
        status: "active",
        created: "2026-04-30",
        updated: "2026-04-30",
      },
      "## Body\nhi\n",
    );
    expect(out).toMatch(/^---\n/);
    expect(out).toContain("id: SPEC-002");
    expect(out).toContain("## Body");
  });

  it("round-trips without losing content", () => {
    const parsed = parseFrontmatter(SAMPLE);
    const out = serializeFrontmatter(parsed.data, parsed.content);
    const reparsed = parseFrontmatter(out);
    expect(reparsed.data).toEqual(parsed.data);
    expect(reparsed.content.trim()).toBe(parsed.content.trim());
  });

  it("handles a file with no frontmatter", () => {
    const { data, content } = parseFrontmatter("# just a heading\n");
    expect(data).toEqual({});
    expect(content).toContain("# just a heading");
  });
});
