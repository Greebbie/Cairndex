import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configPath, inboxProposalsPath, nodeFolderPath, vaultPath } from "../src/paths.js";

/**
 * Regression: a repo with a `.cairndex-project.yaml` pointer must have its memory
 * resolved to the central project root, not the legacy `.cairndex/` folder. Before
 * this branch was added to vaultPath, server routes that passed `project.path`
 * (the repo root) directly to core path helpers ended up reading the orphan legacy
 * folder — the GUI silently showed stale inbox proposals from a different vault.
 *
 * The fix completes the layout-awareness vaultPath was already half-doing (via the
 * isCentralProjectRoot branch) so all derived path helpers (inboxPath, configPath,
 * nodeFolderPath, …) automatically resolve correctly without per-caller plumbing.
 */
describe("vaultPath: central-vault pointer following", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function setup(): { repo: string; vault: string } {
    const repo = mkdtempSync(join(tmpdir(), "cairn-vp-repo-"));
    const vault = mkdtempSync(join(tmpdir(), "cairn-vp-vault-"));
    dirs.push(repo, vault);
    writeFileSync(
      join(repo, ".cairndex-project.yaml"),
      `vault: "${vault.replace(/\\/g, "/")}"\nproject: demo\n`,
      "utf8",
    );
    return { repo, vault };
  }

  it("resolves to <vault>/projects/<id> when a pointer file exists", () => {
    const { repo, vault } = setup();
    const expected = join(vault, "projects", "demo");
    expect(vaultPath(repo)).toBe(expected);
  });

  it("derived helpers (configPath, inboxProposalsPath, nodeFolderPath) follow the pointer", () => {
    const { repo, vault } = setup();
    const projectRoot = join(vault, "projects", "demo");
    expect(configPath(repo)).toBe(join(projectRoot, "config.yaml"));
    expect(inboxProposalsPath(repo)).toBe(join(projectRoot, "inbox", "proposed-memory-updates"));
    expect(nodeFolderPath(repo, "specs")).toBe(join(projectRoot, "specs"));
  });

  it("legacy repo with no pointer still returns <repo>/.cairndex/", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-vp-legacy-"));
    dirs.push(repo);
    expect(vaultPath(repo)).toBe(join(repo, ".cairndex"));
    expect(configPath(repo)).toBe(join(repo, ".cairndex", "config.yaml"));
  });

  it("malformed pointer (missing fields) falls back to legacy without throwing", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-vp-malformed-"));
    dirs.push(repo);
    writeFileSync(join(repo, ".cairndex-project.yaml"), "vault:\n  - not\n  - a string\n", "utf8");
    expect(vaultPath(repo)).toBe(join(repo, ".cairndex"));
  });

  it("relative pointer paths are resolved against the repo root", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-vp-relative-"));
    dirs.push(repo);
    mkdirSync(join(repo, "external", "vault"), { recursive: true });
    writeFileSync(
      join(repo, ".cairndex-project.yaml"),
      "vault: ./external/vault\nproject: demo\n",
      "utf8",
    );
    const expected = join(repo, "external", "vault", "projects", "demo");
    expect(vaultPath(repo)).toBe(expected);
  });

  it("a central project root passes through (existing isCentralProjectRoot branch)", () => {
    const vault = mkdtempSync(join(tmpdir(), "cairn-vp-passthrough-"));
    dirs.push(vault);
    const projectRoot = join(vault, "projects", "demo");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(vault, "vault.yaml"), "schemaVersion: 1\n", "utf8");
    writeFileSync(join(projectRoot, "project.yaml"), "id: demo\n", "utf8");
    expect(vaultPath(projectRoot)).toBe(projectRoot);
  });
});
