import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { prefillCloseOut } from "../../src/closeout/prefill.js";
import { seedFixture } from "../_utils/fixture.js";

describe("prefillCloseOut", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  describe("Q1 — didFinish", () => {
    it("returns a non-empty heuristic summary based on session tool stats", async () => {
      root = seedFixture({
        sessions: [
          {
            id: "2026-05-05-1200",
            summary: "",
            narrative_status: "empty",
            body: "## Tool calls\n\nEdit×3 Write×1 Bash×4 Read×8\n",
          },
        ],
      });
      const draft = await prefillCloseOut({ cwd: root, sessionId: "2026-05-05-1200" });
      expect(draft.didFinish.length).toBeGreaterThan(0);
      // Loose match: should mention edits, writes, or "session" or "tool"
      expect(draft.didFinish.toLowerCase()).toMatch(/edit|write|session|tool/);
    });

    it("returns an empty (or 'no narrative') string when session has no tool stats", async () => {
      root = seedFixture({
        sessions: [
          {
            id: "2026-05-05-1200",
            summary: "",
            narrative_status: "empty",
            body: "## What I did\n\n(TODO: describe the work in 1–3 bullets.)\n",
          },
        ],
      });
      const draft = await prefillCloseOut({ cwd: root, sessionId: "2026-05-05-1200" });
      // Acceptable: empty string, or a brief placeholder
      expect(draft.didFinish.length).toBeLessThan(120); // not garbage
    });
  });

  describe("Q2 — decisionOrLearning", () => {
    it("is always blank", async () => {
      root = seedFixture({
        sessions: [{ id: "2026-05-05-1200", summary: "", narrative_status: "empty" }],
      });
      const draft = await prefillCloseOut({ cwd: root, sessionId: "2026-05-05-1200" });
      expect(draft.decisionOrLearning).toBe("");
    });
  });

  describe("Q3 — nextStep", () => {
    it("returns intent file value when present", async () => {
      root = seedFixture({
        sessions: [{ id: "2026-05-05-1200", summary: "", narrative_status: "empty" }],
        intentSteps: ["finish refactor", "write tests", "smoke"],
      });
      const draft = await prefillCloseOut({ cwd: root, sessionId: "2026-05-05-1200" });
      // Acceptable: any/all of the steps. The function might join them or pick the first.
      expect(draft.nextStep.length).toBeGreaterThan(0);
      expect(draft.nextStep).toMatch(/finish refactor|write tests|smoke/);
    });

    it("falls back to active task next_action when no intent", async () => {
      root = seedFixture({
        sessions: [{ id: "2026-05-05-1200", summary: "", narrative_status: "empty" }],
        tasks: [
          {
            id: "TASK-099",
            title: "x",
            status: "in_progress",
            next_action: "do thing",
            updated: "2026-05-05",
          },
        ],
        currentTask: "TASK-099",
      });
      const draft = await prefillCloseOut({ cwd: root, sessionId: "2026-05-05-1200" });
      expect(draft.nextStep).toBe("do thing");
    });

    it("returns empty string when neither intent nor task next_action exists", async () => {
      root = seedFixture({
        sessions: [{ id: "2026-05-05-1200", summary: "", narrative_status: "empty" }],
      });
      const draft = await prefillCloseOut({ cwd: root, sessionId: "2026-05-05-1200" });
      expect(draft.nextStep).toBe("");
    });

    it("prefers intent over task next_action when BOTH exist", async () => {
      root = seedFixture({
        sessions: [{ id: "2026-05-05-1200", summary: "", narrative_status: "empty" }],
        tasks: [
          {
            id: "TASK-100",
            title: "y",
            status: "in_progress",
            next_action: "from task",
            updated: "2026-05-05",
          },
        ],
        currentTask: "TASK-100",
        intentSteps: ["from intent"],
      });
      const draft = await prefillCloseOut({ cwd: root, sessionId: "2026-05-05-1200" });
      expect(draft.nextStep).toMatch(/from intent/);
    });
  });

  describe("missing session", () => {
    it("returns sensible defaults when sessionId does not exist", async () => {
      root = seedFixture({});
      const draft = await prefillCloseOut({ cwd: root, sessionId: "missing" });
      expect(draft.didFinish).toBe("");
      expect(draft.decisionOrLearning).toBe("");
      expect(draft.nextStep).toBe("");
    });
  });
});
