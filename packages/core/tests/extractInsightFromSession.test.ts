import { describe, expect, it } from "vitest";
import { extractInsightFromSessionBody } from "../src/insight/extractFromSession.js";

describe("extractInsightFromSessionBody", () => {
  it("returns null when no decisions and no repeated ids", () => {
    const body = "Worked on stuff. Touched a few files. Read some specs.";
    expect(extractInsightFromSessionBody(body, "2026-05-03-1200")).toBeNull();
  });

  it("captures a decision-like phrase as the title seed", () => {
    const body = "We decided to ship SEA before Tauri because it has no Rust dependency.";
    const draft = extractInsightFromSessionBody(body, "2026-05-03-1200");
    expect(draft).not.toBeNull();
    expect(draft?.title).toContain("ship SEA");
    expect(draft?.reason).toMatch(/decision-like phrase/);
  });

  it("flags repeated id mentions and lists them", () => {
    const body =
      "SPEC-001 is the active focus. SPEC-001 supersedes ADR-002. SPEC-001 will land next week.";
    const draft = extractInsightFromSessionBody(body, "session-X");
    expect(draft).not.toBeNull();
    expect(draft?.relatedIds).toContain("SPEC-001");
    expect(draft?.body).toMatch(/SPEC-001/);
  });

  it("combines decision and id signals into a single draft", () => {
    const body = `
      We agreed to migrate to McpServer in PROP-007.
      PROP-007 also covers the SessionStart wiring.
      PROP-007 ships this week.
    `;
    const draft = extractInsightFromSessionBody(body, "2026-05-03-1500");
    expect(draft).not.toBeNull();
    expect(draft?.relatedIds).toContain("PROP-007");
    expect(draft?.reason).toMatch(/decision-like/);
    expect(draft?.reason).toMatch(/repeated id/);
  });

  it("falls back to a generic title when only id signal fires", () => {
    const body = "Touched TASK-009. Touched TASK-009 again. Saw TASK-009.";
    const draft = extractInsightFromSessionBody(body, "session-Y");
    expect(draft).not.toBeNull();
    expect(draft?.title).toMatch(/TASK-009/);
  });

  // Quality filter: phrases the regex captured from inside code, regex literals,
  // or markdown tables should NOT promote — they were producing garbage drafts
  // like `Auto-distilled insight: Y" / "agreed to Z" |` in dogfood.
  it("rejects decision phrases with unmatched double quotes (regex landed in JS string)", () => {
    const body = `agreed to "make X happen and break "everything`;
    expect(extractInsightFromSessionBody(body, "session")).toBeNull();
  });

  it("rejects decision phrases containing pipe characters (markdown table cell)", () => {
    const body = "agreed to Y | Z | TASK-001 | done";
    expect(extractInsightFromSessionBody(body, "session")).toBeNull();
  });

  it("rejects decision phrases containing backticks (code span)", () => {
    const body = "decided to use `useState` everywhere";
    expect(extractInsightFromSessionBody(body, "session")).toBeNull();
  });

  it("ACCEPTS decisions with apostrophes — `don't`, `we'll` are normal English", () => {
    const body = "We decided to make vaultPath follow the pointer so routes don't need to pre-resolve.";
    const draft = extractInsightFromSessionBody(body, "session");
    expect(draft).not.toBeNull();
    expect(draft?.title).toMatch(/vaultPath/);
  });
});
