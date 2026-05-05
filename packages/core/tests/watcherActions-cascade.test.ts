import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  activeContextPath,
  backlinksPath,
  memoryHealthPath,
  nodeSummaryPath,
} from "../src/paths.js";
import { handleVaultChange } from "../src/watcherActions.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-cascade-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeSpec(id: string, status: string): string {
  const path = join(tmp, ".cairndex/specs", `${id}.md`);
  writeFileSync(
    path,
    `---\nid: ${id}\ntitle: ${id}\nstatus: ${status}\ncreated: 2026-05-01\nupdated: 2026-05-01\nprovenance:\n  created_by: claude\n  session: 2026-05-02-0125\n---\nbody\n`,
    "utf8",
  );
  return path;
}

describe("handleVaultChange — indexes cascade", () => {
  it("regenerates all four index files after a node write", async () => {
    const p = writeSpec("SPEC-001", "active");
    const result = await handleVaultChange(tmp, defaultConfig(), p);
    expect(result.indexesUpdated).toBe(true);
    expect(existsSync(activeContextPath(tmp))).toBe(true);
    expect(existsSync(nodeSummaryPath(tmp))).toBe(true);
    expect(existsSync(memoryHealthPath(tmp))).toBe(true);
    expect(existsSync(backlinksPath(tmp))).toBe(true);
  });

  it("regenerates CLAUDE.md when active-context changes", async () => {
    const p = writeSpec("SPEC-001", "active");
    const result = await handleVaultChange(tmp, defaultConfig(), p);
    expect(result.claudeMdUpdated).toBe(true);
    const claudeMd = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("<!-- cairndex:start v1 -->");
    // New flavor: renderAgentFlavor output — task-centric, not phase/spec-centric.
    expect(claudeMd).toContain("Operating contract:");
  });

  it("ignores changes inside .cairndex/indexes/ to avoid loops", async () => {
    mkdirSync(join(tmp, ".cairndex/indexes"), { recursive: true });
    const indexFile = join(tmp, ".cairndex/indexes/active-context.json");
    writeFileSync(indexFile, "{}", "utf8");
    const result = await handleVaultChange(tmp, defaultConfig(), indexFile);
    // Cascade should be skipped — no indexes regen, no CLAUDE.md regen.
    expect(result.indexesUpdated).toBe(false);
    expect(result.claudeMdUpdated).toBe(false);
  });

  it("does not regenerate CLAUDE.md when active-context is unchanged on second run", async () => {
    const p = writeSpec("SPEC-001", "active");
    await handleVaultChange(tmp, defaultConfig(), p);
    const result2 = await handleVaultChange(tmp, defaultConfig(), p);
    // active-context didn't change between runs (same node, same status).
    expect(result2.claudeMdUpdated).toBe(false);
  });
});
