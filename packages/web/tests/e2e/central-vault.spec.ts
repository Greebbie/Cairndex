import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { getFreePort } from "./ports";

let proc: ChildProcess;
let vaultRoot: string;
let home: string;
let PORT: number;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..", "..", "..");

test.beforeAll(async () => {
  PORT = await getFreePort();
  vaultRoot = mkdtempSync(join(tmpdir(), "cairn-cv-vault-"));
  home = mkdtempSync(join(tmpdir(), "cairn-cv-home-"));
  // vault.yaml + projects/<id>/project.yaml + minimal node folders
  writeFileSync(join(vaultRoot, "vault.yaml"), "schemaVersion: 1\ntitle: E2E Vault\n");
  const projectRoot = join(vaultRoot, "projects", "demo");
  for (const f of [
    "specs",
    "decisions",
    "changes",
    "rules",
    "templates",
    "indexes",
    "indexes/context-packs",
    "inbox",
    "inbox/proposed-memory-updates",
  ]) {
    mkdirSync(join(projectRoot, f), { recursive: true });
  }
  writeFileSync(
    join(projectRoot, "project.yaml"),
    'id: demo\ntitle: Demo\nrepo_paths: []\naliases: ["demo"]\nstatus: active\n',
  );
  writeFileSync(
    join(projectRoot, "index.md"),
    "---\nphase: implementing\nnext_action: ship it\n---\n# Demo\n",
  );
  writeFileSync(
    join(projectRoot, "specs", "SPEC-001-x.md"),
    "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n## Body\nbody\n",
  );
  writeFileSync(
    join(projectRoot, "changes", "changelog.md"),
    "# Changelog\n\n- 2026-04-30 — initialized\n",
  );
  writeFileSync(join(projectRoot, "config.yaml"), "schemaVersion: 1\n");

  proc = spawn(
    process.execPath,
    [
      join(REPO, "packages/cli/bin/cairndex"),
      "ui",
      "--port",
      String(PORT),
      "--no-open",
      "--vault",
      vaultRoot,
    ],
    { env: { ...process.env, CAIRNDEX_HOME: home }, stdio: "ignore" },
  );

  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`);
      if (r.ok) return;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("cairndex ui (central vault) did not start in time");
});

test.afterAll(async () => {
  proc?.kill();
  rmSync(vaultRoot, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test("loads dashboard for a central vault project", async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/p/demo`);
  await expect(page.getByRole("heading", { name: "demo" })).toBeVisible({ timeout: 10_000 });
  // "implementing" appears both in the NowBar pill and the ProjectStatePanel dd —
  // strict-mode lookup needs first() to disambiguate.
  await expect(page.getByText("implementing").first()).toBeVisible();
  await expect(page.getByText("ship it").first()).toBeVisible();
});

test("browse spec/ lists central project SPEC-001", async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/p/demo/browse`);
  await expect(page.getByRole("heading", { name: "Browse" })).toBeVisible();
  // spec/ is a collapsible button now (Browse renders type groups inline)
  await page.getByRole("button", { name: /spec\// }).click();
  await expect(page.getByRole("link", { name: /SPEC-001/ })).toBeVisible();
});
