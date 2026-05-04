import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-srv-workflow-"));
  mkdirSync(join(tmp, ".cairndex/tasks"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/changes"), { recursive: true });
  writeFileSync(join(tmp, ".cairndex/config.yaml"), "schemaVersion: 1\n");
  writeFileSync(
    join(tmp, ".cairndex/index.md"),
    "---\nphase: planning\nphase_since: 2026-05-01\n---\n# Project\n",
    "utf8",
  );
  writeFileSync(
    join(tmp, ".cairndex/tasks/TASK-001.md"),
    "---\nid: TASK-001\ntitle: Bump vite\nstatus: in_progress\ncreated: 2026-05-01\nupdated: 2026-05-02\n---\nbody\n",
    "utf8",
  );
  writeFileSync(
    join(tmp, ".cairndex/tasks/TASK-002.md"),
    "---\nid: TASK-002\ntitle: Wire dashboard buttons\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nbody\n",
    "utf8",
  );
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function makeApp() {
  return await createServer({
    projects: [{ path: tmp, alias: "demo", registered_at: "2026-05-02T00:00:00Z" }],
  });
}

describe("POST /api/vault/:alias/task/switch", () => {
  it("promotes the target task to in_progress and demotes the previous in_progress to pending", async () => {
    const app = await makeApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/demo/task/switch",
      payload: { taskId: "TASK-002" },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as {
      changed: Array<{ id: string; from: string; to: string }>;
      summary: string;
    };
    expect(body.summary).toMatch(/TASK-002/);
    // Two changed entries: TASK-001 demoted, TASK-002 promoted.
    const ids = body.changed.map((c) => c.id).sort();
    expect(ids).toEqual(["TASK-001", "TASK-002"]);
    // Confirm files actually mutated.
    const t1 = readFileSync(join(tmp, ".cairndex/tasks/TASK-001.md"), "utf8");
    const t2 = readFileSync(join(tmp, ".cairndex/tasks/TASK-002.md"), "utf8");
    expect(t1).toMatch(/status:\s*pending/);
    expect(t2).toMatch(/status:\s*in_progress/);
    await app.close();
  });

  it("rejects missing taskId with 400 (zod validation)", async () => {
    const app = await makeApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/demo/task/switch",
      payload: {},
    });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when the task id is unknown", async () => {
    const app = await makeApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/demo/task/switch",
      payload: { taskId: "TASK-999" },
    });
    expect(r.statusCode).toBe(400);
    const body = r.json() as { error: string };
    expect(body.error).toMatch(/TASK-999/);
    await app.close();
  });

  it("returns 404 for an unknown alias", async () => {
    const app = await makeApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/no-such-alias/task/switch",
      payload: { taskId: "TASK-001" },
    });
    expect(r.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /api/vault/:alias/task/complete", () => {
  it("with explicit taskId, marks that task done and writes completed: today", async () => {
    const app = await makeApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/demo/task/complete",
      payload: { taskId: "TASK-001" },
    });
    expect(r.statusCode).toBe(200);
    const file = readFileSync(join(tmp, ".cairndex/tasks/TASK-001.md"), "utf8");
    expect(file).toMatch(/status:\s*done/);
    // YAML serializer emits the date wrapped in quotes (`completed: '2026-05-03'`).
    // The optional quote class accepts either form.
    expect(file).toMatch(/completed:\s*['"]?\d{4}-\d{2}-\d{2}/);
    await app.close();
  });

  it("with no taskId, completes the active context's current task", async () => {
    const app = await makeApp();
    // TASK-001 is in_progress per the fixture, so the active-context picker
    // resolves currentTask = TASK-001.
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/demo/task/complete",
      payload: {},
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { changed: Array<{ id: string }> };
    expect(body.changed.map((c) => c.id)).toContain("TASK-001");
    await app.close();
  });

  it("returns 400 when completing an already-done task", async () => {
    const app = await makeApp();
    await app.inject({
      method: "POST",
      url: "/api/vault/demo/task/complete",
      payload: { taskId: "TASK-001" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/vault/demo/task/complete",
      payload: { taskId: "TASK-001" },
    });
    expect(second.statusCode).toBe(400);
    await app.close();
  });
});

describe("POST /api/vault/:alias/phase/set", () => {
  it("updates the index.md phase and bumps phase_since", async () => {
    const app = await makeApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/demo/phase/set",
      payload: { phase: "implementing" },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { from: string | null; to: string; since: string };
    expect(body.from).toBe("planning");
    expect(body.to).toBe("implementing");
    expect(body.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const idx = readFileSync(join(tmp, ".cairndex/index.md"), "utf8");
    expect(idx).toMatch(/phase:\s*implementing/);
    await app.close();
  });

  it("rejects empty phase with 400 (zod validation)", async () => {
    const app = await makeApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/demo/phase/set",
      payload: { phase: "" },
    });
    expect(r.statusCode).toBe(400);
    await app.close();
  });
});
