import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runContext } from "../src/commands/context.js";
import { runDoctor } from "../src/commands/doctor.js";
import { runEmitClaudeMd } from "../src/commands/emitClaudeMd.js";
import { runInit } from "../src/commands/init.js";
import { runProjectRegister } from "../src/commands/project.js";
import { runVaultInit } from "../src/commands/vault.js";

describe("central vault end-to-end", () => {
  const dirs: string[] = [];
  let prevHome: string | undefined;

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    if (prevHome === undefined) Reflect.deleteProperty(process.env, "CAIRNDEX_HOME");
    else process.env.CAIRNDEX_HOME = prevHome;
  });

  it("init vault, register a project, doctor green, context writes pack, emit updates CLAUDE.md", async () => {
    const home = mkdtempSync(join(tmpdir(), "cairn-home-"));
    prevHome = process.env.CAIRNDEX_HOME;
    process.env.CAIRNDEX_HOME = home;
    const vaultRoot = mkdtempSync(join(tmpdir(), "cairn-vault-e2e-"));
    const repoRoot = mkdtempSync(join(tmpdir(), "cairn-repo-e2e-"));
    dirs.push(home, vaultRoot, repoRoot);
    writeFileSync(join(repoRoot, "CLAUDE.md"), "# Repo\n", "utf8");

    const v = await runVaultInit({ path: vaultRoot, title: "E2E Vault" });
    expect(v.exitCode).toBe(0);
    expect(existsSync(join(vaultRoot, "vault.yaml"))).toBe(true);

    const reg = await runProjectRegister({
      vaultRoot,
      projectId: "demo",
      repoRoot,
      title: "Demo",
      alias: "demo",
    });
    expect(reg.exitCode).toBe(0);
    expect(existsSync(join(repoRoot, ".cairndex-project.yaml"))).toBe(true);
    expect(existsSync(join(vaultRoot, "projects", "demo", "project.yaml"))).toBe(true);

    const doc = await runDoctor({
      cwd: repoRoot,
      vaultRoot,
      projectId: "demo",
      silent: true,
    });
    expect(doc.exitCode).toBe(0);

    const ctx = await runContext({
      cwd: repoRoot,
      vaultRoot,
      projectId: "demo",
      emitStdout: false,
    });
    expect(ctx.exitCode).toBe(0);
    expect(ctx.outputPath).toBeDefined();
    expect(
      ctx.outputPath?.includes(join(vaultRoot, "projects", "demo", "indexes", "context-packs")),
    ).toBe(true);

    const emit = await runEmitClaudeMd({
      cwd: repoRoot,
      vaultRoot,
      projectId: "demo",
      repoRoot,
    });
    expect(emit.exitCode).toBe(0);
    const claudeMd = readFileSync(join(repoRoot, "CLAUDE.md"), "utf8");
    expect(claudeMd).toMatch(/<!-- cairndex:start v1 -->/);
    // Post-Task-2.7: the region now contains the new agent flavor (resume-view based),
    // not the old phase/goal/spec/plan/inbox text. Verify the new operating contract marker.
    expect(claudeMd).toContain("Operating contract:");
    expect(claudeMd).toContain("Pending memory:");
  });

  it("legacy repo-local init still works alongside the central flow", async () => {
    const home = mkdtempSync(join(tmpdir(), "cairn-home-legacy-"));
    prevHome = process.env.CAIRNDEX_HOME;
    process.env.CAIRNDEX_HOME = home;
    const repoRoot = mkdtempSync(join(tmpdir(), "cairn-repo-legacy-"));
    dirs.push(home, repoRoot);
    await runInit({ cwd: repoRoot, yes: true, claudeMd: false, hooks: false });
    expect(existsSync(join(repoRoot, ".cairndex"))).toBe(true);
    expect(existsSync(join(repoRoot, ".cairndex", "specs"))).toBe(true);
  });
});
