import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runWrap } from "../src/commands/wrap.js";

describe("runWrap", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function seedRepo(): { repo: string; vault: string } {
    const repo = mkdtempSync(join(tmpdir(), "cairn-wrap-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "sessions"), { recursive: true });
    mkdirSync(join(vault, "tasks"), { recursive: true });
    mkdirSync(join(vault, "inbox", "proposed-memory-updates"), { recursive: true });
    writeFileSync(join(vault, "index.md"), "# Index\n", "utf8");
    return { repo, vault };
  }

  function writeSession(vault: string, name: string, body: string): void {
    writeFileSync(
      join(vault, "sessions", name),
      `---\nid: ${name.replace(/\.md$/, "")}\n---\n${body}\n`,
      "utf8",
    );
  }

  it("returns a report with all info-level checks on a fresh empty vault", async () => {
    const { repo } = seedRepo();
    const r = await runWrap({ cwd: repo });
    expect(r.exitCode).toBe(0);
    expect(r.report).toBeDefined();
    const labels = (r.report?.checks ?? []).map((c) => c.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Phase",
        "Active task",
        "Next action",
        "Session next",
        "Inbox",
        "Doctor",
      ]),
    );
  });

  it("flags an empty '## Next' section as warn", async () => {
    const { repo, vault } = seedRepo();
    writeSession(
      vault,
      "2026-05-04-2200.md",
      ["## Progress", "- did X", "", "## Next", "", "## Decisions", "- Y"].join("\n"),
    );
    const r = await runWrap({ cwd: repo });
    const sessionCheck = r.report?.checks.find((c) => c.label === "Session next");
    expect(sessionCheck?.status).toBe("warn");
    expect(sessionCheck?.message).toContain("empty");
  });

  it("counts bullets under '## Next' as ok", async () => {
    const { repo, vault } = seedRepo();
    writeSession(
      vault,
      "2026-05-04-2300.md",
      [
        "## Progress",
        "- shipped Pre-flight Intent",
        "",
        "## Next",
        "- review inbox",
        "- run cairndex doctor",
        "- ship Phase 2",
        "",
        "## Decisions",
      ].join("\n"),
    );
    const r = await runWrap({ cwd: repo });
    const sessionCheck = r.report?.checks.find((c) => c.label === "Session next");
    expect(sessionCheck?.status).toBe("ok");
    expect(sessionCheck?.message).toMatch(/3 bullets/);
  });

  it("tolerates *, -, and numbered bullet styles under '## Next'", async () => {
    const { repo, vault } = seedRepo();
    writeSession(
      vault,
      "2026-05-04-2400.md",
      ["## Next", "- one", "* two", "1. three", "", "## Notes"].join("\n"),
    );
    const r = await runWrap({ cwd: repo });
    const sessionCheck = r.report?.checks.find((c) => c.label === "Session next");
    expect(sessionCheck?.status).toBe("ok");
    expect(sessionCheck?.message).toMatch(/3 bullets/);
  });

  it("stops counting bullets at the next heading", async () => {
    const { repo, vault } = seedRepo();
    writeSession(
      vault,
      "2026-05-05-0100.md",
      [
        "## Next",
        "- one",
        "- two",
        "## Decisions",
        "- not part of next",
        "- still not part of next",
      ].join("\n"),
    );
    const r = await runWrap({ cwd: repo });
    const sessionCheck = r.report?.checks.find((c) => c.label === "Session next");
    expect(sessionCheck?.message).toMatch(/2 bullets/);
  });

  it("flags pending inbox proposals as warn with first-3 headlines", async () => {
    const { repo, vault } = seedRepo();
    // Write a few proposals — proposal schema is simple enough that smoke fixtures
    // matching the listProposals expectations are sufficient here.
    for (const id of ["PROP-100", "PROP-101", "PROP-102", "PROP-103"]) {
      writeFileSync(
        join(vault, "inbox", "proposed-memory-updates", `${id}.md`),
        [
          "---",
          `id: ${id}`,
          "proposalType: create",
          "targetType: insight",
          `summary: "draft insight ${id}"`,
          "status: pending",
          "createdBy: agent",
          "session: 2026-05-04",
          "contentHash: abc",
          "---",
          "body",
          "",
        ].join("\n"),
        "utf8",
      );
    }
    const r = await runWrap({ cwd: repo });
    const inboxCheck = r.report?.checks.find((c) => c.label === "Inbox");
    expect(inboxCheck?.status).toBe("warn");
    expect(inboxCheck?.message).toMatch(/4 pending/);
    expect(inboxCheck?.details?.length).toBeGreaterThanOrEqual(3);
  });

  it("emits JSON when --json is passed", async () => {
    const { repo } = seedRepo();
    const r = await runWrap({ cwd: repo, json: true });
    expect(r.body).toBeDefined();
    const parsed = JSON.parse(r.body ?? "");
    expect(parsed).toHaveProperty("checks");
    expect(parsed).toHaveProperty("counts");
    expect(parsed.counts).toHaveProperty("ok");
    expect(parsed.counts).toHaveProperty("warn");
  });
});
