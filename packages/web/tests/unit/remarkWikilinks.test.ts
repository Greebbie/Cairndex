import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { remarkWikilinks } from "../../src/lib/remarkWikilinks.js";

async function transform(input: string): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    // biome-ignore lint/suspicious/noExplicitAny: unified plugin typing requires this cast
    .use(remarkWikilinks as any)
    .use(remarkStringify);
  const out = await processor.process(input);
  return String(out);
}

describe("remarkWikilinks", () => {
  it("converts [[SPEC-001]] to a markdown link", async () => {
    const out = await transform("see [[SPEC-001]] please");
    expect(out).toContain("[SPEC-001](#/node/SPEC-001)");
  });

  it("leaves text without wikilinks unchanged", async () => {
    const out = await transform("just plain text");
    expect(out.trim()).toBe("just plain text");
  });

  it("handles session id format", async () => {
    const out = await transform("see [[2026-04-30-1530]]");
    expect(out).toContain("[2026-04-30-1530](#/node/2026-04-30-1530)");
  });
});
