import { describe, expect, it } from "vitest";
import { applyPatch } from "../src/inbox/applyPatch.js";

describe("applyPatch — append-section", () => {
  it("appends content to the end of an existing section, before the next heading", () => {
    const body = [
      "Intro paragraph.",
      "",
      "## History",
      "- 2026-04-01: created",
      "",
      "## Notes",
      "stuff",
      "",
    ].join("\n");
    const out = applyPatch(body, [
      { kind: "append-section", section: "## History", content: "- 2026-05-02: updated\n" },
    ]);
    expect(out).toContain("- 2026-04-01: created");
    expect(out).toContain("- 2026-05-02: updated");
    const histIdx = out.indexOf("- 2026-04-01: created");
    const newIdx = out.indexOf("- 2026-05-02: updated");
    const notesIdx = out.indexOf("## Notes");
    expect(histIdx).toBeLessThan(newIdx);
    expect(newIdx).toBeLessThan(notesIdx);
  });

  it("appends a new section at the end of the body when the section is missing", () => {
    const body = "Intro paragraph.\n\n## Notes\nstuff\n";
    const out = applyPatch(body, [
      { kind: "append-section", section: "## History", content: "- first entry\n" },
    ]);
    expect(out).toContain("Intro paragraph.");
    expect(out).toContain("## Notes");
    expect(out).toContain("## History");
    expect(out).toContain("- first entry");
    expect(out.lastIndexOf("## History")).toBeGreaterThan(out.indexOf("## Notes"));
  });

  it("appends to a body that has no headings at all", () => {
    const body = "Just prose.\n";
    const out = applyPatch(body, [
      { kind: "append-section", section: "## History", content: "- first entry\n" },
    ]);
    expect(out.startsWith("Just prose.")).toBe(true);
    expect(out).toContain("## History");
    expect(out).toContain("- first entry");
  });
});

describe("applyPatch — replace-section", () => {
  it("replaces the matching section body, keeps surrounding sections intact", () => {
    const body = [
      "Intro.",
      "",
      "## Current Statement",
      "old wording",
      "",
      "## Notes",
      "kept",
      "",
    ].join("\n");
    const out = applyPatch(body, [
      {
        kind: "replace-section",
        section: "## Current Statement",
        content: "new wording\n",
      },
    ]);
    expect(out).toContain("Intro.");
    expect(out).toContain("## Current Statement");
    expect(out).toContain("new wording");
    expect(out).not.toContain("old wording");
    expect(out).toContain("## Notes");
    expect(out).toContain("kept");
  });

  it("throws when the target section does not exist", () => {
    const body = "## Notes\nstuff\n";
    expect(() =>
      applyPatch(body, [{ kind: "replace-section", section: "## History", content: "x\n" }]),
    ).toThrow(/replace-section.*"## History".*not found/i);
  });
});

describe("applyPatch — composition", () => {
  it("applies ops in order; later ops see earlier ops' results", () => {
    const body = "## Notes\nkept\n";
    const out = applyPatch(body, [
      { kind: "append-section", section: "## History", content: "first\n" },
      { kind: "append-section", section: "## History", content: "second\n" },
    ]);
    const firstIdx = out.indexOf("first");
    const secondIdx = out.indexOf("second");
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });

  it("does not treat headings inside fenced code blocks as section markers", () => {
    const body = [
      "## Real Section",
      "real content",
      "",
      "```md",
      "## Fake Section",
      "this is just a code sample",
      "```",
      "",
    ].join("\n");
    expect(() =>
      applyPatch(body, [{ kind: "replace-section", section: "## Fake Section", content: "x\n" }]),
    ).toThrow(/not found/i);
    const out = applyPatch(body, [
      { kind: "append-section", section: "## Real Section", content: "more\n" },
    ]);
    expect(out).toContain("more");
    expect(out).toContain("## Fake Section");
  });
});

describe("applyPatch — degenerate inputs", () => {
  it("returns the body unchanged when patch is empty", () => {
    const body = "## A\nx\n";
    expect(applyPatch(body, [])).toBe(body);
  });

  it("matches headings by exact trimmed line text (case-sensitive)", () => {
    const body = "## History\nx\n";
    expect(() =>
      applyPatch(body, [{ kind: "replace-section", section: "## history", content: "y\n" }]),
    ).toThrow(/not found/i);
  });
});
