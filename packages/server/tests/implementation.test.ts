import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-srv-impl-"));
  mkdirSync(join(tmp, ".cairndex/tasks"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/indexes"), { recursive: true });
  writeFileSync(join(tmp, ".cairndex/config.yaml"), "schemaVersion: 1\n");
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function makeApp() {
  return await createServer({
    projects: [{ path: tmp, alias: "demo", registered_at: "2026-05-02T00:00:00Z" }],
  });
}

describe("GET /api/vault/:alias/implementation", () => {
  it("returns the cached index when present", async () => {
    // Write a hand-crafted cache that the route should read verbatim.
    writeFileSync(
      join(tmp, ".cairndex/indexes/implementation-line.json"),
      JSON.stringify({
        generatedAt: "2026-05-02T00:00:00Z",
        entries: [
          {
            taskId: "TASK-001",
            title: "From cache",
            status: "done",
            created: "2026-05-01",
            updated: "2026-05-02",
            completed: "2026-05-02",
            sessionId: null,
            planId: "PLAN-001",
          },
        ],
        byPlan: { "PLAN-001": ["TASK-001"] },
      }),
      "utf8",
    );
    const app = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/implementation" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { entries: Array<{ taskId: string; title: string }> };
    expect(body.entries[0]?.title).toBe("From cache");
    await app.close();
  });

  it("falls through to a live build when the cache file is missing", async () => {
    writeFileSync(
      join(tmp, ".cairndex/tasks/TASK-001.md"),
      "---\nid: TASK-001\ntitle: Live\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
      "utf8",
    );
    const app = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/implementation" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { entries: Array<{ taskId: string }>; byPlan: Record<string, string[]> };
    expect(body.entries.map((e) => e.taskId)).toEqual(["TASK-001"]);
    expect(body.byPlan["(unlinked)"]).toEqual(["TASK-001"]);
    await app.close();
  });

  it("returns 404 for an unknown alias", async () => {
    const app = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/vault/no-such-alias/implementation" });
    expect(r.statusCode).toBe(404);
    await app.close();
  });
});
