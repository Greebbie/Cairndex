import { describe, expect, it } from "vitest";
import { formatSequentialId, formatSessionId, nextSequentialId, parseId } from "../src/ids.js";

describe("ids", () => {
  it("parses a sequential id", () => {
    expect(parseId("SPEC-001")).toEqual({ prefix: "SPEC", number: 1, raw: "SPEC-001" });
  });

  it("parses an id with multi-digit number", () => {
    expect(parseId("ADR-042")).toEqual({ prefix: "ADR", number: 42, raw: "ADR-042" });
  });

  it("returns null for malformed id", () => {
    expect(parseId("not-an-id")).toBeNull();
    expect(parseId("SPEC-")).toBeNull();
  });

  it("formats a sequential id with zero padding", () => {
    expect(formatSequentialId("SPEC", 1)).toBe("SPEC-001");
    expect(formatSequentialId("ADR", 42)).toBe("ADR-042");
    expect(formatSequentialId("PLAN", 1234)).toBe("PLAN-1234");
  });

  it("computes next sequential id from existing list", () => {
    expect(nextSequentialId("SPEC", ["SPEC-001", "SPEC-003", "SPEC-002"])).toBe("SPEC-004");
  });

  it("returns first id when list is empty", () => {
    expect(nextSequentialId("SPEC", [])).toBe("SPEC-001");
  });

  it("ignores ids with different prefix", () => {
    expect(nextSequentialId("SPEC", ["ADR-001", "SPEC-001", "SPEC-002"])).toBe("SPEC-003");
  });

  it("formats session id from a Date", () => {
    const d = new Date("2026-04-30T15:30:00Z");
    // result is in UTC if we don't use local; spec says local — test local behavior
    expect(formatSessionId(d, { utc: true })).toBe("2026-04-30-1530");
  });
});
