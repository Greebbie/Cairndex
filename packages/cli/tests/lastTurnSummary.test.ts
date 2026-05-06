import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLastTurnSummary } from "../src/commands/lastTurnSummary.js";

describe("runLastTurnSummary", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function seedRepo(): string {
    const repo = mkdtempSync(join(tmpdir(), "cairn-lts-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "sessions"), { recursive: true });
    mkdirSync(join(vault, "inbox", "proposed-memory-updates"), { recursive: true });
    writeFileSync(join(vault, "index.md"), "# Index\n", "utf8");
    return repo;
  }

  it("writes a JSON file at <vault>/state/last-turn-summary.json", async () => {
    const repo = seedRepo();
    const now = Date.UTC(2026, 4, 3, 12, 0, 0);
    const r = await runLastTurnSummary({ cwd: repo, now });
    expect(r.exitCode).toBe(0);
    expect(r.path).toBeDefined();
    expect(existsSync(r.path ?? "")).toBe(true);
    const parsed = JSON.parse(readFileSync(r.path ?? "", "utf8"));
    expect(parsed.ts).toBe(new Date(now).toISOString());
    expect(parsed.toolCounts).toEqual({ Edit: 0, Write: 0, Bash: 0, Read: 0 });
    expect(parsed.newProposals).toEqual([]);
    expect(parsed.latestSessionId).toBeNull();
    // Intent is null when no current-intent.md exists — the most common case
    // (Stop hook clears the file at every turn end).
    expect(parsed.intent).toBeNull();
  });

  it("captures an active pre-flight intent and persists it in the summary", async () => {
    // The Stop hook runs `last-turn-summary` BEFORE `intent clear`, so a fresh intent
    // file written this turn must show up inside the JSON for the dashboard's
    // LastTurnCard to render the retrospective "agent said it would do X" view.
    const repo = seedRepo();
    const stateDir = join(repo, ".cairndex", "state");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, "current-intent.md"),
      [
        "---",
        "set_at: '2026-05-05T12:00:00.000Z'",
        "task_id: TASK-007",
        "---",
        "- audit api.ts",
        "- extract inbox hooks",
        "- rerun tests",
        "",
      ].join("\n"),
      "utf8",
    );
    const r = await runLastTurnSummary({ cwd: repo, now: Date.now() });
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(readFileSync(r.path ?? "", "utf8"));
    expect(parsed.intent).not.toBeNull();
    expect(parsed.intent.taskId).toBe("TASK-007");
    expect(parsed.intent.steps).toEqual(["audit api.ts", "extract inbox hooks", "rerun tests"]);
  });

  it("includes the latest session id and recent proposals", async () => {
    const repo = seedRepo();
    const vault = join(repo, ".cairndex");
    writeFileSync(join(vault, "sessions", "2026-05-03-1200.md"), "---\n---\n# session\n", "utf8");
    writeFileSync(
      join(vault, "inbox", "proposed-memory-updates", "PROP-009.md"),
      "---\n---\nbody\n",
      "utf8",
    );
    const now = Date.now();
    const r = await runLastTurnSummary({ cwd: repo, now, newProposalWindowMs: 60_000 });
    expect(r.summary?.latestSessionId).toBe("2026-05-03-1200");
    expect(r.summary?.newProposals).toContain("PROP-009");
  });

  it("counts tool calls and touched paths from a transcript JSONL", async () => {
    const repo = seedRepo();
    const transcript = join(repo, "transcript.jsonl");
    const entry = (name: string, file: string) =>
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name, input: { file_path: file } }] },
      });
    writeFileSync(
      transcript,
      [entry("Edit", "a.ts"), entry("Write", "b.ts"), entry("Read", "a.ts")].join("\n"),
      "utf8",
    );
    const r = await runLastTurnSummary({
      cwd: repo,
      now: Date.now(),
      transcriptPath: transcript,
    });
    expect(r.summary?.toolCounts.Edit).toBe(1);
    expect(r.summary?.toolCounts.Write).toBe(1);
    expect(r.summary?.toolCounts.Read).toBe(1);
    expect(r.summary?.filesTouched).toBe(2); // a.ts + b.ts deduped
  });

  it("falls back to recent source activity when a Stop hook has no transcript payload", async () => {
    const repo = seedRepo();
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "app.ts"), "export const app = true;\n", "utf8");

    const r = await runLastTurnSummary({
      cwd: repo,
      requireTranscript: true,
      now: Date.now(),
    });

    expect(r.exitCode).toBe(0);
    expect(r.summary?.filesTouched).toBe(1);
    expect(r.summary?.toolCounts).toEqual({ Edit: 0, Write: 0, Bash: 0, Read: 0 });
  });

  it("can refuse to overwrite the summary when a required transcript is missing", async () => {
    const repo = seedRepo();
    const r = await runLastTurnSummary({ cwd: repo, requireTranscript: true });
    expect(r.exitCode).toBe(1);
    expect(r.path).toBeUndefined();
    expect(existsSync(join(repo, ".cairndex", "state", "last-turn-summary.json"))).toBe(false);
    expect(r.message).toContain("requires a Claude Code Stop-hook transcript payload");
  });

  it("missing vault returns exit 1", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-lts-empty-"));
    dirs.push(repo);
    const r = await runLastTurnSummary({ cwd: repo });
    expect(r.exitCode).toBe(1);
  });
});
