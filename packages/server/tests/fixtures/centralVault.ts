import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface CentralVaultFixture {
  vaultRoot: string;
  projectId: string;
  projectRoot: string;
  cleanup: () => void;
}

export function makeCentralVaultFixture(projectId = "demo"): CentralVaultFixture {
  const vaultRoot = mkdtempSync(join(tmpdir(), "cairn-server-"));
  writeFileSync(
    join(vaultRoot, "vault.yaml"),
    `schemaVersion: 1\ntitle: Test Vault\n`,
    "utf8",
  );
  const projectRoot = join(vaultRoot, "projects", projectId);
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(
    join(projectRoot, "project.yaml"),
    `id: ${projectId}\ntitle: Demo\nrepo_paths: []\naliases: ["${projectId}"]\nstatus: active\n`,
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
    `---\nphase: implementing\nphase_since: 2026-05-02\nnext_action: ship\n---\n# Demo project\n`,
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
    cleanup: () => {
      try {
        rmSync(vaultRoot, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}
