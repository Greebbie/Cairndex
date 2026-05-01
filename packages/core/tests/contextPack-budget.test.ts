import { describe, expect, it } from "vitest";
import { estimateTokens, trimToBudget } from "../src/contextPack/budget.js";
import type { ContextPackItem } from "../src/contextPack/types.js";

const item = (id: string, prio: number, body: string, type: ContextPackItem["type"] = "session"): ContextPackItem => ({
  id,
  type,
  title: id,
  reason: "test",
  reasonPriority: prio,
  body,
});

describe("estimateTokens", () => {
  it("uses char/4 with ceiling", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("trimToBudget", () => {
  it("keeps everything when comfortably under budget", () => {
    const items = [item("A", 1, "x".repeat(40)), item("B", 4, "x".repeat(40))];
    const r = trimToBudget(items, 10_000);
    expect(r.items.map((i) => i.id)).toEqual(["A", "B"]);
    expect(r.trimmedItems).toBe(0);
  });

  it("drops lowest-priority candidates first when over budget", () => {
    const big = "x".repeat(4000); // ~1000 tokens body
    const items = [
      item("KEEP", 1, big),
      item("Q", 3, big),
      item("S", 4, big),
    ];
    const r = trimToBudget(items, 1500); // ~enough for KEEP only
    expect(r.items.map((i) => i.id)).toContain("KEEP");
    expect(r.items.map((i) => i.id)).not.toContain("S");
    expect(r.trimmedItems).toBeGreaterThan(0);
  });

  it("never drops priority-1 items even if they alone exceed budget", () => {
    const big = "x".repeat(8000); // ~2000 tokens
    const items = [item("KEEP1", 1, big), item("KEEP2", 1, big)];
    const r = trimToBudget(items, 100);
    expect(r.items.map((i) => i.id)).toEqual(["KEEP1", "KEEP2"]);
    expect(r.trimmedItems).toBe(0);
  });

  it("preserves the original item ordering for accepted items", () => {
    const items = [
      item("A", 1, "x".repeat(40)),
      item("B", 4, "x".repeat(40)),
      item("C", 2, "x".repeat(40)),
      item("D", 3, "x".repeat(40)),
    ];
    const r = trimToBudget(items, 10_000);
    expect(r.items.map((i) => i.id)).toEqual(["A", "B", "C", "D"]);
  });
});
