import { describe, expect, it } from "vitest";
import { humanizeDateString, humanizeRelative } from "../../src/lib/time";

const NOW = 1_700_000_000_000; // fixed reference for deterministic tests

describe("humanizeRelative", () => {
  it("under 30s reads as 'just now'", () => {
    expect(humanizeRelative(NOW - 5_000, NOW)).toBe("just now");
  });
  it("seconds bucket", () => {
    expect(humanizeRelative(NOW - 45_000, NOW)).toBe("45s ago");
  });
  it("minutes bucket", () => {
    expect(humanizeRelative(NOW - 2 * 60_000, NOW)).toBe("2 min ago");
  });
  it("hours bucket", () => {
    expect(humanizeRelative(NOW - 3 * 60 * 60_000, NOW)).toBe("3 hr ago");
  });
  it("days bucket", () => {
    expect(humanizeRelative(NOW - 5 * 24 * 60 * 60_000, NOW)).toBe("5d ago");
  });
});

describe("humanizeDateString", () => {
  it("parses ISO date strings into relative labels", () => {
    const isoTwoMinAgo = new Date(NOW - 2 * 60_000).toISOString();
    expect(humanizeDateString(isoTwoMinAgo, NOW)).toBe("2 min ago");
  });
  it("returns the raw value when it cannot be parsed", () => {
    expect(humanizeDateString("not-a-date", NOW)).toBe("not-a-date");
  });
  it("returns empty input unchanged", () => {
    expect(humanizeDateString("", NOW)).toBe("");
  });
});
