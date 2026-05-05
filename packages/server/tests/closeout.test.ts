import { existsSync } from "node:fs";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";
import { seedFixture } from "../../core/tests/_utils/fixture.js";

describe("close-out routes", () => {
  let root = "";
  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  describe("GET /api/vault/:alias/closeout/draft", () => {
    it("returns prefilled answers for a known session", async () => {
      root = seedFixture({
        sessions: [
          {
            id: "2026-05-05-1200",
            summary: "",
            narrative_status: "empty",
            body: "## Tool calls\n\nEdit×2 Write×1 Bash×3 Read×5\n",
          },
        ],
        tasks: [
          {
            id: "TASK-RT",
            title: "x",
            status: "in_progress",
            next_action: "ship",
            updated: "2026-05-05",
          },
        ],
        currentTask: "TASK-RT",
      });
      const app = await createServer({
        projects: [{ alias: "test", path: root, registered_at: "2026-05-05T00:00:00Z" }],
      });
      const r = await app.inject({
        method: "GET",
        url: "/api/vault/test/closeout/draft?sessionId=2026-05-05-1200",
      });
      expect(r.statusCode).toBe(200);
      const body = r.json() as {
        sessionId: string;
        draft: { didFinish: string; decisionOrLearning: string; nextStep: string };
      };
      expect(body.sessionId).toBe("2026-05-05-1200");
      expect(body.draft).toBeTruthy();
      expect(body.draft.didFinish).toMatch(/edit/i);
      expect(body.draft.decisionOrLearning).toBe("");
      expect(body.draft.nextStep).toBe("ship");
      await app.close();
    });

    it("returns 400 when sessionId query param is missing", async () => {
      const app = await createServer({
        projects: [{ alias: "test", path: "/tmp/x", registered_at: "2026-05-05T00:00:00Z" }],
      });
      const r = await app.inject({ method: "GET", url: "/api/vault/test/closeout/draft" });
      expect(r.statusCode).toBe(400);
      await app.close();
    });

    it("returns 404 for unknown alias", async () => {
      const app = await createServer({ projects: [] });
      const r = await app.inject({
        method: "GET",
        url: "/api/vault/nope/closeout/draft?sessionId=2026-05-05-1200",
      });
      expect(r.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("POST /api/vault/:alias/closeout", () => {
    it("returns SubmitCloseOutResult when body is valid", async () => {
      root = seedFixture({
        sessions: [{ id: "2026-05-05-1200", summary: "", narrative_status: "empty" }],
      });
      const app = await createServer({
        projects: [{ alias: "test", path: root, registered_at: "2026-05-05T00:00:00Z" }],
      });
      const r = await app.inject({
        method: "POST",
        url: "/api/vault/test/closeout",
        payload: {
          sessionId: "2026-05-05-1200",
          answers: { didFinish: "shipped X", decisionOrLearning: "", nextStep: "test it" },
        },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json() as {
        sessionPath: string;
        taskPath: string | null;
        proposalId: string | null;
      };
      expect(body.sessionPath).toMatch(/2026-05-05-1200\.md$/);
      expect(body.proposalId).toBeNull();
      await app.close();
    });

    it("creates an inbox proposal when decisionOrLearning is non-empty", async () => {
      root = seedFixture({
        sessions: [{ id: "2026-05-05-1200", summary: "", narrative_status: "empty" }],
      });
      const app = await createServer({
        projects: [{ alias: "test", path: root, registered_at: "2026-05-05T00:00:00Z" }],
      });
      const r = await app.inject({
        method: "POST",
        url: "/api/vault/test/closeout",
        payload: {
          sessionId: "2026-05-05-1200",
          answers: { didFinish: "x", decisionOrLearning: "decided to use Y", nextStep: "z" },
        },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json() as { proposalId: string | null };
      expect(body.proposalId).toMatch(/^PROP-\d{3}$/);
      await app.close();
    });

    it("returns 400 when payload is malformed (missing answers)", async () => {
      const app = await createServer({
        projects: [{ alias: "test", path: "/tmp/x", registered_at: "2026-05-05T00:00:00Z" }],
      });
      const r = await app.inject({
        method: "POST",
        url: "/api/vault/test/closeout",
        payload: { sessionId: "x" }, // no answers
      });
      expect(r.statusCode).toBe(400);
      await app.close();
    });

    it("returns 404 for unknown alias", async () => {
      const app = await createServer({ projects: [] });
      const r = await app.inject({
        method: "POST",
        url: "/api/vault/nope/closeout",
        payload: {
          sessionId: "x",
          answers: { didFinish: "", decisionOrLearning: "", nextStep: "" },
        },
      });
      expect(r.statusCode).toBe(404);
      await app.close();
    });

    it("rebuilds state/resume.json as a side effect (via submitCloseOut)", async () => {
      root = seedFixture({
        sessions: [{ id: "2026-05-05-1200", summary: "", narrative_status: "empty" }],
      });
      const app = await createServer({
        projects: [{ alias: "test", path: root, registered_at: "2026-05-05T00:00:00Z" }],
      });
      const r = await app.inject({
        method: "POST",
        url: "/api/vault/test/closeout",
        payload: {
          sessionId: "2026-05-05-1200",
          answers: { didFinish: "shipped", decisionOrLearning: "", nextStep: "next" },
        },
      });
      expect(r.statusCode).toBe(200);
      expect(existsSync(join(root, ".cairndex", "state", "resume.json"))).toBe(true);
      await app.close();
    });
  });
});
