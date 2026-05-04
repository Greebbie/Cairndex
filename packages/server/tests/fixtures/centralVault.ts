import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface CentralVaultFixture {
  vaultRoot: string;
  projectId: string;
  projectRoot: string;
  /** Repo root the project's manifest points to. Only set when the fixture was created with `repoRoot`. */
  repoRoot?: string;
  cleanup: () => void;
}

export interface CentralVaultFixtureOptions {
  /**
   * If set, the fixture also creates this directory and writes it into the project
   * manifest's `repo_paths` so `listVaultProjects` exposes a `repoRoot`. Used by
   * tests that need the route layer to distinguish vault-project-root vs repo-root.
   */
  repoRoot?: string;
}

export function makeCentralVaultFixture(
  projectId = "demo",
  options: CentralVaultFixtureOptions = {},
): CentralVaultFixture {
  const vaultRoot = mkdtempSync(join(tmpdir(), "cairn-server-"));
  writeFileSync(join(vaultRoot, "vault.yaml"), "schemaVersion: 1\ntitle: Test Vault\n", "utf8");
  const projectRoot = join(vaultRoot, "projects", projectId);
  mkdirSync(projectRoot, { recursive: true });
  let repoPathsBlock: string;
  if (options.repoRoot) {
    mkdirSync(options.repoRoot, { recursive: true });
    // JSON.stringify escapes backslashes for a valid YAML double-quoted scalar so
    // the manifest preserves the OS-native path separators round-trip.
    repoPathsBlock = `repo_paths:\n  - ${JSON.stringify(options.repoRoot)}`;
  } else {
    repoPathsBlock = "repo_paths: []";
  }
  writeFileSync(
    join(projectRoot, "project.yaml"),
    `id: ${projectId}\ntitle: Demo\n${repoPathsBlock}\naliases: ["${projectId}"]\nstatus: active\n`,
    "utf8",
  );
  for (const sub of [
    "specs",
    "decisions",
    "plans",
    "tasks",
    "sessions",
    "changes",
    "insights",
    "questions",
    "indexes",
    "indexes/context-packs",
    "inbox",
    "inbox/proposed-memory-updates",
    "archive",
  ]) {
    mkdirSync(join(projectRoot, sub), { recursive: true });
  }
  writeFileSync(
    join(projectRoot, "index.md"),
    "---\nphase: implementing\nphase_since: 2026-05-02\nnext_action: ship\n---\n# Demo project\n",
    "utf8",
  );
  writeFileSync(
    join(projectRoot, "specs", "SPEC-001.md"),
    "---\nid: SPEC-001\ntitle: Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-02\n---\nbody\n",
    "utf8",
  );
  writeFileSync(
    join(projectRoot, "changes", "changelog.md"),
    "# Changelog\n\n- 2026-05-02 — SPEC-001 active\n",
    "utf8",
  );
  return {
    vaultRoot,
    projectId,
    projectRoot,
    ...(options.repoRoot ? { repoRoot: options.repoRoot } : {}),
    cleanup: () => {
      try {
        rmSync(vaultRoot, { recursive: true, force: true });
      } catch {
        // best-effort
      }
      if (options.repoRoot) {
        try {
          rmSync(options.repoRoot, { recursive: true, force: true });
        } catch {
          // best-effort
        }
      }
    },
  };
}
