import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BIN = join(__dirname, "..", "bin", "cairndex");
const NODE_OPTS = { encoding: "utf8" as const };

describe("bin smoke", () => {
  it("--help prints command list", () => {
    const r = spawnSync(process.execPath, [BIN, "--help"], NODE_OPTS);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("init");
    expect(r.stdout).toContain("doctor");
    expect(r.stdout).toContain("sync");
    expect(r.stdout).toContain("ui");
  });

  it("--version prints semver", () => {
    const r = spawnSync(process.execPath, [BIN, "--version"], NODE_OPTS);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("ui --help describes the launcher flags", () => {
    const r = spawnSync(process.execPath, [BIN, "ui", "--help"], NODE_OPTS);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/--port/);
    expect(r.stdout).toMatch(/--no-open/);
  });
});
