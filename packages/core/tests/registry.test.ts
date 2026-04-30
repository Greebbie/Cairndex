import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  globalDir,
  listProjects,
  registerProject,
  touchProject,
  unregisterProject,
} from "../src/registry.js";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  process.env.CAIRNDEX_HOME = home;
});
afterEach(() => {
  // biome-ignore lint/performance/noDelete: removing env var is intentional cleanup
  delete process.env.CAIRNDEX_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe("registry", () => {
  it("returns empty list when registry file missing", async () => {
    expect(await listProjects()).toEqual([]);
  });

  it("registers a project and persists", async () => {
    await registerProject({ path: "/tmp/repo-a", alias: "a" });
    const list = await listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]?.path).toBe("/tmp/repo-a");
    expect(list[0]?.alias).toBe("a");
    expect(list[0]?.registered_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    // file actually exists on disk
    expect(existsSync(join(globalDir(), "projects.json"))).toBe(true);
  });

  it("dedupes by path on re-register; preserves alias", async () => {
    await registerProject({ path: "/tmp/repo-a", alias: "a" });
    await registerProject({ path: "/tmp/repo-a", alias: "renamed" });
    const list = await listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]?.alias).toBe("renamed");
  });

  it("unregisters by path", async () => {
    await registerProject({ path: "/tmp/repo-a", alias: "a" });
    await registerProject({ path: "/tmp/repo-b", alias: "b" });
    await unregisterProject("/tmp/repo-a");
    const list = await listProjects();
    expect(list.map((p) => p.alias)).toEqual(["b"]);
  });

  it("touchProject updates last_opened", async () => {
    await registerProject({ path: "/tmp/repo-a", alias: "a" });
    const before = (await listProjects())[0];
    await new Promise((r) => setTimeout(r, 5));
    await touchProject("/tmp/repo-a");
    const after = (await listProjects())[0];
    expect(after?.last_opened).toBeTruthy();
    expect(after?.last_opened).not.toBe(before?.last_opened);
  });

  it("respects CAIRNDEX_HOME env var", () => {
    expect(globalDir()).toBe(home);
  });
});
