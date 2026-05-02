import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";

let tmp: string;
let home: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-init-"));
  home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  mkdirSync(join(tmp, ".git"));
  process.env.CAIRNDEX_HOME = home;
});
afterEach(() => {
  Reflect.deleteProperty(process.env, "CAIRNDEX_HOME");
  rmSync(tmp, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("init", () => {
  it("creates .cairndex/ skeleton with all 10 node folders", async () => {
    await runInit({ cwd: tmp, yes: true, claudeMd: true, hooks: true });
    for (const f of [
      "goals",
      "intents",
      "specs",
      "decisions",
      "plans",
      "tasks",
      "sessions",
      "changes",
      "insights",
      "questions",
      "context",
      "rules",
      "templates",
      "archive",
    ]) {
      expect(existsSync(join(tmp, ".cairndex", f)), f).toBe(true);
    }
  });

  it("creates the derived indexes/ and Phase-2 inbox/ placeholders", async () => {
    await runInit({ cwd: tmp, yes: true, claudeMd: true, hooks: true });
    expect(existsSync(join(tmp, ".cairndex/indexes"))).toBe(true);
    expect(existsSync(join(tmp, ".cairndex/indexes/context-packs"))).toBe(true);
    expect(existsSync(join(tmp, ".cairndex/inbox"))).toBe(true);
    expect(existsSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"))).toBe(true);
  });

  it("writes config.yaml, index.md, baseline, and registers globally", async () => {
    await runInit({ cwd: tmp, yes: true, claudeMd: true, hooks: true, alias: "test-proj" });
    expect(existsSync(join(tmp, ".cairndex/config.yaml"))).toBe(true);
    expect(existsSync(join(tmp, ".cairndex/index.md"))).toBe(true);
    const indexContent = readFileSync(join(tmp, ".cairndex/index.md"), "utf8");
    expect(indexContent).toContain("<!-- cairndex:recent-changes:start -->");
    expect(indexContent).toContain("<!-- cairndex:recent-changes:end -->");
    expect(existsSync(join(tmp, ".cairndex/.sync-baseline.json"))).toBe(true);
    const registry = JSON.parse(readFileSync(join(home, "projects.json"), "utf8"));
    expect(registry.projects).toHaveLength(1);
    expect(registry.projects[0].alias).toBe("test-proj");
  });

  it("merges cairndex block into existing CLAUDE.md", async () => {
    writeFileSync(join(tmp, "CLAUDE.md"), "# My project\n\nUser content.\n");
    await runInit({ cwd: tmp, yes: true, claudeMd: true, hooks: true });
    const updated = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    expect(updated).toContain("User content.");
    expect(updated).toContain("<!-- cairndex:start v1 -->");
    expect(updated).toContain("<!-- cairndex:end -->");
  });

  it("writes Claude Code hook stanzas in the official nested shape", async () => {
    await runInit({ cwd: tmp, yes: true, claudeMd: false, hooks: true });
    const settings = JSON.parse(readFileSync(join(tmp, ".claude/settings.json"), "utf8"));

    const post = settings.hooks?.PostToolUse;
    expect(Array.isArray(post)).toBe(true);
    expect(post).toHaveLength(1);
    expect(post[0].matcher).toBe("Write|Edit");
    expect(Array.isArray(post[0].hooks)).toBe(true);
    expect(post[0].hooks[0]).toMatchObject({ type: "command" });
    expect(String(post[0].hooks[0].command)).toContain("cairndex doctor");
    expect(String(post[0].hooks[0].command)).toContain("--scope changed");
    expect(String(post[0].hooks[0].command)).toContain("--filter-path .cairndex/");

    const stop = settings.hooks?.Stop;
    expect(Array.isArray(stop)).toBe(true);
    expect(stop).toHaveLength(1);
    expect(stop[0].matcher).toBeUndefined();
    expect(Array.isArray(stop[0].hooks)).toBe(true);
    expect(stop[0].hooks[0]).toMatchObject({ type: "command" });
    expect(String(stop[0].hooks[0].command)).toContain("--auto-session");
    // Phase 9: Stop hook also runs the consolidate+archive sweep.
    const sweepCmd = (stop[0].hooks as Array<{ command: string }>).find((h) =>
      String(h.command).includes("cairndex sweep"),
    );
    expect(sweepCmd).toBeDefined();
    expect(String(sweepCmd?.command)).toContain("--silent");
  });

  it("preserves existing .claude/settings.json hooks (nested user hook)", async () => {
    mkdirSync(join(tmp, ".claude"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude/settings.json"),
      JSON.stringify(
        {
          hooks: {
            PostToolUse: [
              {
                matcher: "Bash",
                hooks: [{ type: "command", command: "echo user-hook" }],
              },
            ],
          },
        },
        null,
        2,
      ),
    );
    await runInit({ cwd: tmp, yes: true, claudeMd: false, hooks: true });
    const s = JSON.parse(readFileSync(join(tmp, ".claude/settings.json"), "utf8"));
    const post = s.hooks.PostToolUse as Array<{
      matcher?: string;
      hooks: Array<{ command: string }>;
    }>;
    const userEntry = post.find((e) => e.matcher === "Bash");
    expect(userEntry).toBeDefined();
    expect(userEntry?.hooks[0].command).toBe("echo user-hook");
    const cairnEntry = post.find(
      (e) =>
        e.matcher === "Write|Edit" &&
        e.hooks.some((h) => String(h.command).includes("cairndex doctor")),
    );
    expect(cairnEntry).toBeDefined();
  });

  it("idempotent on re-init: cairndex hook is replaced, not duplicated", async () => {
    await runInit({ cwd: tmp, yes: true, claudeMd: false, hooks: true });
    await runInit({ cwd: tmp, yes: true, claudeMd: false, hooks: true });
    const s = JSON.parse(readFileSync(join(tmp, ".claude/settings.json"), "utf8"));
    const post = s.hooks.PostToolUse as Array<{ matcher?: string }>;
    expect(post.filter((e) => e.matcher === "Write|Edit")).toHaveLength(1);
    const stop = s.hooks.Stop as Array<unknown>;
    expect(stop).toHaveLength(1);
  });

  it("prints a central-vault migration hint after successful init", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      await runInit({ cwd: tmp, yes: true, claudeMd: false, hooks: false });
    } finally {
      console.log = origLog;
    }
    const all = logs.join("\n");
    expect(all).toMatch(/cairndex vault init/);
    expect(all).toMatch(/import-repo-vault/);
  });

  it("idempotent: re-running init does not duplicate or break content", async () => {
    await runInit({ cwd: tmp, yes: true, claudeMd: true, hooks: true });
    const before = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    await runInit({ cwd: tmp, yes: true, claudeMd: true, hooks: true });
    const after = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    expect(after.match(/<!-- cairndex:start v1 -->/g)?.length).toBe(1);
    expect(after.match(/<!-- cairndex:end -->/g)?.length).toBe(1);
    void before;
  });
});
