import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

let tmp: string;
let home: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-mut-"));
  home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  process.env.CAIRNDEX_HOME = home;
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/insights"), { recursive: true });
  mkdirSync(join(home, "shared/insights"), { recursive: true });
});
afterEach(() => {
  // biome-ignore lint/performance/noDelete: must remove env var so child processes do not see CAIRNDEX_HOME="undefined"
  delete process.env.CAIRNDEX_HOME;
  rmSync(tmp, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("mutating routes", () => {
  it("GET /api/doctor/:alias returns issues", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: done\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({ method: "GET", url: "/api/doctor/v" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.issues.some((i: { rule: string }) => i.rule === "verification-bound")).toBe(true);
    await app.close();
  });

  it("POST /api/doctor/:alias/fix applies auto-fixes", async () => {
    const f = join(tmp, ".cairndex/specs/SPEC-001-x.md");
    writeFileSync(
      f,
      '---\nid: SPEC-001\ntitle: X\nstatus: active\ntags: ["Foo Bar"]\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n',
    );
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({ method: "POST", url: "/api/doctor/v/fix" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.fixed.length).toBeGreaterThan(0);
    await app.close();
  });

  it("POST /api/sync/:alias runs three-way sync", async () => {
    mkdirSync(join(tmp, ".cairndex/rules"), { recursive: true });
    mkdirSync(join(home, "shared/rules"), { recursive: true });
    writeFileSync(join(home, "shared/rules/operating-rules.md"), "v1\n");
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({ method: "POST", url: "/api/sync/v" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.fastForwarded.length).toBeGreaterThan(0);
    await app.close();
  });

  it("POST /api/insight/:alias/promote copies to global", async () => {
    writeFileSync(
      join(tmp, ".cairndex/insights/INS-001-x.md"),
      "---\nid: INS-001\ntitle: X\nstatus: stable\ncreated: 2026-04-30\n---\n",
    );
    mkdirSync(join(tmp, ".cairndex/changes"), { recursive: true });
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({
      method: "POST",
      url: "/api/insight/v/promote",
      payload: { id: "INS-001" },
    });
    expect(r.statusCode).toBe(200);
    expect(existsSync(join(home, "shared/insights/INS-001-x.md"))).toBe(true);
    await app.close();
  });

  it("PATCH /api/config/:alias/project writes YAML to disk", async () => {
    const app = await createServer({
      projects: [{ path: tmp, alias: "v", registered_at: "2026-04-30T00:00:00Z" }],
    });
    const r = await app.inject({
      method: "PATCH",
      url: "/api/config/v/project",
      payload: { schemaVersion: 1, freshness_warn_days: 60 },
    });
    expect(r.statusCode).toBe(200);
    const written = readFileSync(join(tmp, ".cairndex/config.yaml"), "utf8");
    expect(written).toContain("freshness_warn_days: 60");
    await app.close();
  });
});
