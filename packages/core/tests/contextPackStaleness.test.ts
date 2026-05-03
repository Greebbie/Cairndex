import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lastMemoryChangeAt, lastMemoryChangeMs } from "../src/contextPack/staleness.js";

describe("contextPack/staleness", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function seedLegacyVault(): { repo: string; vault: string } {
    const repo = mkdtempSync(join(tmpdir(), "cairn-stale-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "specs"), { recursive: true });
    mkdirSync(join(vault, "decisions"), { recursive: true });
    mkdirSync(join(vault, "inbox", "proposed-memory-updates"), { recursive: true });
    return { repo, vault };
  }

  it("returns null on an empty / freshly-init vault", async () => {
    const { repo } = seedLegacyVault();
    const result = await lastMemoryChangeMs(repo);
    expect(result).toBeNull();
  });

  it("returns the newest mtime across memory folders", async () => {
    const { repo, vault } = seedLegacyVault();
    const oldFile = join(vault, "specs", "SPEC-001.md");
    const newFile = join(vault, "decisions", "ADR-002.md");
    writeFileSync(oldFile, "old\n", "utf8");
    writeFileSync(newFile, "new\n", "utf8");
    const oldTime = new Date("2026-04-01T00:00:00Z");
    const newTime = new Date("2026-05-01T00:00:00Z");
    utimesSync(oldFile, oldTime, oldTime);
    utimesSync(newFile, newTime, newTime);
    const ms = await lastMemoryChangeMs(repo);
    expect(ms).toBe(newTime.getTime());
  });

  it("includes inbox/proposed-memory-updates as a staleness source", async () => {
    // The point of this test: when an agent proposes new memory, the stale flag
    // should flip even though no canonical memory file changed yet.
    const { repo, vault } = seedLegacyVault();
    const proposal = join(vault, "inbox", "proposed-memory-updates", "PROP-001.md");
    writeFileSync(proposal, "draft\n", "utf8");
    const t = new Date("2026-05-01T00:00:00Z");
    utimesSync(proposal, t, t);
    const ms = await lastMemoryChangeMs(repo);
    expect(ms).toBe(t.getTime());
  });

  it("lastMemoryChangeAt returns ISO string equivalent", async () => {
    const { repo, vault } = seedLegacyVault();
    const f = join(vault, "insights", "INS-001.md");
    mkdirSync(join(vault, "insights"), { recursive: true });
    writeFileSync(f, "x\n", "utf8");
    const t = new Date("2026-05-03T12:34:56Z");
    utimesSync(f, t, t);
    const iso = await lastMemoryChangeAt(repo);
    expect(iso).toBe(t.toISOString());
  });

  it("ignores indexes/ to avoid feedback loops with the pack itself", async () => {
    const { repo, vault } = seedLegacyVault();
    // Place a fake "context pack" file under indexes/ AFTER setting the spec mtime
    // back. Our helper should still return the older spec mtime, not the pack's.
    const specFile = join(vault, "specs", "SPEC-001.md");
    writeFileSync(specFile, "spec\n", "utf8");
    const oldTime = new Date("2026-04-01T00:00:00Z");
    utimesSync(specFile, oldTime, oldTime);

    mkdirSync(join(vault, "indexes", "context-packs"), { recursive: true });
    const packFile = join(vault, "indexes", "context-packs", "PACK-1.md");
    writeFileSync(packFile, "pack\n", "utf8");
    const newTime = new Date("2026-05-01T00:00:00Z");
    utimesSync(packFile, newTime, newTime);

    const ms = await lastMemoryChangeMs(repo);
    // Must be the OLDER spec mtime — the pack file mtime in indexes/ is excluded.
    expect(ms).toBe(oldTime.getTime());
  });
});
