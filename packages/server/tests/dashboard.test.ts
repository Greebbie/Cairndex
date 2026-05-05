import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-srv-dash-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/changes"), { recursive: true });
  writeFileSync(
    join(tmp, ".cairndex/index.md"),
    "---\nphase: implementing\nphase_since: 2026-04-30\nnext_action: 'go'\n---\n# Index\n",
  );
  writeFileSync(
    join(tmp, ".cairndex/specs/SPEC-001.md"),
    "---\nid: SPEC-001\ntitle: Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-02\nprovenance:\n  created_by: claude\n  session: 2026-05-02-0125\n---\nbody\n",
  );
  writeFileSync(
    join(tmp, ".cairndex/changes/changelog.md"),
    "# Changelog\n\n- 2026-05-02 — SPEC-001 active\n",
  );
  writeFileSync(join(tmp, ".cairndex/config.yaml"), "schemaVersion: 1\n");
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("GET /api/vault/:alias/dashboard", () => {
  it("returns aggregated DashboardDTO with projectState, agentContext, memoryHealth, handoffReadiness, recentActivity", async () => {
    const app = await createServer({
      projects: [{ path: tmp, alias: "demo", registered_at: "2026-05-02T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/dashboard" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as Record<string, unknown>;
    expect(body).toHaveProperty("projectState");
    expect(body).toHaveProperty("agentContext");
    expect(body).toHaveProperty("memoryHealth");
    expect(body).toHaveProperty("handoffReadiness");
    expect(body).toHaveProperty("recentActivity");
    const ps = body.projectState as Record<string, unknown>;
    expect(ps.phase).toBe("implementing");
    expect((ps.activeSpec as { id: string }).id).toBe("SPEC-001");
    await app.close();
  });

  it("returns 404 for unknown project alias", async () => {
    const app = await createServer({ projects: [] });
    const r = await app.inject({ method: "GET", url: "/api/vault/nope/dashboard" });
    expect(r.statusCode).toBe(404);
    await app.close();
  });
});
