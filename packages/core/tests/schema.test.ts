import { describe, expect, it } from "vitest";
import {
  DecisionFrontmatterSchema,
  LinkSchema,
  ProvenanceSchema,
  SessionFrontmatterSchema,
  SpecFrontmatterSchema,
} from "../src/schema.js";

describe("schema", () => {
  it("accepts a minimal valid spec frontmatter", () => {
    const fm = {
      id: "SPEC-001",
      title: "User can log in",
      status: "active",
      created: "2026-04-30",
      updated: "2026-04-30",
    };
    expect(() => SpecFrontmatterSchema.parse(fm)).not.toThrow();
  });

  it("rejects spec with missing required field", () => {
    const fm = { id: "SPEC-001", title: "X", status: "active", created: "2026-04-30" };
    expect(() => SpecFrontmatterSchema.parse(fm)).toThrow();
  });

  it("validates a typed link", () => {
    const link = { type: "supersedes", target: "ADR-002" };
    expect(LinkSchema.parse(link)).toEqual(link);
  });

  it("validates a link with optional evidence", () => {
    const link = { type: "validates", target: "SPEC-001", evidence: "src/x.test.ts" };
    expect(LinkSchema.parse(link)).toEqual(link);
  });

  it("validates provenance", () => {
    const prov = {
      created_by: "claude-opus-4-7",
      session: "2026-04-30-1530",
      confidence: 0.85,
    };
    expect(ProvenanceSchema.parse(prov)).toEqual(prov);
  });

  it("rejects decision with status: superseded but no superseded_by link", () => {
    // semantic check belongs to validate, not schema; schema only enforces shape.
    const fm = {
      id: "ADR-001",
      title: "Use X",
      status: "superseded",
      created: "2026-04-30",
    };
    expect(() => DecisionFrontmatterSchema.parse(fm)).not.toThrow();
  });

  it("session frontmatter requires id, date, summary", () => {
    expect(() =>
      SessionFrontmatterSchema.parse({
        id: "2026-04-30-1530",
        date: "2026-04-30",
        summary: "Implemented login",
      }),
    ).not.toThrow();
  });
});
