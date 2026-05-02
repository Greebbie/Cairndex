import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";
import { makeCentralVaultFixture } from "./fixtures/centralVault.js";

describe("rules CRUD routes", () => {
  const fixtures: Array<{ cleanup: () => void }> = [];
  afterEach(() => {
    for (const f of fixtures.splice(0)) f.cleanup();
  });

  it("GET list returns empty when rules dir doesn't exist yet", async () => {
    const fx = makeCentralVaultFixture("demo");
    fixtures.push(fx);
    const app = await createServer({
      projects: [
        {
          path: fx.projectRoot,
          alias: "demo",
          registered_at: "2026-05-01",
          vaultRoot: fx.vaultRoot,
          projectId: "demo",
          projectRoot: fx.projectRoot,
        },
      ],
      logger: false,
    });
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/rules" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { rules: unknown[]; dir: string };
    expect(body.rules).toEqual([]);
    expect(body.dir).toContain("shared");
    await app.close();
  });

  it("PUT creates a rule, GET reads it, list shows it, DELETE removes it", async () => {
    const fx = makeCentralVaultFixture("demo");
    fixtures.push(fx);
    const app = await createServer({
      projects: [
        {
          path: fx.projectRoot,
          alias: "demo",
          registered_at: "2026-05-01",
          vaultRoot: fx.vaultRoot,
          projectId: "demo",
          projectRoot: fx.projectRoot,
        },
      ],
      logger: false,
    });

    const put = await app.inject({
      method: "PUT",
      url: "/api/vault/demo/rules/team-conventions",
      payload: { content: "# Team conventions\n\nAlways link spec → goal." },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({
      method: "GET",
      url: "/api/vault/demo/rules/team-conventions",
    });
    expect(get.statusCode).toBe(200);
    const body = get.json() as { name: string; content: string };
    expect(body.name).toBe("team-conventions");
    expect(body.content).toContain("Always link spec → goal.");

    const list = await app.inject({ method: "GET", url: "/api/vault/demo/rules" });
    expect(list.statusCode).toBe(200);
    const lb = list.json() as { rules: Array<{ name: string }> };
    expect(lb.rules.find((r) => r.name === "team-conventions")).toBeTruthy();

    // Confirm the file actually landed on disk where we expect it.
    const onDisk = readFileSync(
      join(fx.vaultRoot, "shared", "rules", "team-conventions.md"),
      "utf8",
    );
    expect(onDisk).toContain("Always link spec → goal.");

    const del = await app.inject({
      method: "DELETE",
      url: "/api/vault/demo/rules/team-conventions",
    });
    expect(del.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: "/api/vault/demo/rules/team-conventions",
    });
    expect(after.statusCode).toBe(404);

    await app.close();
  });

  it("rejects path-traversal-like names", async () => {
    const fx = makeCentralVaultFixture("demo");
    fixtures.push(fx);
    const app = await createServer({
      projects: [
        {
          path: fx.projectRoot,
          alias: "demo",
          registered_at: "2026-05-01",
          vaultRoot: fx.vaultRoot,
          projectId: "demo",
          projectRoot: fx.projectRoot,
        },
      ],
      logger: false,
    });

    for (const bad of ["../escape", "foo/bar", "..\\winescape", ".hidden", ""]) {
      const r = await app.inject({
        method: "PUT",
        url: `/api/vault/demo/rules/${encodeURIComponent(bad)}`,
        payload: { content: "x" },
      });
      expect(r.statusCode).toBe(400);
    }
    await app.close();
  });

  it("for legacy repo-local projects, writes under <repo>/.cairndex/rules", async () => {
    const repoDir = mkdtempSync(join(tmpdir(), "cairn-legacy-"));
    fixtures.push({
      cleanup: () => rmSync(repoDir, { recursive: true, force: true }),
    });
    mkdirSync(join(repoDir, ".cairndex"), { recursive: true });
    writeFileSync(
      join(repoDir, ".cairndex", "config.yaml"),
      "schemaVersion: 1\n",
      "utf8",
    );

    const app = await createServer({
      projects: [
        {
          path: repoDir,
          alias: "legacy",
          registered_at: "2026-05-01",
          // Note: no vaultRoot — this is a legacy repo-local project
        },
      ],
      logger: false,
    });

    const put = await app.inject({
      method: "PUT",
      url: "/api/vault/legacy/rules/local",
      payload: { content: "# local rule" },
    });
    expect(put.statusCode).toBe(200);

    const onDisk = readFileSync(
      join(repoDir, ".cairndex", "rules", "local.md"),
      "utf8",
    );
    expect(onDisk).toContain("# local rule");

    await app.close();
  });
});
