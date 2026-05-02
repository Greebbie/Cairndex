import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInsightProposeFromSession } from "../src/commands/insight.js";

describe("runInsightProposeFromSession", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function seedRepo(): string {
    const repo = mkdtempSync(join(tmpdir(), "cairn-insight-distill-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "sessions"), { recursive: true });
    mkdirSync(join(vault, "insights"), { recursive: true });
    mkdirSync(join(vault, "inbox", "proposed-memory-updates"), { recursive: true });
    writeFileSync(join(vault, "index.md"), "# Index\n", "utf8");
    return repo;
  }

  it("skips silently when the session has no decisions or repeated ids", async () => {
    const repo = seedRepo();
    writeFileSync(
      join(repo, ".cairndex", "sessions", "2026-05-03-1100.md"),
      "---\n---\nworked on stuff\n",
      "utf8",
    );
    const r = await runInsightProposeFromSession({ cwd: repo, sessionId: "2026-05-03-1100" });
    expect(r.exitCode).toBe(0);
    expect(r.skipReason).toBe("no-signal");
    expect(r.proposalId).toBeUndefined();
  });

  it("creates an insight proposal when a decision phrase is present", async () => {
    const repo = seedRepo();
    writeFileSync(
      join(repo, ".cairndex", "sessions", "2026-05-03-1200.md"),
      "---\n---\nWe decided to ship SEA before Tauri.\nSPEC-001 carries the work.\nSPEC-001 lands next week.\n",
      "utf8",
    );
    const r = await runInsightProposeFromSession({ cwd: repo, sessionId: "2026-05-03-1200" });
    expect(r.exitCode).toBe(0);
    expect(r.proposalId).toMatch(/^PROP-\d+$/);
    expect(r.path).toBeDefined();
    expect(existsSync(r.path ?? "")).toBe(true);
    const proposalFile = readFileSync(r.path ?? "", "utf8");
    expect(proposalFile).toMatch(/proposalType: create/);
    expect(proposalFile).toMatch(/targetType: insight/);
    expect(proposalFile).toMatch(/Auto-distilled insight/);
  });

  it("reports duplicate when the same body is proposed twice", async () => {
    const repo = seedRepo();
    writeFileSync(
      join(repo, ".cairndex", "sessions", "2026-05-03-1300.md"),
      "---\n---\nWe agreed to migrate to McpServer in PROP-007.\nPROP-007 is the right call.\nPROP-007 ships soon.\n",
      "utf8",
    );
    const first = await runInsightProposeFromSession({ cwd: repo, sessionId: "2026-05-03-1300" });
    expect(first.proposalId).toBeDefined();
    const second = await runInsightProposeFromSession({ cwd: repo, sessionId: "2026-05-03-1300" });
    expect(second.skipReason).toBe("duplicate");
    expect(second.duplicateOf).toBe(first.proposalId);
  });

  it("missing session reports skip-reason without erroring", async () => {
    const repo = seedRepo();
    const r = await runInsightProposeFromSession({ cwd: repo, sessionId: "2026-99-99-9999" });
    expect(r.exitCode).toBe(0);
    expect(r.skipReason).toBe("session-missing");
  });

  it("captures decision phrases from the transcript even when the session body is empty", async () => {
    const repo = seedRepo();
    // Session body is the boilerplate TODO placeholder produced by doctor --auto-session.
    writeFileSync(
      join(repo, ".cairndex", "sessions", "2026-05-03-1500.md"),
      "---\n---\n## What I did\n\n(TODO: describe the work in 1–3 bullets.)\n",
      "utf8",
    );
    // Transcript contains the actual decision the agent made during the turn.
    const transcript = join(repo, "transcript.jsonl");
    const userMsg = JSON.stringify({
      type: "user",
      message: { content: "let's go with central-pointer-aware vaultPath" },
    });
    const assistantMsg = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "text",
            text: "We decided to make vaultPath follow the central-vault pointer file when present, so server routes don't need to pre-resolve.",
          },
        ],
      },
    });
    writeFileSync(transcript, [userMsg, assistantMsg].join("\n"), "utf8");

    const r = await runInsightProposeFromSession({
      cwd: repo,
      sessionId: "2026-05-03-1500",
      transcriptPath: transcript,
    });
    expect(r.exitCode).toBe(0);
    expect(r.proposalId).toMatch(/^PROP-\d+$/);
    const body = readFileSync(r.path ?? "", "utf8");
    // Heuristic should have surfaced the "decided to make vaultPath follow…" phrase
    // from the transcript as a decision-like phrase. Without the transcript-text
    // fix this draft would only have fired on weak repeated-id signals (or skipped).
    expect(body).toMatch(/decision-like/);
    expect(body).toMatch(/vaultPath/);
  });
});
