import { describe, expect, it } from "vitest";
import { CAIRNDEX_BLOCK_END, CAIRNDEX_BLOCK_START, applyCairndexBlock } from "../src/claudeMd.js";

const BLOCK = "## cairndex Project Memory\n\n(content)\n";

describe("claudeMd", () => {
  it("creates new content when no CLAUDE.md exists", () => {
    const r = applyCairndexBlock(undefined, BLOCK);
    expect(r.action).toBe("created");
    expect(r.updated).toContain(CAIRNDEX_BLOCK_START);
    expect(r.updated).toContain(CAIRNDEX_BLOCK_END);
    expect(r.updated).toContain("## cairndex Project Memory");
  });

  it("appends to existing CLAUDE.md without markers", () => {
    const existing = "# My Project\n\nUser content.\n";
    const r = applyCairndexBlock(existing, BLOCK);
    expect(r.action).toBe("appended");
    expect(r.updated.startsWith("# My Project")).toBe(true);
    expect(r.updated).toContain(CAIRNDEX_BLOCK_START);
  });

  it("replaces content between existing markers", () => {
    const existing = `# My Project\n\nUser stuff.\n\n${CAIRNDEX_BLOCK_START}\nOLD CONTENT\n${CAIRNDEX_BLOCK_END}\n\nMore user.\n`;
    const r = applyCairndexBlock(existing, "NEW CONTENT\n");
    expect(r.action).toBe("replaced");
    expect(r.updated).toContain("NEW CONTENT");
    expect(r.updated).not.toContain("OLD CONTENT");
    expect(r.updated).toContain("More user.");
    expect(r.updated).toContain("User stuff.");
  });

  it("is idempotent: applying same block twice yields the same content", () => {
    const r1 = applyCairndexBlock("# X\n", BLOCK);
    const r2 = applyCairndexBlock(r1.updated, BLOCK);
    expect(r2.action).toBe("replaced");
    expect(r2.updated).toBe(r1.updated);
  });

  it("preserves user content outside markers exactly", () => {
    const existing = `before\n${CAIRNDEX_BLOCK_START}\nold\n${CAIRNDEX_BLOCK_END}\nafter\n`;
    const r = applyCairndexBlock(existing, "new\n");
    expect(r.updated).toBe(`before\n${CAIRNDEX_BLOCK_START}\nnew\n${CAIRNDEX_BLOCK_END}\nafter\n`);
  });
});
