import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-dr-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("doctor", () => {
  it("returns exit code 0 on a valid vault", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\nprovenance:\n  created_by: c\n  session: s\n---\n",
    );
    const r = await runDoctor({ cwd: tmp, silent: true });
    expect(r.exitCode).toBe(0);
  });

  it("returns exit code 1 when there are errors", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: done\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    // status: done without verification → error
    const r = await runDoctor({ cwd: tmp, silent: true });
    expect(r.exitCode).toBe(1);
  });

  it("--fix resolves auto-fixable issues", async () => {
    const f = join(tmp, ".cairndex/specs/SPEC-001-x.md");
    writeFileSync(
      f,
      '---\nid: SPEC-001\ntitle: X\nstatus: active\ntags: ["Foo Bar"]\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n',
    );
    await runDoctor({ cwd: tmp, silent: true, fix: true });
    const after = readFileSync(f, "utf8");
    expect(after).toContain("foo-bar");
    expect(after).not.toContain("Foo Bar");
  });

  it("--filter-path scopes to files under given prefix", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: done\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    // run doctor with filter that excludes specs → no errors despite the broken spec
    const r = await runDoctor({ cwd: tmp, silent: true, filterPath: ".cairndex/decisions/" });
    expect(r.exitCode).toBe(0);
  });

  it("--auto-session generates a session file when no transcript provided", async () => {
    mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    await runDoctor({ cwd: tmp, silent: true, autoSession: true });
    const { readdirSync } = await import("node:fs");
    const sessions = readdirSync(join(tmp, ".cairndex/sessions"));
    expect(sessions.some((f) => f.endsWith(".md"))).toBe(true);
  });

  it("--auto-session without transcript records recent source changes for central projects", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "cairn-dr-repo-"));
    const vaultRoot = mkdtempSync(join(tmpdir(), "cairn-dr-vault-"));
    try {
      const projectRoot = join(vaultRoot, "projects", "demo");
      mkdirSync(join(projectRoot, "sessions"), { recursive: true });
      writeFileSync(join(vaultRoot, "vault.yaml"), "version: 1\n", "utf8");
      writeFileSync(join(projectRoot, "project.yaml"), "id: demo\n", "utf8");
      mkdirSync(join(projectRoot, "state"), { recursive: true });
      writeFileSync(join(projectRoot, "state", "resume.md"), "# Generated resume\n", "utf8");
      mkdirSync(join(repoRoot, "src"), { recursive: true });
      writeFileSync(join(repoRoot, "src", "feature.ts"), "export const feature = true;\n", "utf8");

      await runDoctor({
        cwd: repoRoot,
        vaultRoot,
        projectId: "demo",
        silent: true,
        autoSession: true,
      });

      const { readdirSync } = await import("node:fs");
      const sessions = readdirSync(join(projectRoot, "sessions"));
      const sessionFile = sessions.find((f) => f.endsWith(".md"));
      expect(sessionFile).toBeDefined();
      if (!sessionFile) return;
      const body = readFileSync(join(projectRoot, "sessions", sessionFile), "utf8");
      expect(body).toContain("src/feature.ts");
      expect(body).toContain("Auto-organized 1 changed file");
      expect(body).not.toContain("resume.md");
      expect(body).not.toContain("TODO");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(vaultRoot, { recursive: true, force: true });
    }
  });

  it("--auto-session with transcriptPath uses tool-call data and renders Tool calls section", async () => {
    mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
    const transcript = join(tmp, "transcript.jsonl");
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                name: "Edit",
                input: { file_path: `${tmp}/.cairndex/specs/SPEC-200.md` },
              },
              { type: "tool_use", name: "Bash", input: { command: "pnpm test" } },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );
    await runDoctor({ cwd: tmp, silent: true, autoSession: true, transcriptPath: transcript });

    const { readdirSync } = await import("node:fs");
    const sessions = readdirSync(join(tmp, ".cairndex/sessions"));
    const sessionFile = sessions.find((f) => f.endsWith(".md"));
    expect(sessionFile).toBeDefined();
    if (!sessionFile) return;
    const body = readFileSync(join(tmp, ".cairndex/sessions", sessionFile), "utf8");
    expect(body).toContain("## Tool calls");
    expect(body).toContain("Edit×1");
    expect(body).toContain("Bash×1");
    expect(body).toContain("SPEC-200.md");
    // ID parsed from path arg should appear in Nodes referenced
    expect(body).toContain("[[SPEC-200]]");
  });

  it("--story prints story-coverage indicators in addition to structural health", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\nprovenance:\n  created_by: c\n  session: s\n---\n",
    );
    const logged: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => String(a)).join(" "));
    });
    await runDoctor({ cwd: tmp, story: true });
    spy.mockRestore();
    const out = logged.join("\n");
    expect(out).toContain("Story coverage");
    // All 5 indicator labels should appear
    expect(out).toContain("Recent narrative");
    expect(out).toContain("Active task progress");
    expect(out).toContain("Next action defined");
    expect(out).toContain("Inbox hygiene");
    expect(out).toContain("Resume consumption");
  });

  it("doctor without --story does NOT print story coverage", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\nprovenance:\n  created_by: c\n  session: s\n---\n",
    );
    const logged: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => String(a)).join(" "));
    });
    await runDoctor({ cwd: tmp });
    spy.mockRestore();
    const out = logged.join("\n");
    expect(out).not.toContain("Story coverage");
  });

  it("--story --silent suppresses ALL output including story coverage", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\nprovenance:\n  created_by: c\n  session: s\n---\n",
    );
    const logged: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => String(a)).join(" "));
    });
    await runDoctor({ cwd: tmp, story: true, silent: true });
    spy.mockRestore();
    const out = logged.join("\n");
    expect(out).not.toContain("Story coverage");
    expect(out).not.toContain("vault is clean");
  });
});
