import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-srv-pack-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  writeFileSync(
    join(tmp, ".cairndex/index.md"),
    "---\nphase: implementing\nphase_since: 2026-04-30\nnext_action: 'go'\n---\n# Index\n",
  );
  writeFileSync(
    join(tmp, ".cairndex/specs/SPEC-001.md"),
    "---\nid: SPEC-001\ntitle: Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-02\n---\nbody\n",
  );
  writeFileSync(join(tmp, ".cairndex/config.yaml"), "schemaVersion: 1\n");
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("pack routes", () => {
  it("POST /api/vault/:alias/pack composes a pack and writes the file", async () => {
    const app = await createServer({
      projects: [{ path: tmp, alias: "demo", registered_at: "2026-05-02T00:00:00Z" }],
    });
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/demo/pack",
      payload: { task: "fix web e2e" },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as Record<string, unknown>;
    expect(body.packId).toMatch(/^pack-fix-web-e2e-/);
    expect(body.path).toContain("indexes");
    expect(typeof body.body).toBe("string");
    expect(existsSync(body.path as string)).toBe(true);
    await app.close();
  });

  it("GET /api/vault/:alias/pack/:packId reads back a pack file", async () => {
    const app = await createServer({
      projects: [{ path: tmp, alias: "demo", registered_at: "2026-05-02T00:00:00Z" }],
    });
    const create = await app.inject({
      method: "POST",
      url: "/api/vault/demo/pack",
      payload: { task: "x" },
    });
    const packId = (create.json() as { packId: string }).packId;
    const r = await app.inject({ method: "GET", url: `/api/vault/demo/pack/${packId}` });
    expect(r.statusCode).toBe(200);
    const body = r.json() as Record<string, unknown>;
    expect(body.packId).toBe(packId);
    expect(typeof body.body).toBe("string");
    await app.close();
  });

  it("GET /api/vault/:alias/packs lists recent packs newest-first", async () => {
    const app = await createServer({
      projects: [{ path: tmp, alias: "demo", registered_at: "2026-05-02T00:00:00Z" }],
    });
    await app.inject({ method: "POST", url: "/api/vault/demo/pack", payload: { task: "first" } });
    await new Promise((r) => setTimeout(r, 5));
    await app.inject({ method: "POST", url: "/api/vault/demo/pack", payload: { task: "second" } });
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/packs" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { packs: { packId: string }[] };
    expect(body.packs.length).toBe(2);
    expect(body.packs[0]?.packId).toMatch(/-second-/);
    await app.close();
  });

  it("GET pack with unknown id returns 404", async () => {
    const app = await createServer({
      projects: [{ path: tmp, alias: "demo", registered_at: "2026-05-02T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/pack/pack-does-not-exist" });
    expect(r.statusCode).toBe(404);
    await app.close();
  });
});
