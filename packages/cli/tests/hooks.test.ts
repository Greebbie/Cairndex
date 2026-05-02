import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyClaudeHooks, renderClaudeSettings } from "../src/utils/hooks.js";

describe("renderClaudeSettings", () => {
  it("legacy repo emits --filter-path .cairndex/", () => {
    const json = renderClaudeSettings({ mode: "legacy" });
    const s = JSON.stringify(json);
    expect(s).toContain("--filter-path .cairndex/");
    expect(s).not.toContain("--vault");
    expect(s).not.toContain("--project ");
  });

  it("central project emits --vault, --project, and project-relative filter", () => {
    const json = renderClaudeSettings({
      mode: "central",
      vaultRoot: "C:/Users/me/Vault",
      projectId: "demo",
    });
    const s = JSON.stringify(json);
    expect(s).toContain("--vault");
    expect(s).toContain("\\\"C:/Users/me/Vault\\\"");
    expect(s).toContain("--project demo");
    expect(s).toContain("--filter-path projects/demo/");
    expect(s).not.toContain("--filter-path .cairndex/");
  });
});

describe("applyClaudeHooks", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("writes legacy hooks when no .cairndex-project.yaml pointer is present", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-hooks-legacy-"));
    dirs.push(repo);
    await applyClaudeHooks(repo);
    const settings = readFileSync(join(repo, ".claude", "settings.json"), "utf8");
    expect(settings).toContain("--filter-path .cairndex/");
    expect(settings).not.toContain("--vault");
  });

  it("writes central hooks when a pointer file is present", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-hooks-central-"));
    const vault = mkdtempSync(join(tmpdir(), "cairn-hooks-vault-"));
    dirs.push(repo, vault);
    writeFileSync(
      join(repo, ".cairndex-project.yaml"),
      `vault: "${vault.replace(/\\/g, "/")}"\nproject: demo\n`,
      "utf8",
    );
    await applyClaudeHooks(repo);
    expect(existsSync(join(repo, ".claude", "settings.json"))).toBe(true);
    const settings = readFileSync(join(repo, ".claude", "settings.json"), "utf8");
    expect(settings).toContain("--filter-path projects/demo/");
    expect(settings).toContain("--project demo");
    expect(settings).toContain("--vault");
    expect(settings).not.toContain("--filter-path .cairndex/");
  });
});
