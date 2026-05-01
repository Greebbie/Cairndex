import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/frontmatter.js";

describe("parseFrontmatter - safe engines", () => {
  it("parses normal YAML frontmatter correctly", () => {
    const source = "---\nid: SPEC-001\ntitle: Hello\n---\nbody text\n";
    const { data, content } = parseFrontmatter(source);
    expect(data).toMatchObject({ id: "SPEC-001", title: "Hello" });
    expect(content.trim()).toBe("body text");
  });

  it("does not execute JS in ---js frontmatter blocks (throws instead)", () => {
    // The disabled js engine should throw rather than executing arbitrary code.
    const jsPayload =
      "---js\nmodule.exports = { x: (() => { globalThis.__PWNED__ = true; return 1; })() }\n---\nbody\n";
    // Assert it throws (disabled engine) and does NOT set the side-effect marker.
    expect(() => parseFrontmatter(jsPayload)).toThrow("js frontmatter engine is disabled");
    // biome-ignore lint/suspicious/noExplicitAny: intentional access for side-effect check
    expect((globalThis as any).__PWNED__).toBeUndefined();
  });

  it("rejects !!js/regexp and similar YAML type extensions via JSON_SCHEMA", () => {
    // JSON_SCHEMA only allows standard JSON types; !!js/regexp should throw.
    const source = "---\npattern: !!js/regexp /foo/\n---\nbody\n";
    expect(() => parseFrontmatter(source)).toThrow();
  });
});
