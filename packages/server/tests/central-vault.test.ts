import { listVaultProjects } from "@cairndex/core";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";
import { makeCentralVaultFixture } from "./fixtures/centralVault.js";

describe("server with a central vault", () => {
  const fixtures: Array<{ cleanup: () => void }> = [];
  afterEach(() => {
    for (const f of fixtures.splice(0)) f.cleanup();
  });

  it("listVaultProjects returns the registered project for the dashboard route", async () => {
    const fx = makeCentralVaultFixture("demo");
    fixtures.push(fx);
    const projects = await listVaultProjects(fx.vaultRoot);
    expect(projects).toHaveLength(1);
    const p = projects[0];
    expect(p?.alias).toBe("demo");
    expect(p?.path).toBe(fx.projectRoot);

    const app = await createServer({ projects, logger: false });
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/dashboard" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as Record<string, unknown>;
    expect(body).toHaveProperty("projectState");
    expect(body).toHaveProperty("agentContext");
    expect(body).toHaveProperty("memoryHealth");
    expect(body).toHaveProperty("recentActivity");
    await app.close();
  });

  it("vault counts/spec list route works against a central project", async () => {
    const fx = makeCentralVaultFixture("demo");
    fixtures.push(fx);
    const projects = await listVaultProjects(fx.vaultRoot);
    const app = await createServer({ projects, logger: false });

    const summary = await app.inject({ method: "GET", url: "/api/vault/demo" });
    expect(summary.statusCode).toBe(200);
    const sb = summary.json() as { counts: Record<string, number>; phase: string | null };
    expect(sb.counts.spec).toBe(1);
    expect(sb.phase).toBe("implementing");

    const specs = await app.inject({ method: "GET", url: "/api/vault/demo/spec" });
    expect(specs.statusCode).toBe(200);
    const list = specs.json() as Array<{ id: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("SPEC-001");

    await app.close();
  });

  it("doctor route returns issues array (possibly empty) for a clean central project", async () => {
    const fx = makeCentralVaultFixture("demo");
    fixtures.push(fx);
    const projects = await listVaultProjects(fx.vaultRoot);
    const app = await createServer({ projects, logger: false });
    const r = await app.inject({ method: "GET", url: "/api/doctor/demo" });
    expect(r.statusCode).toBe(200);
    await app.close();
  });
});
