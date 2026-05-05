import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-srv-intent-"));
  mkdirSync(join(tmp, ".cairndex/state"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function makeApp() {
  return await createServer({
    projects: [{ path: tmp, alias: "demo", registered_at: "2026-05-02T00:00:00Z" }],
  });
}

function writeIntentFile(body: string) {
  writeFileSync(join(tmp, ".cairndex/state/current-intent.md"), body, "utf8");
}

describe("GET /api/vault/:alias/intent", () => {
  it("returns { intent: null } when no intent file exists", async () => {
    const app = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/intent" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ intent: null });
    await app.close();
  });

  it("returns the parsed IntentRecord when an intent file is present", async () => {
    writeIntentFile(
      `---
set_at: '2026-05-05T12:00:00.000Z'
task_id: TASK-001
session_id: sess-abc
---
- audit api.ts
- extract inbox hooks
- rerun tests
`,
    );
    const app = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/intent" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { intent: { steps: string[]; taskId: string; sessionId: string } };
    expect(body.intent.steps).toEqual(["audit api.ts", "extract inbox hooks", "rerun tests"]);
    expect(body.intent.taskId).toBe("TASK-001");
    expect(body.intent.sessionId).toBe("sess-abc");
    await app.close();
  });

  it("returns 404 for unknown project alias", async () => {
    const app = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/vault/nope/intent" });
    expect(r.statusCode).toBe(404);
    await app.close();
  });
});
