import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";
import { seedFixture } from "../../core/tests/_utils/fixture.js";

let root = "";

afterEach(() => {
  root = "";
});

describe("GET /api/vault/:alias/resume", () => {
  it("returns the wrapped resume view for a known alias", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1000", summary: "did X", narrative_status: "confirmed" }],
      tasks: [
        {
          id: "TASK-007",
          title: "ship",
          status: "in_progress",
          next_action: "test",
          updated: "2026-05-05",
        },
      ],
      currentTask: "TASK-007",
    });
    const app = await createServer({
      projects: [{ path: root, alias: "test", registered_at: "2026-05-05T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/vault/test/resume" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as {
      generated: boolean;
      builtAt: string;
      sources: string[];
      view: { lastSession?: { id: string } | null; activeTask?: { id: string } | null };
    };
    expect(body.generated).toBe(true);
    expect(body.builtAt).toBeTruthy();
    expect(Array.isArray(body.sources)).toBe(true);
    expect(body.view.lastSession?.id).toBe("2026-05-05-1000");
    expect(body.view.activeTask?.id).toBe("TASK-007");
    await app.close();
  });

  it("returns 404 for an unknown alias", async () => {
    const app = await createServer({ projects: [] });
    const r = await app.inject({ method: "GET", url: "/api/vault/nope/resume" });
    expect(r.statusCode).toBe(404);
    await app.close();
  });

  it("writes state/resume.json + state/resume.md as a side effect", async () => {
    root = seedFixture({});
    const app = await createServer({
      projects: [{ path: root, alias: "test", registered_at: "2026-05-05T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/vault/test/resume" });
    expect(r.statusCode).toBe(200);
    expect(existsSync(join(root, ".cairndex", "state", "resume.json"))).toBe(true);
    expect(existsSync(join(root, ".cairndex", "state", "resume.md"))).toBe(true);
    await app.close();
  });
});
