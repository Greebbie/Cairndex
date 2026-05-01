import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseFrontmatter } from "../src/frontmatter.js";
import { handleVaultChange } from "../src/watcherActions.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-watcher-actions-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/changes"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/archive"), { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const cfg = defaultConfig();

function writeNode(rel: string, frontmatter: Record<string, unknown>, body = ""): string {
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");
  const path = join(tmp, ".cairndex", rel);
  writeFileSync(path, `---\n${yaml}\n---\n\n${body}`, "utf8");
  return path;
}

describe("handleVaultChange", () => {
  it("refreshes the `updated` field when stale", async () => {
    const path = writeNode("specs/SPEC-001.md", {
      id: "SPEC-001",
      title: "Test",
      status: "active",
      created: "2020-01-01",
      updated: "2020-01-01",
    });

    const result = await handleVaultChange(tmp, cfg, path);
    expect(result.archived).toBe(false);

    const raw = readFileSync(path, "utf8");
    const { data } = parseFrontmatter<Record<string, unknown>>(raw);
    expect(data.updated).not.toBe("2020-01-01");
  });

  it("does not rewrite when `updated` is already today (idempotent)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const path = writeNode("specs/SPEC-002.md", {
      id: "SPEC-002",
      title: "Fresh",
      status: "active",
      created: today,
      updated: today,
    });
    const before = readFileSync(path, "utf8");

    await handleVaultChange(tmp, cfg, path);

    const after = readFileSync(path, "utf8");
    expect(after).toBe(before);
  });

  it("archives a node whose status flipped to removed", async () => {
    const path = writeNode("specs/SPEC-003.md", {
      id: "SPEC-003",
      title: "Old",
      status: "removed",
      created: "2026-04-01",
      updated: "2026-04-01",
    });

    const result = await handleVaultChange(tmp, cfg, path);

    expect(result.archived).toBe(true);
    expect(existsSync(path)).toBe(false);
    expect(existsSync(join(tmp, ".cairndex/archive/specs/SPEC-003.md"))).toBe(true);
  });

  it("writes the reciprocal link on the target when one side declares supersedes", async () => {
    const today = new Date().toISOString().slice(0, 10);
    writeNode("specs/SPEC-100.md", {
      id: "SPEC-100",
      title: "Old",
      status: "active",
      created: today,
      updated: today,
    });
    const newPath = writeNode(
      "specs/SPEC-101.md",
      {
        id: "SPEC-101",
        title: "New",
        status: "active",
        created: today,
        updated: today,
        links: [{ type: "supersedes", target: "SPEC-100" }],
      },
      "",
    );

    await handleVaultChange(tmp, cfg, newPath);

    const oldRaw = readFileSync(join(tmp, ".cairndex/specs/SPEC-100.md"), "utf8");
    const { data } = parseFrontmatter<Record<string, unknown>>(oldRaw);
    const links = (data.links ?? []) as Array<{ type: string; target: string }>;
    expect(links.some((l) => l.type === "superseded_by" && l.target === "SPEC-101")).toBe(true);
  });

  it("returns early for paths outside the vault", async () => {
    const outside = join(tmp, "outside.md");
    writeFileSync(outside, "---\nid: X\n---\n", "utf8");
    const result = await handleVaultChange(tmp, cfg, outside);
    expect(result.archived).toBe(false);
    expect(result.fixed).toBe(0);
  });

  it("does not throw when the path no longer exists (delete event)", async () => {
    const phantom = join(tmp, ".cairndex/specs/GONE.md");
    const result = await handleVaultChange(tmp, cfg, phantom);
    expect(result.archived).toBe(false);
  });
});
