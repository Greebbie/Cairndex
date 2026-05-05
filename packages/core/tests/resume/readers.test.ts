import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readActiveTask,
  readLastSession,
  readPendingMemory,
  readSuggestedNext,
  readWhyContext,
} from "../../src/resume/readers.js";
import { seedFixture } from "../_utils/fixture.js";

let root: string;

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// readLastSession
// ---------------------------------------------------------------------------

describe("readLastSession", () => {
  it("returns the newest session by id when multiple sessions exist", async () => {
    root = seedFixture({
      sessions: [
        { id: "2026-05-04-1200", summary: "old session", narrative_status: "confirmed" },
        { id: "2026-05-05-0900", summary: "", narrative_status: "empty" },
      ],
    });

    const last = await readLastSession({ cwd: root });
    expect(last?.id).toBe("2026-05-05-0900");
    expect(last?.narrativeStatus).toBe("empty");
    expect(last?.summary).toBe("");
    expect(last?.date).toBe("2026-05-05");
  });

  it("returns null when no sessions exist", async () => {
    root = seedFixture({});
    const last = await readLastSession({ cwd: root });
    expect(last).toBeNull();
  });

  it("returns the only session when there is exactly one", async () => {
    root = seedFixture({
      sessions: [
        { id: "2026-05-05-1200", summary: "just one", narrative_status: "auto" },
      ],
    });
    const last = await readLastSession({ cwd: root });
    expect(last?.id).toBe("2026-05-05-1200");
    expect(last?.narrativeStatus).toBe("auto");
    expect(last?.summary).toBe("just one");
  });
});

// ---------------------------------------------------------------------------
// readActiveTask
// ---------------------------------------------------------------------------

describe("readActiveTask", () => {
  it("returns task id, title, nextAction, and age in days", async () => {
    root = seedFixture({
      tasks: [
        {
          id: "TASK-002",
          title: "build resume",
          status: "in_progress",
          next_action: "implement readers",
          updated: "2026-05-03",
        },
      ],
    });

    const task = await readActiveTask({ cwd: root, today: new Date("2026-05-05") });
    expect(task?.id).toBe("TASK-002");
    expect(task?.title).toBe("build resume");
    expect(task?.nextAction).toBe("implement readers");
    expect(task?.ageDays).toBe(2);
    expect(task?.status).toBe("in_progress");
  });

  it("returns null when no in_progress or pending tasks exist", async () => {
    root = seedFixture({
      tasks: [
        { id: "TASK-001", title: "done task", status: "done", updated: "2026-05-01" },
      ],
    });
    const task = await readActiveTask({ cwd: root });
    expect(task).toBeNull();
  });

  it("prefers in_progress over pending", async () => {
    root = seedFixture({
      tasks: [
        { id: "TASK-001", title: "pending", status: "pending", updated: "2026-05-04" },
        { id: "TASK-002", title: "active", status: "in_progress", updated: "2026-05-03" },
      ],
    });
    const task = await readActiveTask({ cwd: root });
    expect(task?.id).toBe("TASK-002");
  });

  it("returns null when vault has no tasks directory", async () => {
    root = seedFixture({});
    // tasks dir is created by seedFixture but has no files — expect null
    const task = await readActiveTask({ cwd: root });
    expect(task).toBeNull();
  });

  it("returns nextAction as null when the field is absent from frontmatter", async () => {
    root = seedFixture({
      tasks: [{ id: "TASK-003", title: "no action", status: "in_progress", updated: "2026-05-05" }],
    });
    const task = await readActiveTask({ cwd: root });
    expect(task?.nextAction).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readWhyContext
// ---------------------------------------------------------------------------

describe("readWhyContext", () => {
  it("returns the ADR that has a typed link targeting the active task", async () => {
    root = seedFixture({
      decisions: [
        {
          id: "ADR-001",
          title: "Use flat file vault",
          status: "accepted",
          links: [{ type: "addresses", target: "TASK-003" }],
        },
      ],
    });

    const why = await readWhyContext({ cwd: root, taskId: "TASK-003" });
    expect(why?.kind).toBe("decision");
    expect(why?.id).toBe("ADR-001");
    expect(why?.title).toBe("Use flat file vault");
  });

  it("falls back to insights when no ADR links to the task", async () => {
    root = seedFixture({
      insights: [
        {
          id: "INS-001",
          title: "Resume view should be derived",
          status: "stable",
          links: [{ type: "addresses", target: "TASK-007" }],
        },
      ],
    });

    const why = await readWhyContext({ cwd: root, taskId: "TASK-007" });
    expect(why?.kind).toBe("insight");
    expect(why?.id).toBe("INS-001");
  });

  it("returns null when no ADR or insight links to the task", async () => {
    root = seedFixture({
      decisions: [
        {
          id: "ADR-001",
          title: "Unrelated",
          links: [{ type: "implements", target: "SPEC-001" }],
        },
      ],
    });
    const why = await readWhyContext({ cwd: root, taskId: "TASK-999" });
    expect(why).toBeNull();
  });

  it("returns null when no decisions or insights exist", async () => {
    root = seedFixture({});
    const why = await readWhyContext({ cwd: root, taskId: "TASK-001" });
    expect(why).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readSuggestedNext
// ---------------------------------------------------------------------------

describe("readSuggestedNext", () => {
  it("returns the first intent step when an intent file is present", async () => {
    root = seedFixture({
      intentSteps: ["implement readers", "run tests", "stage files"],
    });

    const next = await readSuggestedNext({ cwd: root });
    expect(next).toBe("implement readers");
  });

  it("falls back to active task next_action when no intent file exists", async () => {
    root = seedFixture({});

    const fakeTask = {
      id: "TASK-001",
      title: "build",
      status: "in_progress",
      nextAction: "write unit tests",
      ageDays: 0,
    };

    const next = await readSuggestedNext({ cwd: root }, fakeTask);
    expect(next).toBe("write unit tests");
  });

  it("returns null when neither intent nor active task next_action exists", async () => {
    root = seedFixture({});
    const next = await readSuggestedNext({ cwd: root }, null);
    expect(next).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readPendingMemory
// ---------------------------------------------------------------------------

describe("readPendingMemory", () => {
  it("counts only pending proposals and excludes rejected ones", async () => {
    root = seedFixture({
      inboxProposals: [
        { id: "PROP-100", status: "pending", title: "the pending one" },
        { id: "PROP-101", status: "rejected", title: "rejected proposal" },
      ],
    });

    const pending = await readPendingMemory({ cwd: root });
    expect(pending.count).toBe(1);
    expect(pending.titles).toEqual(["the pending one"]);
  });

  it("returns count=0 and empty titles when no pending proposals exist", async () => {
    root = seedFixture({
      inboxProposals: [
        { id: "PROP-001", status: "accepted", title: "already done" },
      ],
    });

    const pending = await readPendingMemory({ cwd: root });
    expect(pending.count).toBe(0);
    expect(pending.titles).toEqual([]);
  });

  it("does not read from signals/ directory", async () => {
    root = seedFixture({
      inboxProposals: [{ id: "PROP-200", status: "pending", title: "real proposal" }],
      signals: [{ id: "SIG-001", source: "auto-distill" }],
    });

    const pending = await readPendingMemory({ cwd: root });
    // Only the PROP counts, not the signal
    expect(pending.count).toBe(1);
    expect(pending.titles).toEqual(["real proposal"]);
  });

  it("caps titles at 5 even when there are more than 5 pending proposals", async () => {
    root = seedFixture({
      inboxProposals: [
        { id: "PROP-001", status: "pending", title: "a" },
        { id: "PROP-002", status: "pending", title: "b" },
        { id: "PROP-003", status: "pending", title: "c" },
        { id: "PROP-004", status: "pending", title: "d" },
        { id: "PROP-005", status: "pending", title: "e" },
        { id: "PROP-006", status: "pending", title: "f" },
      ],
    });

    const pending = await readPendingMemory({ cwd: root });
    expect(pending.count).toBe(6);
    expect(pending.titles).toHaveLength(5);
  });

  it("returns count=0 when inbox proposals directory is absent", async () => {
    root = seedFixture({});
    const pending = await readPendingMemory({ cwd: root });
    expect(pending.count).toBe(0);
    expect(pending.titles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// source tracking
// ---------------------------------------------------------------------------

describe("source tracking", () => {
  it("readLastSession pushes the session file path into sources", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1000", summary: "test", narrative_status: "auto" }],
    });

    const sources: string[] = [];
    await readLastSession({ cwd: root, sources });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatch(/sessions[\\/]2026-05-05-1000\.md$/);
  });

  it("readActiveTask pushes the task file path into sources", async () => {
    root = seedFixture({
      tasks: [{ id: "TASK-001", status: "in_progress", updated: "2026-05-05" }],
    });

    const sources: string[] = [];
    await readActiveTask({ cwd: root, sources });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatch(/tasks[\\/]TASK-001\.md$/);
  });

  it("readPendingMemory pushes each pending proposal file path into sources", async () => {
    root = seedFixture({
      inboxProposals: [
        { id: "PROP-001", status: "pending", title: "one" },
        { id: "PROP-002", status: "pending", title: "two" },
      ],
    });

    const sources: string[] = [];
    await readPendingMemory({ cwd: root, sources });
    expect(sources).toHaveLength(2);
    expect(sources.every((s) => s.includes("proposed-memory-updates"))).toBe(true);
  });

  it("all source paths are absolute", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1200", summary: "s", narrative_status: "empty" }],
      tasks: [{ id: "TASK-005", status: "in_progress", updated: "2026-05-05" }],
      inboxProposals: [{ id: "PROP-010", status: "pending", title: "p" }],
    });

    const sources: string[] = [];
    await readLastSession({ cwd: root, sources });
    await readActiveTask({ cwd: root, sources });
    await readPendingMemory({ cwd: root, sources });

    for (const s of sources) {
      // Absolute paths start with / on POSIX or a drive letter on Windows
      expect(s).toMatch(/^(?:[A-Za-z]:[\\/]|\/)/);
    }
  });
});
