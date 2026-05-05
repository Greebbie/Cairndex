import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-srv-handoff-"));
  mkdirSync(join(tmp, ".cairndex/tasks"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/changes"), { recursive: true });
  writeFileSync(join(tmp, ".cairndex/config.yaml"), "schemaVersion: 1\n", "utf8");
  writeFileSync(
    join(tmp, ".cairndex/index.md"),
    "---\nphase: implementing\ncurrent_task: TASK-001\n---\n# Index\n",
    "utf8",
  );
  writeFileSync(
    join(tmp, ".cairndex/tasks/TASK-001.md"),
    "---\nid: TASK-001\ntitle: Done\nstatus: done\ncreated: 2026-05-01\nupdated: 2026-05-01\nprovenance:\n  created_by: test\n  session: manual\nverification:\n  run: seeded\n---\nbody\n",
    "utf8",
  );
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("POST /api/vault/:alias/handoff/repair", () => {
  it("applies safe handoff repairs and returns before/after readiness", async () => {
    const app = await createServer({
      projects: [{ path: tmp, alias: "demo", registered_at: "2026-05-02T00:00:00Z" }],
    });
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/demo/handoff/repair",
      payload: {},
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as {
      before: { level: string };
      after: { level: string; checks: Array<{ detail: string }> };
      actions: Array<{ id: string; status: string }>;
      packPath: string | null;
    };
    expect(body.before.level).toBe("blocked");
    expect(body.actions.some((a) => a.id === "repair-current-task-pointer")).toBe(true);
    expect(body.packPath && existsSync(body.packPath)).toBeTruthy();
    expect(body.after.checks.some((c) => c.detail.includes("TASK-001"))).toBe(false);
    await app.close();
  });
});
