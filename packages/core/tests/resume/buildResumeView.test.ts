import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { buildResumeView } from "../../src/resume/buildResumeView.js";
import { seedFixture } from "../_utils/fixture.js";

describe("buildResumeView", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("aggregates all readers into a ResumeView with sources + builtAt", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1000", summary: "did X", narrative_status: "confirmed" }],
      tasks: [
        {
          id: "TASK-003",
          title: "ship",
          status: "in_progress",
          next_action: "write tests",
          updated: "2026-05-05",
        },
      ],
      currentTask: "TASK-003",
      inboxProposals: [{ id: "PROP-200", status: "pending", summary: "rethink Y" }],
    });
    const view = await buildResumeView({ cwd: root, today: new Date("2026-05-05T12:00:00Z") });
    expect(view.lastSession?.id).toBe("2026-05-05-1000");
    expect(view.activeTask?.id).toBe("TASK-003");
    expect(view.activeTask?.nextAction).toBe("write tests");
    expect(view.suggestedNext).toBe("write tests"); // falls back from intent → task next_action
    expect(view.pendingMemory.count).toBe(1);
    expect(view.pendingMemory.titles).toEqual(["rethink Y"]);
    expect(view.coverageFlags).toEqual([]); // Phase 5 fills this
    expect(view.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(view.sources.length).toBeGreaterThan(0);
  });

  it("returns view with all-null fields and empty pendingMemory when vault is empty", async () => {
    root = seedFixture({});
    const view = await buildResumeView({ cwd: root });
    expect(view.lastSession).toBeNull();
    expect(view.activeTask).toBeNull();
    expect(view.whyContext).toBeNull();
    expect(view.suggestedNext).toBeNull();
    expect(view.pendingMemory.count).toBe(0);
    expect(view.pendingMemory.titles).toEqual([]);
    expect(view.coverageFlags).toEqual([]);
    expect(view.sources).toEqual([]);
  });

  it("populates whyContext only when an ADR/insight links to the active task", async () => {
    root = seedFixture({
      tasks: [
        {
          id: "TASK-100",
          title: "ship Y",
          status: "in_progress",
          next_action: "do thing",
          updated: "2026-05-05",
        },
      ],
      currentTask: "TASK-100",
      decisions: [
        {
          id: "ADR-007",
          title: "use approach Z",
          links: [{ type: "addresses", target: "TASK-100" }],
        },
      ],
    });
    const view = await buildResumeView({ cwd: root });
    expect(view.whyContext?.id).toBe("ADR-007");
    expect(view.whyContext?.kind).toBe("decision");
  });

  it("uses provided today for ageDays calculation deterministically", async () => {
    root = seedFixture({
      tasks: [
        {
          id: "TASK-AGE",
          title: "x",
          status: "in_progress",
          next_action: "y",
          updated: "2026-05-01",
        },
      ],
      currentTask: "TASK-AGE",
    });
    const view = await buildResumeView({ cwd: root, today: new Date("2026-05-04T00:00:00Z") });
    expect(view.activeTask?.ageDays).toBe(3);
  });

  it("collects sources from every reader that read a file", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1000", summary: "x", narrative_status: "empty" }],
      tasks: [
        {
          id: "TASK-S",
          title: "x",
          status: "in_progress",
          next_action: "y",
          updated: "2026-05-05",
        },
      ],
      currentTask: "TASK-S",
      inboxProposals: [{ id: "PROP-S", status: "pending", summary: "z" }],
    });
    const view = await buildResumeView({ cwd: root });
    // sources should include at least: the session, the task, the inbox file
    const allSources = view.sources.join("\n");
    expect(allSources).toMatch(/sessions[\\/]2026-05-05-1000\.md/);
    expect(allSources).toMatch(/tasks[\\/]TASK-S\.md/);
    expect(allSources).toMatch(/PROP-S\.md/);
  });
});
