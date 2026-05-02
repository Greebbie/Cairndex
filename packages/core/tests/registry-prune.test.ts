import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listProjects,
  listProjectsRaw,
  pruneDeadProjects,
  registerProject,
} from "../src/registry.js";

/**
 * Phase H follow-up: tests that pass through `runInit` register an alias in the
 * global `~/.cairndex/projects.json`; if their temp dirs get rm-rf'd later, the
 * registry entry is orphaned. Before the fix the GUI sidebar accumulated dozens
 * of `cairn-init-central-*` aliases pointing nowhere. The fix has two layers:
 *   - listProjects() filters dead-path entries on read (immediately clean GUI)
 *   - pruneDeadProjects() persists the cleanup (called once at `cairndex ui` startup)
 */
describe("registry: dead-path filtering + persistent prune", () => {
  const dirs: string[] = [];
  let prevHome: string | undefined;

  beforeEach(() => {
    const home = mkdtempSync(join(tmpdir(), "cairn-reg-home-"));
    dirs.push(home);
    prevHome = process.env.CAIRNDEX_HOME;
    process.env.CAIRNDEX_HOME = home;
  });

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    if (prevHome === undefined) Reflect.deleteProperty(process.env, "CAIRNDEX_HOME");
    else process.env.CAIRNDEX_HOME = prevHome;
  });

  it("listProjects hides entries whose path no longer exists", async () => {
    const live = mkdtempSync(join(tmpdir(), "cairn-live-"));
    const dead = mkdtempSync(join(tmpdir(), "cairn-dead-"));
    dirs.push(live);
    await registerProject({ path: live, alias: "live" });
    await registerProject({ path: dead, alias: "dead" });
    rmSync(dead, { recursive: true, force: true });

    const visible = await listProjects();
    expect(visible.map((p) => p.alias)).toEqual(["live"]);

    // listProjectsRaw still returns both — caller can audit raw state.
    const raw = await listProjectsRaw();
    expect(raw.map((p) => p.alias).sort()).toEqual(["dead", "live"]);
  });

  it("pruneDeadProjects persistently removes dead entries and returns the pruned list", async () => {
    const live = mkdtempSync(join(tmpdir(), "cairn-live2-"));
    const dead1 = mkdtempSync(join(tmpdir(), "cairn-dead1-"));
    const dead2 = mkdtempSync(join(tmpdir(), "cairn-dead2-"));
    dirs.push(live);
    await registerProject({ path: live, alias: "live" });
    await registerProject({ path: dead1, alias: "dead1" });
    await registerProject({ path: dead2, alias: "dead2" });
    rmSync(dead1, { recursive: true, force: true });
    rmSync(dead2, { recursive: true, force: true });

    const pruned = await pruneDeadProjects();
    expect(pruned.map((p) => p.alias).sort()).toEqual(["dead1", "dead2"]);

    // After prune the raw read also reflects the cleanup (file was rewritten).
    const raw = await listProjectsRaw();
    expect(raw.map((p) => p.alias)).toEqual(["live"]);
  });

  it("pruneDeadProjects is a no-op when the registry is already clean", async () => {
    const live = mkdtempSync(join(tmpdir(), "cairn-clean-"));
    dirs.push(live);
    await registerProject({ path: live, alias: "live" });

    // Capture the raw file contents before prune.
    const home = process.env.CAIRNDEX_HOME ?? "";
    const path = join(home, "projects.json");
    const before = readFileSync(path, "utf8");

    const pruned = await pruneDeadProjects();
    expect(pruned).toEqual([]);
    // File should not be rewritten when there's nothing to remove.
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("pruneDeadProjects handles a missing registry file gracefully", async () => {
    // Fresh CAIRNDEX_HOME with no projects.json yet — must not throw.
    const pruned = await pruneDeadProjects();
    expect(pruned).toEqual([]);
    // The function should not have created the file just for the prune.
    const home = process.env.CAIRNDEX_HOME ?? "";
    expect(existsSync(join(home, "projects.json"))).toBe(false);
  });

  it("listProjects on a fresh CAIRNDEX_HOME returns empty array", async () => {
    expect(await listProjects()).toEqual([]);
  });

  it("re-registering a path that was pruned restores it correctly", async () => {
    const dirA = mkdtempSync(join(tmpdir(), "cairn-reuse-"));
    dirs.push(dirA);
    await registerProject({ path: dirA, alias: "reuse" });
    rmSync(dirA, { recursive: true, force: true });
    await pruneDeadProjects();

    // Recreate the dir at the same path.
    writeFileSync(dirA + "-marker", "x", "utf8");
    const dirB = mkdtempSync(join(tmpdir(), "cairn-reuse-b-"));
    dirs.push(dirB);
    await registerProject({ path: dirB, alias: "reuse-b" });

    const visible = await listProjects();
    expect(visible.map((p) => p.alias)).toEqual(["reuse-b"]);
  });
});
