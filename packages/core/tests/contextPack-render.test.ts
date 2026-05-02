import { describe, expect, it } from "vitest";
import { renderContextPack } from "../src/contextPack/render.js";
import type { ContextPackItem, ContextPackOutput } from "../src/contextPack/types.js";

function pack(over: Partial<ContextPackOutput> = {}): ContextPackOutput {
  const items: ContextPackItem[] = over.items ?? [
    {
      id: "PROJECT-STATE",
      type: "project-state",
      title: "Project State",
      reason: "project state",
      reasonPriority: 1,
      body: "Phase: implementing\nNext action: do thing",
    },
    {
      id: "SPEC-001",
      type: "spec",
      title: "Memory Cockpit",
      status: "active",
      reason: "active spec",
      reasonPriority: 1,
      body: "spec body content",
    },
  ];
  return {
    task: over.task ?? "fix web e2e",
    packId: over.packId ?? "pack-fix-web-e2e-abc12345",
    builtAt: over.builtAt ?? "2026-05-02T01:00:00.000Z",
    tokenEstimate: over.tokenEstimate ?? 42,
    tokenBudget: over.tokenBudget ?? 8000,
    trimmedItems: over.trimmedItems ?? 0,
    warnings: over.warnings ?? [],
    items,
  };
}

describe("renderContextPack", () => {
  it("emits a frontmatter block with id, task, builtAt, tokenEstimate, items", () => {
    const out = renderContextPack(pack());
    expect(out).toMatch(/^---\n/);
    expect(out).toContain("id: pack-fix-web-e2e-abc12345");
    expect(out).toMatch(/task:\s+["']?fix web e2e["']?/);
    expect(out).toContain("builtAt:");
    expect(out).toContain("tokenEstimate: 42");
    expect(out).toContain("tokenBudget: 8000");
  });

  it("renders an enumerated list of items with reason annotations", () => {
    const out = renderContextPack(pack());
    expect(out).toContain("# Context Pack: fix web e2e");
    expect(out).toMatch(/##\s+1\.\s+PROJECT-STATE/);
    expect(out).toMatch(/##\s+2\.\s+SPEC-001/);
    expect(out).toContain("reason: project state");
    expect(out).toContain("reason: active spec");
  });

  it("includes the inbox guidance footer", () => {
    const out = renderContextPack(pack());
    expect(out).toMatch(/inbox.*proposed-memory-updates/);
  });

  it("includes a 'grep for more' hint", () => {
    const out = renderContextPack(pack());
    expect(out).toMatch(/grep.*\.cairndex/);
  });

  it("uses project-relative grep + inbox hints when given a central project id", () => {
    const out = renderContextPack(pack(), "demo");
    expect(out).toContain("grep projects/demo/");
    expect(out).toContain("projects/demo/inbox/proposed-memory-updates/");
    expect(out).not.toContain("grep .cairndex/");
  });

  it("notes trimmed items when trimmedItems > 0", () => {
    const out = renderContextPack(pack({ trimmedItems: 3 }));
    expect(out).toMatch(/3\s+item.*trimmed/i);
  });
});
