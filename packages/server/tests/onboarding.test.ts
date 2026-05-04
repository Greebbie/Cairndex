import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectEntry } from "@cairndex/core";
import yaml from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { type OnboardingHooks, createServer } from "../src/index.js";

interface Fixture {
  vaultRoot: string;
  cleanup: () => void;
}

function makeEmptyVaultDir(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "cairn-onboarding-"));
  return {
    vaultRoot: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// Minimal fake of CLI runVaultInit + runProjectRegister that touches just enough
// of the filesystem for listVaultProjects to return a hit.
function makeFakeHooks(): OnboardingHooks {
  return {
    async initVault(input) {
      const vaultRoot = input.path;
      await mkdir(join(vaultRoot, "projects"), { recursive: true });
      await mkdir(join(vaultRoot, "shared"), { recursive: true });
      await writeFile(
        join(vaultRoot, "vault.yaml"),
        yaml.dump({
          schemaVersion: 1,
          title: input.title ?? "Test Vault",
          created: "2026-05-02",
        }),
        "utf8",
      );
      return { vaultRoot };
    },
    async registerProject(input) {
      const projectId = input.projectId ?? "demo";
      const projectRoot = join(input.vaultRoot, "projects", projectId);
      await mkdir(projectRoot, { recursive: true });
      const aliases = [input.alias ?? projectId];
      await writeFile(
        join(projectRoot, "project.yaml"),
        yaml.dump({
          id: projectId,
          title: input.title ?? projectId,
          repo_paths: [input.repoRoot],
          aliases,
          status: "active",
          created: "2026-05-02",
        }),
        "utf8",
      );
      return { projectRoot, vaultRoot: input.vaultRoot };
    },
  };
}

describe("onboarding routes", () => {
  const fixtures: Array<{ cleanup: () => void }> = [];
  afterEach(() => {
    for (const f of fixtures.splice(0)) f.cleanup();
  });

  it("POST /api/vault/init creates the vault folder and returns vaultRoot", async () => {
    const fx = makeEmptyVaultDir();
    fixtures.push(fx);
    const targetVault = join(fx.vaultRoot, "MyVault");
    const app = await createServer({
      projects: [],
      logger: false,
      onboarding: makeFakeHooks(),
    });
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/init",
      payload: { path: targetVault, title: "My Vault" },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { vaultRoot: string };
    expect(body.vaultRoot).toBe(targetVault);
    expect(existsSync(join(targetVault, "vault.yaml"))).toBe(true);
    await app.close();
  });

  it("POST /api/projects/register writes project.yaml and refreshes server.projects", async () => {
    const fx = makeEmptyVaultDir();
    fixtures.push(fx);
    const repoDir = mkdtempSync(join(tmpdir(), "cairn-repo-"));
    fixtures.push({
      cleanup: () => rmSync(repoDir, { recursive: true, force: true }),
    });
    writeFileSync(join(repoDir, ".gitkeep"), "");

    const app = await createServer({
      projects: [],
      logger: false,
      onboarding: makeFakeHooks(),
    });

    // First, init vault
    const initR = await app.inject({
      method: "POST",
      url: "/api/vault/init",
      payload: { path: fx.vaultRoot },
    });
    expect(initR.statusCode).toBe(200);

    // Then register a project
    const regR = await app.inject({
      method: "POST",
      url: "/api/projects/register",
      payload: { vault: fx.vaultRoot, project: "myapp", repo: repoDir, alias: "myapp" },
    });
    expect(regR.statusCode).toBe(200);
    const reg = regR.json() as {
      alias: string;
      projectId: string | null;
      projectRoot: string;
      vaultRoot: string;
    };
    expect(reg.alias).toBe("myapp");
    expect(reg.projectId).toBe("myapp");
    expect(existsSync(join(fx.vaultRoot, "projects", "myapp", "project.yaml"))).toBe(true);

    // GET /api/projects should now return the new project
    const projsR = await app.inject({ method: "GET", url: "/api/projects" });
    expect(projsR.statusCode).toBe(200);
    const projs = projsR.json() as Array<{ alias: string }>;
    expect(projs.find((p) => p.alias === "myapp")).toBeTruthy();

    await app.close();
  });

  it("rejects invalid bodies with 400 + a flat human-readable error message", async () => {
    const app = await createServer({
      projects: [],
      logger: false,
      onboarding: makeFakeHooks(),
    });
    const r1 = await app.inject({
      method: "POST",
      url: "/api/vault/init",
      payload: { path: "" },
    });
    expect(r1.statusCode).toBe(400);
    const r1Body = r1.json() as { error: string };
    // Should not be the raw nested zod JSON dump
    expect(r1Body.error).not.toContain('"code":');
    expect(r1Body.error).toMatch(/path:/);

    const r2 = await app.inject({
      method: "POST",
      url: "/api/projects/register",
      payload: { vault: "/x", repo: "" },
    });
    expect(r2.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 (not 500) when registerProject fails because user typed a bad path", async () => {
    const fx = makeEmptyVaultDir();
    fixtures.push(fx);
    const failingHooks: OnboardingHooks = {
      ...makeFakeHooks(),
      async registerProject() {
        throw new Error("repo path does not exist: C:/does/not/exist");
      },
    };
    const app = await createServer({ projects: [], logger: false, onboarding: failingHooks });
    await app.inject({
      method: "POST",
      url: "/api/vault/init",
      payload: { path: fx.vaultRoot },
    });
    const r = await app.inject({
      method: "POST",
      url: "/api/projects/register",
      payload: { vault: fx.vaultRoot, repo: "C:/does/not/exist" },
    });
    expect(r.statusCode).toBe(400);
    expect((r.json() as { error: string }).error).toMatch(/does not exist/);
    await app.close();
  });

  it("returns 404-equivalent (no onboarding routes registered) when hooks not provided", async () => {
    const app = await createServer({ projects: [], logger: false });
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/init",
      payload: { path: "/x" },
    });
    expect(r.statusCode).toBe(404);
    await app.close();
  });

  it("expands ~ in vault and repo paths (server-side normalization)", async () => {
    const homeRecorded: { vault?: string; repo?: string } = {};
    const hooks: OnboardingHooks = {
      async initVault(input) {
        homeRecorded.vault = input.path;
        await mkdir(input.path, { recursive: true });
        await writeFile(
          join(input.path, "vault.yaml"),
          yaml.dump({ schemaVersion: 1, title: "x", created: "2026-05-02" }),
          "utf8",
        );
        return { vaultRoot: input.path };
      },
      async registerProject(input) {
        homeRecorded.repo = input.repoRoot;
        const projectId = input.projectId ?? "demo";
        const projectRoot = join(input.vaultRoot, "projects", projectId);
        await mkdir(projectRoot, { recursive: true });
        await writeFile(
          join(projectRoot, "project.yaml"),
          yaml.dump({
            id: projectId,
            title: projectId,
            repo_paths: [input.repoRoot],
            aliases: [projectId],
            status: "active",
            created: "2026-05-02",
          }),
          "utf8",
        );
        return { projectRoot, vaultRoot: input.vaultRoot };
      },
    };
    const app = await createServer({ projects: [], logger: false, onboarding: hooks });
    await app.inject({
      method: "POST",
      url: "/api/vault/init",
      payload: { path: "~/CairnTestVaultDoNotUse" },
    });
    expect(homeRecorded.vault?.startsWith(homedir())).toBe(true);
    expect(homeRecorded.vault).not.toContain("~");

    // cleanup the throwaway folder we just made under the user's home
    if (homeRecorded.vault && existsSync(homeRecorded.vault)) {
      rmSync(homeRecorded.vault, { recursive: true, force: true });
    }
    await app.close();
  });

  it("calls onProjectRegistered hook with the new project entry after register", async () => {
    const fx = makeEmptyVaultDir();
    fixtures.push(fx);
    const repoDir = mkdtempSync(join(tmpdir(), "cairn-repo-"));
    fixtures.push({
      cleanup: () => rmSync(repoDir, { recursive: true, force: true }),
    });

    const seen: ProjectEntry[] = [];
    const baseHooks = makeFakeHooks();
    const hooks: OnboardingHooks = {
      ...baseHooks,
      onProjectRegistered: async (project) => {
        seen.push(project);
      },
    };
    const app = await createServer({ projects: [], logger: false, onboarding: hooks });
    await app.inject({
      method: "POST",
      url: "/api/vault/init",
      payload: { path: fx.vaultRoot },
    });
    await app.inject({
      method: "POST",
      url: "/api/projects/register",
      payload: { vault: fx.vaultRoot, project: "myapp", repo: repoDir, alias: "myapp" },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.alias).toBe("myapp");
    expect(seen[0]?.projectId).toBe("myapp");

    await app.close();
  });

  it("after register, listVaultProjects sees the persisted manifest (round-trip)", async () => {
    const fx = makeEmptyVaultDir();
    fixtures.push(fx);
    const repoDir = mkdtempSync(join(tmpdir(), "cairn-repo-"));
    fixtures.push({
      cleanup: () => rmSync(repoDir, { recursive: true, force: true }),
    });

    const app = await createServer({
      projects: [],
      logger: false,
      onboarding: makeFakeHooks(),
    });

    await app.inject({
      method: "POST",
      url: "/api/vault/init",
      payload: { path: fx.vaultRoot },
    });
    await app.inject({
      method: "POST",
      url: "/api/projects/register",
      payload: { vault: fx.vaultRoot, project: "demo", repo: repoDir },
    });

    // Confirm what was written: project.yaml has the right shape
    const manifestRaw = readFileSync(
      join(fx.vaultRoot, "projects", "demo", "project.yaml"),
      "utf8",
    );
    const manifest = yaml.load(manifestRaw) as { id: string; aliases: string[] };
    expect(manifest.id).toBe("demo");
    expect(manifest.aliases).toContain("demo");

    await app.close();
  });
});
