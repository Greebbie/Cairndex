import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveAllStaleStatuses, archiveIfNeeded } from "../src/archive.js";
import { defaultConfig } from "../src/config.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-arch-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("archive", () => {
  it("does nothing when status is not removed/archived", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    const f = join(tmp, ".cairndex/specs/SPEC-001-x.md");
    writeFileSync(
      f,
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    const moved = await archiveIfNeeded(tmp, defaultConfig(), f);
    expect(moved).toBeNull();
    expect(existsSync(f)).toBe(true);
  });

  it("moves a file with status: removed to archive/", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    const f = join(tmp, ".cairndex/specs/SPEC-001-x.md");
    writeFileSync(
      f,
      "---\nid: SPEC-001\ntitle: X\nstatus: removed\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    const moved = await archiveIfNeeded(tmp, defaultConfig(), f);
    expect(moved).not.toBeNull();
    expect(existsSync(f)).toBe(false);
    expect(existsSync(join(tmp, ".cairndex/archive/specs/SPEC-001-x.md"))).toBe(true);
  });

  it("archiveAllStaleStatuses sweeps all node folders", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: removed\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    writeFileSync(
      join(tmp, ".cairndex/decisions/ADR-001-x.md"),
      "---\nid: ADR-001\ntitle: X\nstatus: archived\ncreated: 2026-04-30\n---\n",
    );
    const moved = await archiveAllStaleStatuses(tmp, defaultConfig());
    expect(moved.length).toBe(2);
    expect(existsSync(join(tmp, ".cairndex/archive/specs/SPEC-001-x.md"))).toBe(true);
    expect(existsSync(join(tmp, ".cairndex/archive/decisions/ADR-001-x.md"))).toBe(true);
  });
});
