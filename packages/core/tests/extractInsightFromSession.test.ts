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
      We agreed to migrate to McpServer in SPEC-007.
      SPEC-007 also covers the SessionStart wiring.
      SPEC-007 ships this week.
    `;
    const draft = extractInsightFromSessionBody(body, "2026-05-03-1500");
    expect(draft).not.toBeNull();
    expect(draft?.relatedIds).toContain("SPEC-007");
    expect(draft?.reason).toMatch(/decision-like/);
    expect(draft?.reason).toMatch(/repeated id/);
    // Both signals fired → highest tier of confidence.
    expect(draft?.confidence).toBe(0.6);
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

  // Tighter quality gate (post-PROP-010/PROP-011 dogfood):

  it("rejects single-token decision phrases (table cells / regex hits in identifiers)", () => {
    // Captured phrase = "Z" — single token, would have passed the old letter check
    // because tokens of length >=8 letters are allowed; new rule requires >=2 words.
    const body = "agreed to identifierA";
    expect(extractInsightFromSessionBody(body, "session")).toBeNull();
  });

  it("rejects short decision phrases (<12 letters of English)", () => {
    // "agreed to a b c" → captured "a b c" — only 3 letters → rejected.
    const body = "agreed to a b c";
    expect(extractInsightFromSessionBody(body, "session")).toBeNull();
  });

  it("rejects decision phrases that contain a double quote — real decisions paraphrase, not quote", () => {
    // Body mirrors PROP-010's actual captured fragment: a transcript that opened
    // a string literal mid-line. Even with the matched-pair check, every quote is
    // suspicious — drop them.
    const body = `agreed to make X happen and "break things" along the way`;
    expect(extractInsightFromSessionBody(body, "session")).toBeNull();
  });

  it("ignores PROP- / INBOX- / SESSION- IDs when counting recurrence — these are workflow metadata", () => {
    // A session that's mostly *about* the inbox would otherwise auto-propose a
    // useless insight (this is what produced PROP-011 in dogfood). Filtering
    // those prefixes reduces it to no-signal.
    const body = "Reviewed PROP-001. PROP-001 next. Then PROP-002 and PROP-002 again. PROP-003 PROP-003.";
    expect(extractInsightFromSessionBody(body, "session")).toBeNull();
  });

  it("emits low confidence (0.25) for ID-recurrence-only signal", () => {
    // Threshold is now 3 (raised from 2 in 2026-05-03 to keep the active spec/plan/task
    // out of the auto-distill stream). Three mentions still hit.
    const body = "TASK-009 again. TASK-009 once more. TASK-009 once more again.";
    const draft = extractInsightFromSessionBody(body, "session");
    expect(draft?.confidence).toBe(0.25);
  });

  it("does NOT fire on 2 mentions of an ID (below new threshold of 3)", () => {
    // The active spec/plan/task is naturally referenced ≥2 times in any substantive
    // session — at threshold 2 this produced a steady trickle of "Recurring focus on
    // SPEC-X" drafts (PROP-019..PROP-028 in the dogfood vault). Threshold 3 means
    // "the session was *about* X," not "X was mentioned in passing twice."
    const body = "TASK-009 again. TASK-009 once more.";
    expect(extractInsightFromSessionBody(body, "session")).toBeNull();
  });

  it("emits mid confidence (0.5) for a decision-phrase-only signal", () => {
    const body = "We decided to ship the SEA build before Tauri because it has no Rust dependency.";
    const draft = extractInsightFromSessionBody(body, "session");
    expect(draft?.confidence).toBe(0.5);
  });
});
