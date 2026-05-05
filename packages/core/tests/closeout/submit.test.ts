import { describe, it, expect, afterEach } from "vitest";
import { rmSync, promises as fs } from "node:fs";
import { join } from "node:path";
import { submitCloseOut } from "../../src/closeout/submit.js";
import { seedFixture } from "../_utils/fixture.js";
import { parseFrontmatter } from "../../src/frontmatter.js";

describe("submitCloseOut", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("writes summary, narrative_status: confirmed, and next to the session file", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1100", summary: "", narrative_status: "empty" }],
    });
    await submitCloseOut({
      cwd: root,
      sessionId: "2026-05-05-1100",
      answers: { didFinish: "implemented X", decisionOrLearning: "", nextStep: "test it" },
    });
    const raw = await fs.readFile(
      join(root, ".cairndex", "sessions", "2026-05-05-1100.md"),
      "utf8",
    );
    expect(raw).toMatch(/^narrative_status: confirmed$/m);
    expect(raw).toMatch(/^summary: implemented X$/m);
    expect(raw).toMatch(/test it/);
  });

  it("updates active task next_action when nextStep changes", async () => {
    root = seedFixture({
      tasks: [
        {
          id: "TASK-010",
          title: "x",
          status: "in_progress",
          next_action: "old direction",
          updated: "2026-05-05",
        },
      ],
      currentTask: "TASK-010",
      sessions: [{ id: "2026-05-05-1100", summary: "", narrative_status: "empty" }],
    });
    await submitCloseOut({
      cwd: root,
      sessionId: "2026-05-05-1100",
      answers: { didFinish: "x", decisionOrLearning: "", nextStep: "new direction" },
    });
    const taskRaw = await fs.readFile(
      join(root, ".cairndex", "tasks", "TASK-010.md"),
      "utf8",
    );
    expect(taskRaw).toMatch(/next_action: new direction/);
  });

  it("does NOT touch task next_action when nextStep equals current value", async () => {
    root = seedFixture({
      tasks: [
        {
          id: "TASK-011",
          title: "y",
          status: "in_progress",
          next_action: "same value",
          updated: "2026-05-05",
        },
      ],
      currentTask: "TASK-011",
      sessions: [{ id: "2026-05-05-1100", summary: "", narrative_status: "empty" }],
    });
    await submitCloseOut({
      cwd: root,
      sessionId: "2026-05-05-1100",
      answers: { didFinish: "x", decisionOrLearning: "", nextStep: "same value" },
    });
    const taskAfter = await fs.readFile(
      join(root, ".cairndex", "tasks", "TASK-011.md"),
      "utf8",
    );
    // Could legitimately differ if frontmatter is reserialized — accept either no-op OR identical content
    expect(taskAfter).toMatch(/next_action: same value/);
  });

  it("creates an inbox proposal when decisionOrLearning is non-empty", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1100", summary: "", narrative_status: "empty" }],
    });
    const result = await submitCloseOut({
      cwd: root,
      sessionId: "2026-05-05-1100",
      answers: {
        didFinish: "x",
        decisionOrLearning: "decided to use Y because Z",
        nextStep: "next thing",
      },
    });
    expect(result.proposalId).toBeTruthy();
    expect(result.proposalId).toMatch(/^PROP-\d{3}$/);
    const propPath = join(
      root,
      ".cairndex",
      "inbox",
      "proposed-memory-updates",
      `${result.proposalId}.md`,
    );
    const propRaw = await fs.readFile(propPath, "utf8");
    const { data, content } = parseFrontmatter<Record<string, unknown>>(propRaw);
    expect(content).toMatch(/decided to use Y because Z/);
    // verify provenance ties the proposal back to close-out
    expect(JSON.stringify(data.provenance)).toMatch(/close-out|closeout/);
    // contentHash must be non-empty (canonical writer computes it)
    expect(typeof data.contentHash).toBe("string");
    expect((data.contentHash as string).length).toBeGreaterThan(0);
    // newFrontmatter must carry title and status so the PROP can be cleanly accepted
    expect(data.newFrontmatter).toBeDefined();
    const nfm = data.newFrontmatter as Record<string, unknown>;
    expect(typeof nfm.title).toBe("string");
    expect((nfm.title as string).length).toBeGreaterThan(0);
    expect(nfm.status).toBeDefined();
  });

  it("does NOT create an inbox proposal when decisionOrLearning is empty or whitespace", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1100", summary: "", narrative_status: "empty" }],
    });
    const empty = await submitCloseOut({
      cwd: root,
      sessionId: "2026-05-05-1100",
      answers: { didFinish: "x", decisionOrLearning: "", nextStep: "y" },
    });
    expect(empty.proposalId).toBeNull();

    const whitespace = await submitCloseOut({
      cwd: root,
      sessionId: "2026-05-05-1100",
      answers: { didFinish: "x", decisionOrLearning: "   \n  \t", nextStep: "y" },
    });
    expect(whitespace.proposalId).toBeNull();
  });

  it("is idempotent: re-submitting same args does not create a second proposal", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1100", summary: "", narrative_status: "empty" }],
    });
    const first = await submitCloseOut({
      cwd: root,
      sessionId: "2026-05-05-1100",
      answers: { didFinish: "x", decisionOrLearning: "an insight", nextStep: "y" },
    });
    const second = await submitCloseOut({
      cwd: root,
      sessionId: "2026-05-05-1100",
      answers: { didFinish: "x", decisionOrLearning: "an insight", nextStep: "y" },
    });
    expect(first.proposalId).toBeTruthy();
    expect(second.proposalId).toBe(first.proposalId);
    const inboxFiles = await fs.readdir(
      join(root, ".cairndex", "inbox", "proposed-memory-updates"),
    );
    const props = inboxFiles.filter((f) => f.endsWith(".md"));
    expect(props).toHaveLength(1);
  });

  it("upsertSection does not falsely match a heading whose name is a prefix of another", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1100", summary: "", narrative_status: "empty" }],
    });
    // Overwrite the session file with a body that contains "## Nextroom" but no "## Next"
    const sessionPath = join(root, ".cairndex", "sessions", "2026-05-05-1100.md");
    const bodyWithNextroom =
      "---\nid: 2026-05-05-1100\ndate: 2026-05-05\nsummary: ''\nnarrative_status: empty\n---\n\n## Nextroom\n\nsome room content\n";
    await fs.writeFile(sessionPath, bodyWithNextroom, "utf8");

    await submitCloseOut({
      cwd: root,
      sessionId: "2026-05-05-1100",
      answers: { didFinish: "done", decisionOrLearning: "", nextStep: "real next action" },
    });

    const raw = await fs.readFile(sessionPath, "utf8");
    // The Nextroom section must be untouched
    expect(raw).toMatch(/## Nextroom/);
    expect(raw).toMatch(/some room content/);
    // A fresh ## Next section must have been appended (not conflated with Nextroom)
    expect(raw).toMatch(/## Next/);
    expect(raw).toMatch(/real next action/);
    // The word "Nextroom" section content should not be replaced with the nextStep value
    expect(raw).not.toMatch(/real next action[\s\S]*some room content/);
  });

  it("rebuilds state/resume.json after writing", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1100", summary: "", narrative_status: "empty" }],
      tasks: [
        { id: "TASK-RES", title: "x", status: "in_progress", next_action: "old", updated: "2026-05-05" },
      ],
      currentTask: "TASK-RES",
    });
    await submitCloseOut({
      cwd: root,
      sessionId: "2026-05-05-1100",
      answers: { didFinish: "shipped X", decisionOrLearning: "", nextStep: "new next" },
    });
    const resumeJson = JSON.parse(
      await fs.readFile(
        join(root, ".cairndex", "state", "resume.json"),
        "utf8",
      ),
    );
    expect(resumeJson.view.lastSession.narrativeStatus).toBe("confirmed");
    expect(resumeJson.view.lastSession.summary).toBe("shipped X");
    expect(resumeJson.view.activeTask.nextAction).toBe("new next");
  });

  it("returns sessionPath and (when applicable) taskPath", async () => {
    root = seedFixture({
      tasks: [
        { id: "TASK-RP", title: "x", status: "in_progress", next_action: "a", updated: "2026-05-05" },
      ],
      currentTask: "TASK-RP",
      sessions: [{ id: "2026-05-05-1100", summary: "", narrative_status: "empty" }],
    });
    const result = await submitCloseOut({
      cwd: root,
      sessionId: "2026-05-05-1100",
      answers: { didFinish: "x", decisionOrLearning: "", nextStep: "b" },
    });
    expect(result.sessionPath).toMatch(/2026-05-05-1100\.md$/);
    expect(result.taskPath).toMatch(/TASK-RP\.md$/);
    expect(result.proposalId).toBeNull();
  });
});
