import { describe, it, expect, afterEach } from "vitest";
import { rmSync, promises as fs } from "node:fs";
import { join } from "node:path";
import {
  scoreRecentNarrative,
  scoreActiveTaskProgress,
  scoreNextActionDefined,
  scoreInboxHygiene,
  scoreResumeConsumption,
  scoreAllStoryCoverage,
} from "../../src/health/storyCoverage.js";
import { seedFixture } from "../_utils/fixture.js";

describe("scoreRecentNarrative", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("green when ≥80% of last-7-day sessions are confirmed", async () => {
    root = seedFixture({
      sessions: [
        { id: "2026-05-01-1000", narrative_status: "confirmed" },
        { id: "2026-05-02-1000", narrative_status: "confirmed" },
        { id: "2026-05-03-1000", narrative_status: "confirmed" },
        { id: "2026-05-04-1000", narrative_status: "confirmed" },
        { id: "2026-05-05-1000", narrative_status: "empty" },
      ],
    });
    const r = await scoreRecentNarrative({ cwd: root, today: new Date("2026-05-05T12:00:00Z") });
    expect(r.level).toBe("green");
    expect(r.detail).toMatch(/4\/5|80%/);
  });

  it("yellow when 50-80% confirmed", async () => {
    root = seedFixture({
      sessions: [
        { id: "2026-05-01-1000", narrative_status: "confirmed" },
        { id: "2026-05-02-1000", narrative_status: "confirmed" },
        { id: "2026-05-03-1000", narrative_status: "confirmed" },
        { id: "2026-05-04-1000", narrative_status: "empty" },
        { id: "2026-05-05-1000", narrative_status: "empty" },
      ],
    });
    const r = await scoreRecentNarrative({ cwd: root, today: new Date("2026-05-05T12:00:00Z") });
    expect(r.level).toBe("yellow");
  });

  it("red when <50% confirmed", async () => {
    root = seedFixture({
      sessions: [
        { id: "2026-05-01-1000", narrative_status: "empty" },
        { id: "2026-05-02-1000", narrative_status: "empty" },
        { id: "2026-05-03-1000", narrative_status: "empty" },
        { id: "2026-05-04-1000", narrative_status: "empty" },
        { id: "2026-05-05-1000", narrative_status: "confirmed" },
      ],
    });
    const r = await scoreRecentNarrative({ cwd: root, today: new Date("2026-05-05T12:00:00Z") });
    expect(r.level).toBe("red");
  });

  it("ignores sessions older than 7 days", async () => {
    root = seedFixture({
      sessions: [
        { id: "2026-04-20-1000", narrative_status: "empty" }, // outside window
        { id: "2026-05-04-1000", narrative_status: "confirmed" },
        { id: "2026-05-05-1000", narrative_status: "confirmed" },
      ],
    });
    const r = await scoreRecentNarrative({ cwd: root, today: new Date("2026-05-05T12:00:00Z") });
    expect(r.level).toBe("green");
    expect(r.detail).not.toMatch(/3\//); // doesn't count the old one
  });

  it("green when no sessions in window (vacuously true)", async () => {
    root = seedFixture({});
    const r = await scoreRecentNarrative({ cwd: root, today: new Date("2026-05-05T12:00:00Z") });
    // Acceptable: green (no failures) — vacuously true when no sessions
    expect(["green"]).toContain(r.level);
  });
});

describe("scoreActiveTaskProgress", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("green when active task updated within 3 days", async () => {
    root = seedFixture({
      tasks: [
        { id: "TASK-A", title: "x", status: "in_progress", next_action: "y", updated: "2026-05-04" },
      ],
      currentTask: "TASK-A",
    });
    const r = await scoreActiveTaskProgress({ cwd: root, today: new Date("2026-05-05T12:00:00Z") });
    expect(r.level).toBe("green");
  });

  it("yellow when 4-7 days stale", async () => {
    root = seedFixture({
      tasks: [
        { id: "TASK-A", title: "x", status: "in_progress", next_action: "y", updated: "2026-05-01" },
      ],
      currentTask: "TASK-A",
    });
    const r = await scoreActiveTaskProgress({ cwd: root, today: new Date("2026-05-06T12:00:00Z") });
    expect(r.level).toBe("yellow");
  });

  it("red when >7 days stale", async () => {
    root = seedFixture({
      tasks: [
        { id: "TASK-A", title: "x", status: "in_progress", next_action: "y", updated: "2026-04-25" },
      ],
      currentTask: "TASK-A",
    });
    const r = await scoreActiveTaskProgress({ cwd: root, today: new Date("2026-05-05T12:00:00Z") });
    expect(r.level).toBe("red");
  });

  it("green (or 'no data') when no active task", async () => {
    root = seedFixture({});
    const r = await scoreActiveTaskProgress({ cwd: root, today: new Date("2026-05-05T12:00:00Z") });
    expect(["green"]).toContain(r.level);
  });
});

describe("scoreNextActionDefined", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("green when active task has next_action", async () => {
    root = seedFixture({
      tasks: [
        {
          id: "TASK-A",
          title: "x",
          status: "in_progress",
          next_action: "do thing",
          updated: "2026-05-05",
        },
      ],
      currentTask: "TASK-A",
    });
    const r = await scoreNextActionDefined({ cwd: root });
    expect(r.level).toBe("green");
  });

  it("yellow when active task next_action is empty", async () => {
    root = seedFixture({
      tasks: [
        {
          id: "TASK-A",
          title: "x",
          status: "in_progress",
          next_action: "",
          updated: "2026-05-05",
        },
      ],
      currentTask: "TASK-A",
    });
    const r = await scoreNextActionDefined({ cwd: root });
    expect(r.level).toBe("yellow");
  });

  it("red when no active task at all", async () => {
    root = seedFixture({});
    const r = await scoreNextActionDefined({ cwd: root });
    expect(r.level).toBe("red");
  });
});

describe("scoreInboxHygiene", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("green with <5 pending proposals", async () => {
    root = seedFixture({
      inboxProposals: Array.from({ length: 3 }, (_, i) => ({
        id: `PROP-${100 + i}`,
        status: "pending" as const,
        summary: "x",
      })),
    });
    const r = await scoreInboxHygiene({ cwd: root });
    expect(r.level).toBe("green");
  });

  it("yellow with 5-10 pending proposals", async () => {
    root = seedFixture({
      inboxProposals: Array.from({ length: 7 }, (_, i) => ({
        id: `PROP-${100 + i}`,
        status: "pending" as const,
        summary: "x",
      })),
    });
    const r = await scoreInboxHygiene({ cwd: root });
    expect(r.level).toBe("yellow");
  });

  it("red with >10 pending proposals", async () => {
    root = seedFixture({
      inboxProposals: Array.from({ length: 15 }, (_, i) => ({
        id: `PROP-${100 + i}`,
        status: "pending" as const,
        summary: "x",
      })),
    });
    const r = await scoreInboxHygiene({ cwd: root });
    expect(r.level).toBe("red");
  });

  it("does NOT count signals/ files toward inbox hygiene", async () => {
    root = seedFixture({
      inboxProposals: [{ id: "PROP-200", status: "pending" as const, summary: "x" }],
      signals: Array.from({ length: 20 }, (_, i) => ({
        id: `SIG-${100 + i}`,
        source: "auto-distill" as const,
      })),
    });
    const r = await scoreInboxHygiene({ cwd: root });
    expect(r.level).toBe("green"); // 1 pending PROP, signals ignored
  });
});

describe("scoreResumeConsumption", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("green when state/resume.json mtime within 3 days", async () => {
    root = seedFixture({});
    // create state/resume.json with current mtime
    const statePath = join(root, ".cairndex", "state");
    await fs.mkdir(statePath, { recursive: true });
    await fs.writeFile(join(statePath, "resume.json"), '{"generated":true}');
    const r = await scoreResumeConsumption({ cwd: root, today: new Date() });
    expect(r.level).toBe("green");
  });

  it("yellow when state/resume.json missing", async () => {
    root = seedFixture({});
    const r = await scoreResumeConsumption({ cwd: root });
    expect(r.level).toBe("yellow");
  });

  it("yellow when state/resume.json mtime older than 3 days", async () => {
    root = seedFixture({});
    const statePath = join(root, ".cairndex", "state");
    await fs.mkdir(statePath, { recursive: true });
    const filePath = join(statePath, "resume.json");
    await fs.writeFile(filePath, '{"generated":true}');
    // backdate mtime 5 days
    const oldTime = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await fs.utimes(filePath, oldTime, oldTime);
    const r = await scoreResumeConsumption({ cwd: root });
    expect(r.level).toBe("yellow");
  });
});

describe("scoreAllStoryCoverage", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("returns all 5 indicators in stable order", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1000", narrative_status: "confirmed" }],
      tasks: [
        {
          id: "TASK-A",
          title: "x",
          status: "in_progress",
          next_action: "y",
          updated: "2026-05-05",
        },
      ],
      currentTask: "TASK-A",
    });
    const indicators = await scoreAllStoryCoverage({
      cwd: root,
      today: new Date("2026-05-05T12:00:00Z"),
    });
    expect(indicators).toHaveLength(5);
    expect(indicators.map((i) => i.name)).toEqual([
      "recent-narrative",
      "active-task-progress",
      "next-action-defined",
      "inbox-hygiene",
      "resume-consumption",
    ]);
  });
});
