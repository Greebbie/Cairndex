import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { listNodeFiles, listNodeIds, readNode, vaultExists, writeNode } from "../src/vault.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-vault-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("vault", () => {
  it("vaultExists returns false on empty dir", () => {
    expect(vaultExists(tmp)).toBe(false);
  });

  it("vaultExists returns true when .cairndex exists", () => {
    mkdirSync(join(tmp, ".cairndex"));
    expect(vaultExists(tmp)).toBe(true);
  });

  it("listNodeIds returns empty when folder absent", async () => {
    mkdirSync(join(tmp, ".cairndex"));
    const ids = await listNodeIds(tmp, defaultConfig(), "spec");
    expect(ids).toEqual([]);
  });

  it("listNodeIds finds SPEC-001 by filename pattern", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-login.md"),
      "---\nid: SPEC-001\ntitle: Login\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-002-logout.md"),
      "---\nid: SPEC-002\ntitle: Logout\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    writeFileSync(join(tmp, ".cairndex/specs/README.md"), "# Specs\n");
    const ids = await listNodeIds(tmp, defaultConfig(), "spec");
    expect(ids.sort()).toEqual(["SPEC-001", "SPEC-002"]);
  });

  it("readNode returns parsed frontmatter and content", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-login.md"),
      "---\nid: SPEC-001\ntitle: Login\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n\n## Body\nhello\n",
    );
    const node = await readNode(tmp, defaultConfig(), "spec", "SPEC-001");
    expect(node).not.toBeNull();
    expect(node?.frontmatter.id).toBe("SPEC-001");
    expect(node?.body).toContain("hello");
    expect(node?.path).toMatch(/SPEC-001-login\.md$/);
  });

  it("writeNode creates folder and file", async () => {
    mkdirSync(join(tmp, ".cairndex"));
    await writeNode(tmp, defaultConfig(), "spec", {
      frontmatter: {
        id: "SPEC-001",
        title: "X",
        status: "active",
        created: "2026-04-30",
        updated: "2026-04-30",
      },
      body: "## Body\n",
      slug: "x",
    });
    const ids = await listNodeIds(tmp, defaultConfig(), "spec");
    expect(ids).toContain("SPEC-001");
  });

  it("listNodeFiles returns paths and frontmatter for each", async () => {
    mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex/decisions/ADR-001-x.md"),
      "---\nid: ADR-001\ntitle: X\nstatus: accepted\ncreated: 2026-04-30\n---\n",
    );
    const files = await listNodeFiles(tmp, defaultConfig(), "decision");
    expect(files).toHaveLength(1);
    expect(files[0]?.frontmatter.id).toBe("ADR-001");
  });
});
