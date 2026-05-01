import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

describe("server scaffold", () => {
  it("createServer returns a fastify instance with /health route", async () => {
    const app = await createServer({ projects: [] });
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
    await app.close();
  });

  it("CORS is enabled for cross-origin requests", async () => {
    const app = await createServer({ projects: [] });
    const r = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: { origin: "http://localhost:5173", "access-control-request-method": "GET" },
    });
    // Fastify CORS plugin replies 204 on preflight
    expect([200, 204]).toContain(r.statusCode);
    expect(r.headers["access-control-allow-origin"]).toBeDefined();
    await app.close();
  });
});

function makeFixture(): string {
  const tmp = mkdtempSync(join(tmpdir(), "cairn-srv-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/changes"), { recursive: true });
  writeFileSync(
    join(tmp, ".cairndex/index.md"),
    "---\nphase: implementing\n---\n# Index\nActive focus: SPEC-001\n",
  );
  writeFileSync(
    join(tmp, ".cairndex/specs/SPEC-001-login.md"),
    "---\nid: SPEC-001\ntitle: Login\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n## Body\nbody\n",
  );
  writeFileSync(
    join(tmp, ".cairndex/decisions/ADR-001-x.md"),
    "---\nid: ADR-001\ntitle: X\nstatus: accepted\ncreated: 2026-04-30\nlinks:\n  - { type: implements, target: SPEC-001 }\n---\n",
  );
  writeFileSync(
    join(tmp, ".cairndex/changes/changelog.md"),
    "# Changelog\n\n- 2026-04-30 — initialized\n- 2026-04-30 — SPEC-001 added\n",
  );
  writeFileSync(join(tmp, ".cairndex/config.yaml"), "schemaVersion: 1\n");
  return tmp;
}

describe("read-only routes", () => {
  it("GET /api/projects returns the registry list", async () => {
    const app = await createServer({
      projects: [
        { path: "/tmp/p1", alias: "a", registered_at: "2026-04-30T00:00:00Z" },
        { path: "/tmp/p2", alias: "b", registered_at: "2026-04-30T00:00:00Z" },
      ],
    });
    const r = await app.inject({ method: "GET", url: "/api/projects" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([
      { path: "/tmp/p1", alias: "a", registered_at: "2026-04-30T00:00:00Z" },
      { path: "/tmp/p2", alias: "b", registered_at: "2026-04-30T00:00:00Z" },
    ]);
    await app.close();
  });

  it("GET /api/vault/:alias returns vault overview with counts and phase", async () => {
    const tmp = makeFixture();
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/vault/v" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.counts.spec).toBe(1);
    expect(body.counts.decision).toBe(1);
    expect(body.phase).toBe("implementing");
    await app.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("GET /api/vault/:alias/:type/:id returns full node + backlinks", async () => {
    const tmp = makeFixture();
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/vault/v/spec/SPEC-001" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.frontmatter.id).toBe("SPEC-001");
    expect(body.body).toContain("body");
    expect(body.backlinks).toContainEqual({
      from: "ADR-001",
      fromType: "decision",
      type: "implements",
    });
    await app.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("GET /api/vault/:alias/:type/:id returns 404 for unknown id", async () => {
    const tmp = makeFixture();
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/vault/v/spec/SPEC-999" });
    expect(r.statusCode).toBe(404);
    await app.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("GET /api/changes/:alias returns changelog events", async () => {
    const tmp = makeFixture();
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/changes/v" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.events).toHaveLength(2);
    expect(body.events[0].summary).toContain("initialized");
    await app.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("GET /api/config/:alias/project returns parsed YAML", async () => {
    const tmp = makeFixture();
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/config/v/project" });
    expect(r.statusCode).toBe(200);
    expect(r.json().schemaVersion).toBe(1);
    await app.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns 404 for unknown project alias", async () => {
    const app = await createServer({ projects: [] });
    const r = await app.inject({ method: "GET", url: "/api/vault/missing" });
    expect(r.statusCode).toBe(404);
    await app.close();
  });

  it("GET /api/vault/:alias/:type returns list of nodes with correct shape", async () => {
    const tmp = makeFixture();
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/vault/v/spec" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "SPEC-001",
      title: "Login",
      status: "active",
    });
    expect(body[0]).toHaveProperty("path");
    await app.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("GET /api/vault/:alias/:type returns 400 for invalid type", async () => {
    const tmp = makeFixture();
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/vault/v/notavalidtype" });
    expect(r.statusCode).toBe(400);
    await app.close();
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("static fallback", () => {
  it("serves index.html when webRoot is provided", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-web-"));
    writeFileSync(join(root, "index.html"), "<!doctype html><title>cairndex</title>");
    const app = await createServer({ projects: [], webRoot: root });
    const r = await app.inject({ method: "GET", url: "/" });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("cairndex");
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("does not block /api/* routes when webRoot is provided", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-web-"));
    writeFileSync(join(root, "index.html"), "<!doctype html>");
    const app = await createServer({ projects: [], webRoot: root });
    const r = await app.inject({ method: "GET", url: "/api/projects" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });
});
