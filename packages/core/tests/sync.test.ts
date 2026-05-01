import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { centralVaultManifestPath, projectManifestPath } from "../src/paths.js";
import { readSyncBaseline, runSync, writeSyncBaseline } from "../src/sync.js";

let tmp: string;
let globalDir: string;
let projectDir: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-sync-"));
  globalDir = join(tmp, "global", "shared");
  projectDir = join(tmp, "project");
  mkdirSync(join(globalDir, "rules"), { recursive: true });
  mkdirSync(join(globalDir, "templates"), { recursive: true });
  mkdirSync(join(projectDir, ".cairndex", "rules"), { recursive: true });
  mkdirSync(join(projectDir, ".cairndex", "templates"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeBoth(rel: string, content: string) {
  writeFileSync(join(globalDir, rel), content);
  writeFileSync(join(projectDir, ".cairndex", rel), content);
}

describe("sync", () => {
  it("no-ops when global, project, and baseline all match", async () => {
    writeBoth("rules/operating-rules.md", "v1\n");
    await writeSyncBaseline(projectDir, { "rules/operating-rules.md": "v1\n" });
    const r = await runSync({ globalDir, projectDir });
    expect(r.fastForwarded).toEqual([]);
    expect(r.skippedLocalEdits).toEqual([]);
    expect(r.conflicts).toEqual([]);
  });

  it("fast-forwards when only global changed", async () => {
    writeBoth("rules/operating-rules.md", "v1\n");
    await writeSyncBaseline(projectDir, { "rules/operating-rules.md": "v1\n" });
    writeFileSync(join(globalDir, "rules/operating-rules.md"), "v2\n");
    const r = await runSync({ globalDir, projectDir });
    expect(r.fastForwarded).toEqual(["rules/operating-rules.md"]);
    expect(readFileSync(join(projectDir, ".cairndex/rules/operating-rules.md"), "utf8")).toBe(
      "v2\n",
    );
    const baseline = await readSyncBaseline(projectDir);
    expect(baseline["rules/operating-rules.md"]).toBeTruthy();
  });

  it("skips when only project changed", async () => {
    writeBoth("rules/operating-rules.md", "v1\n");
    await writeSyncBaseline(projectDir, { "rules/operating-rules.md": "v1\n" });
    writeFileSync(join(projectDir, ".cairndex/rules/operating-rules.md"), "v1-local\n");
    const r = await runSync({ globalDir, projectDir });
    expect(r.skippedLocalEdits).toEqual(["rules/operating-rules.md"]);
    expect(r.fastForwarded).toEqual([]);
    expect(readFileSync(join(projectDir, ".cairndex/rules/operating-rules.md"), "utf8")).toBe(
      "v1-local\n",
    );
  });

  it("writes conflict file when both changed", async () => {
    writeBoth("rules/operating-rules.md", "v1\n");
    await writeSyncBaseline(projectDir, { "rules/operating-rules.md": "v1\n" });
    writeFileSync(join(globalDir, "rules/operating-rules.md"), "v2-global\n");
    writeFileSync(join(projectDir, ".cairndex/rules/operating-rules.md"), "v2-local\n");
    const r = await runSync({ globalDir, projectDir });
    expect(r.conflicts).toEqual(["rules/operating-rules.md"]);
    const conflictPath = join(projectDir, ".cairndex/.sync-conflicts/rules/operating-rules.md");
    expect(existsSync(conflictPath)).toBe(true);
    const conflict = readFileSync(conflictPath, "utf8");
    expect(conflict).toContain("v2-global");
    expect(conflict).toContain("v2-local");
  });

  it("treats new-in-global file as fast-forward (creates locally)", async () => {
    writeFileSync(join(globalDir, "templates/new.md"), "fresh\n");
    await writeSyncBaseline(projectDir, {});
    const r = await runSync({ globalDir, projectDir });
    expect(r.fastForwarded).toEqual(["templates/new.md"]);
    expect(existsSync(join(projectDir, ".cairndex/templates/new.md"))).toBe(true);
  });

  it("scans all tracked subdirs (rules + templates)", async () => {
    writeFileSync(join(globalDir, "rules/r.md"), "r\n");
    writeFileSync(join(globalDir, "templates/t.md"), "t\n");
    await writeSyncBaseline(projectDir, {});
    const r = await runSync({ globalDir, projectDir });
    expect(r.fastForwarded.sort()).toEqual(["rules/r.md", "templates/t.md"]);
  });

  it("syncs shared files into a central project root", async () => {
    const vault = join(tmp, "Vault");
    const projectRoot = join(vault, "projects", "app");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(centralVaultManifestPath(vault), "schemaVersion: 1\n", "utf8");
    writeFileSync(projectManifestPath(projectRoot), "id: app\n", "utf8");
    writeFileSync(join(globalDir, "rules/shared.md"), "central\n");
    await writeSyncBaseline(projectRoot, {});

    const r = await runSync({ globalDir, projectDir: projectRoot });

    expect(r.fastForwarded).toEqual(["rules/shared.md"]);
    expect(readFileSync(join(projectRoot, "rules/shared.md"), "utf8")).toBe("central\n");
    expect((await readSyncBaseline(projectRoot))["rules/shared.md"]).toBeTruthy();
  });
});
