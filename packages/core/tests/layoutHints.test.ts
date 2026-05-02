import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGACY_PROJECT_ID,
  archiveDestinationHint,
  inboxProposalsHint,
  projectIdFromRoot,
  searchVaultHint,
} from "../src/agentSurface/layoutHints.js";

describe("layoutHints", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("uses .cairndex-relative paths for legacy project ids", () => {
    expect(inboxProposalsHint(LEGACY_PROJECT_ID)).toBe(
      ".cairndex/inbox/proposed-memory-updates/",
    );
    expect(archiveDestinationHint(LEGACY_PROJECT_ID)).toBe(".cairndex/archive/<type>/");
    expect(searchVaultHint(LEGACY_PROJECT_ID)).toBe("grep .cairndex/");
  });

  it("uses project-relative paths for central project ids", () => {
    expect(inboxProposalsHint("demo")).toBe("projects/demo/inbox/proposed-memory-updates/");
    expect(archiveDestinationHint("demo")).toBe("projects/demo/archive/<type>/");
    expect(searchVaultHint("demo")).toBe("grep projects/demo/");
  });

  it("projectIdFromRoot returns 'legacy' for a plain repo root", () => {
    const dir = mkdtempSync(join(tmpdir(), "cairn-layout-"));
    dirs.push(dir);
    expect(projectIdFromRoot(dir)).toBe(LEGACY_PROJECT_ID);
  });

  it("projectIdFromRoot returns the project basename for a central project root", () => {
    const dir = mkdtempSync(join(tmpdir(), "cairn-layout-"));
    dirs.push(dir);
    const projectRoot = join(dir, "projects", "demo");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, "project.yaml"), "id: demo\n", "utf8");
    expect(projectIdFromRoot(projectRoot)).toBe("demo");
  });
});
