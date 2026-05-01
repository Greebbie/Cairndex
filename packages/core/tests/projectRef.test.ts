import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  centralProjectPath,
  centralProjectsPath,
  centralSharedPath,
  centralVaultManifestPath,
  configPath,
  legacyProjectRef,
  projectManifestPath,
  projectRefFromPointer,
  projectRefFromVault,
  readProjectManifest,
  readProjectPointer,
  repoPointerPath,
  resolveProjectRef,
  vaultPath,
} from "../src/index.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-project-ref-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("central vault paths", () => {
  it("builds paths for central vault layout", () => {
    const vault = join(tmp, "CairndexVault");
    const projectRoot = centralProjectPath(vault, "app");

    expect(centralVaultManifestPath(vault)).toBe(join(vault, "vault.yaml"));
    expect(centralProjectsPath(vault)).toBe(join(vault, "projects"));
    expect(projectRoot).toBe(join(vault, "projects", "app"));
    expect(projectManifestPath(projectRoot)).toBe(join(vault, "projects", "app", "project.yaml"));
    expect(centralSharedPath(vault)).toBe(join(vault, "shared"));
  });

  it("treats a central project root as the vault path when project.yaml exists", () => {
    const projectRoot = join(tmp, "Vault", "projects", "app");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(projectManifestPath(projectRoot), "id: app\n", "utf8");

    expect(vaultPath(projectRoot)).toBe(projectRoot);
    expect(configPath(projectRoot)).toBe(join(projectRoot, "config.yaml"));
  });

  it("treats an empty project namespace as central when the parent vault manifest exists", () => {
    const vault = join(tmp, "Vault");
    const projectRoot = join(vault, "projects", "app");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(centralVaultManifestPath(vault), "schemaVersion: 1\n", "utf8");

    expect(vaultPath(projectRoot)).toBe(projectRoot);
  });
});

describe("project refs", () => {
  it("creates a central project ref from explicit vault and project", () => {
    const vault = join(tmp, "vault");
    const ref = projectRefFromVault({ vaultRoot: vault, projectId: "app" });

    expect(ref).toEqual({
      vaultRoot: resolve(vault),
      projectId: "app",
      projectRoot: join(resolve(vault), "projects", "app"),
    });
  });

  it("reads a repo pointer and resolves relative vault paths from the repo root", () => {
    const repo = join(tmp, "repo");
    const vault = join(tmp, "CairndexVault");
    mkdirSync(repo, { recursive: true });
    mkdirSync(vault, { recursive: true });
    writeFileSync(repoPointerPath(repo), "vault: ../CairndexVault\nproject: cairndex\n", "utf8");

    expect(readProjectPointer(repo)).toEqual({
      vault: "../CairndexVault",
      project: "cairndex",
    });
    expect(projectRefFromPointer(repo)).toEqual({
      vaultRoot: resolve(vault),
      projectId: "cairndex",
      projectRoot: join(resolve(vault), "projects", "cairndex"),
      repoRoot: resolve(repo),
    });
  });

  it("resolves a project ref by walking up to a pointer file", () => {
    const repo = join(tmp, "repo");
    const nested = join(repo, "src", "feature");
    const vault = join(tmp, "Vault");
    mkdirSync(nested, { recursive: true });
    writeFileSync(repoPointerPath(repo), "vault: ../Vault\nproject: app\n", "utf8");

    expect(resolveProjectRef({ cwd: nested })).toEqual({
      vaultRoot: resolve(vault),
      projectId: "app",
      projectRoot: join(resolve(vault), "projects", "app"),
      repoRoot: resolve(repo),
    });
  });

  it("falls back to a legacy repo-local .cairndex project root", () => {
    const repo = join(tmp, "repo");
    const nested = join(repo, "src");
    mkdirSync(join(repo, ".cairndex"), { recursive: true });
    mkdirSync(nested, { recursive: true });

    expect(resolveProjectRef({ cwd: nested })).toEqual(legacyProjectRef(repo));
  });

  it("can disable legacy fallback", () => {
    const repo = join(tmp, "repo");
    mkdirSync(join(repo, ".cairndex"), { recursive: true });

    expect(resolveProjectRef({ cwd: repo, legacyFallback: false })).toBeNull();
  });

  it("requires explicit vault and project options together", () => {
    expect(() => resolveProjectRef({ vaultRoot: join(tmp, "vault") })).toThrow(/both vaultRoot/);
    expect(() => resolveProjectRef({ projectId: "app" })).toThrow(/both vaultRoot/);
  });

  it("reads a project manifest from a central project root", () => {
    const projectRoot = join(tmp, "Vault", "projects", "app");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(
      projectManifestPath(projectRoot),
      "id: app\ntitle: App\nrepo_paths:\n  - C:/repo/app\naliases:\n  - app-main\nstatus: active\n",
      "utf8",
    );

    expect(readProjectManifest(projectRoot)).toMatchObject({
      id: "app",
      title: "App",
      repo_paths: ["C:/repo/app"],
      aliases: ["app-main"],
      status: "active",
    });
  });
});
