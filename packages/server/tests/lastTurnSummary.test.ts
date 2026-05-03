import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-srv-lts-"));
  mkdirSync(join(tmp, ".cairndex/state"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/changes"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function makeApp() {
  return await createServer({
    projects: [{ path: tmp, alias: "demo", registered_at: "2026-05-02T00:00:00Z" }],
  });
}

function writeSummary(payload: Record<string, unknown>) {
  writeFileSync(
    join(tmp, ".cairndex/state/last-turn-summary.json"),
    JSON.stringify(payload),
    "utf8",
  );
}

function writeChangelog(body: string) {
  writeFileSync(join(tmp, ".cairndex/changes/changelog.md"), body, "utf8");
}

describe("GET /api/vault/:alias/last-turn-summary", () => {
  it("returns { summary: null } when the state file does not exist", async () => {
    const app = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/last-turn-summary" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ summary: null });
    await app.close();
  });

  it("merges events from the changelog — slice between previous and latest 'Session recorded' lines", async () => {
    writeSummary({
      ts: "2026-05-02T22:42:00Z",
      filesTouched: 3,
      toolCounts: { Edit: 5, Write: 1, Bash: 2, Read: 4 },
      newProposals: ["PROP-007"],
      latestSessionId: "2026-05-02-2242",
    });
    // Append-only chronological log: oldest first, newest last.
    writeChangelog(
      [
        "# Changelog",
        "",
        "- 2026-05-02 — Session 2026-05-02-1900 recorded (Edit×10 Write×2 Bash×5 Read×8)",
        "- 2026-05-02 — Accepted PROP-003 → created insight/INS-001",
        "- 2026-05-02 — Rejected PROP-005",
        "- 2026-05-02 — task switch → TASK-001",
        "- 2026-05-02 — Session 2026-05-02-2242 recorded (Edit×5 Write×1 Bash×2 Read×4)",
        "",
      ].join("\n"),
    );

    const app = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/last-turn-summary" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as {
      summary: { events: Array<{ date: string; summary: string }>; latestSessionId: string };
    };
    // Should contain the three events between the two session lines + the trailing
    // "Session ... recorded" anchor itself, in chronological order.
    expect(body.summary.events).toEqual([
      { date: "2026-05-02", summary: "Accepted PROP-003 → created insight/INS-001" },
      { date: "2026-05-02", summary: "Rejected PROP-005" },
      { date: "2026-05-02", summary: "task switch → TASK-001" },
      {
        date: "2026-05-02",
        summary: "Session 2026-05-02-2242 recorded (Edit×5 Write×1 Bash×2 Read×4)",
      },
    ]);
    await app.close();
  });

  it("returns events: [] when the changelog has only one session-recorded line (no previous boundary)", async () => {
    writeSummary({
      ts: "2026-05-02T19:00:00Z",
      filesTouched: 0,
      toolCounts: { Edit: 0, Write: 0, Bash: 0, Read: 0 },
      newProposals: [],
      latestSessionId: "2026-05-02-1900",
    });
    writeChangelog(
      [
        "# Changelog",
        "",
        "- 2026-05-02 — Accepted PROP-001",
        "- 2026-05-02 — Session 2026-05-02-1900 recorded",
        "",
      ].join("\n"),
    );

    const app = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/last-turn-summary" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { summary: { events: Array<{ summary: string }> } };
    // With only one session line, all preceding events count as "this turn" + the anchor.
    expect(body.summary.events.map((e) => e.summary)).toEqual([
      "Accepted PROP-001",
      "Session 2026-05-02-1900 recorded",
    ]);
    await app.close();
  });

  it("survives a missing changelog by returning events: []", async () => {
    writeSummary({
      ts: "2026-05-02T19:00:00Z",
      filesTouched: 0,
      toolCounts: { Edit: 0, Write: 0, Bash: 0, Read: 0 },
      newProposals: [],
      latestSessionId: null,
    });
    rmSync(join(tmp, ".cairndex/changes"), { recursive: true, force: true });

    const app = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/last-turn-summary" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { summary: { events: unknown[] } };
    expect(body.summary.events).toEqual([]);
    await app.close();
  });
});
