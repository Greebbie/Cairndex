import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { vaultPath } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";

interface ChangelogEvent {
  date: string;
  summary: string;
}

const LINE_RE = /^- (\d{4}-\d{2}-\d{2})\s+—\s+(.+)$/;
const SESSION_RECORDED_RE = /^Session\s+\S+\s+recorded\b/;

/**
 * Slice the changelog into "this turn's events" — the changelog lines appended
 * between the previous `Session ... recorded` line and the most recent one.
 *
 * Conventions used:
 *   - `changes/changelog.md` is appended in append-only chronological order
 *     (oldest first, newest last). See `appendChangelog` in core.
 *   - Every Stop hook ends with a `Session <id> recorded …` line, so consecutive
 *     "session" lines act as turn boundaries.
 *   - Events between them — accept/reject proposal, task switch / complete, phase
 *     change — are the narrative we want to show as "what just happened."
 *
 * Returns events in chronological (oldest → newest) order, including the trailing
 * `Session ... recorded` line itself so the user sees the turn anchor in context.
 * Returns an empty array when there's only one (or zero) session line — there's
 * no previous boundary to slice from.
 */
function eventsForLatestTurn(rawChangelog: string): ChangelogEvent[] {
  const events: ChangelogEvent[] = [];
  for (const line of rawChangelog.split("\n")) {
    const m = LINE_RE.exec(line.trim());
    if (m?.[1] && m[2]) events.push({ date: m[1], summary: m[2] });
  }
  // Find the indices of all "Session ... recorded" lines.
  const sessionIdxs: number[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev && SESSION_RECORDED_RE.test(ev.summary)) sessionIdxs.push(i);
  }
  if (sessionIdxs.length === 0) {
    // No session lines at all — return all events as the "current turn."
    // (Happens on a fresh project before the first Stop hook fires.)
    return events;
  }
  const lastIdx = sessionIdxs[sessionIdxs.length - 1] as number;
  const prevIdx = sessionIdxs.length >= 2 ? sessionIdxs[sessionIdxs.length - 2] : null;
  const startIdx = prevIdx === undefined || prevIdx === null ? 0 : prevIdx + 1;
  return events.slice(startIdx, lastIdx + 1);
}

/**
 * Returns the most recent end-of-turn summary written by the Stop hook chain
 * (`cairndex last-turn-summary`). Used by the dashboard to render a "this turn"
 * affordance — counts of new proposals, files touched, latest session id.
 *
 * Also derives `events` on the fly from `changes/changelog.md` so the UI can show
 * a narrative of what actually happened (proposals accepted/rejected, task switch /
 * complete, phase change) instead of just metrics. The events slice is computed
 * server-side because (a) the changelog can be long, (b) the parsing logic stays
 * centralized, (c) it's cheap.
 *
 * Returns `{ summary: null }` when the file does not yet exist (e.g. a fresh vault
 * before the first session ended). The 200/null shape lets the client render an
 * empty state without treating the absence as an error.
 */
export async function registerLastTurnSummaryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/:alias/last-turn-summary", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    // vaultPath now follows .cairndex-project.yaml pointers, so passing a central-vault
    // repo root resolves to <vaultRoot>/projects/<projectId>/. Legacy repos return
    // <repoRoot>/.cairndex/ as before.
    const summaryPath = join(vaultPath(project.path), "state", "last-turn-summary.json");
    const changelogPath = join(vaultPath(project.path), "changes", "changelog.md");
    if (!existsSync(summaryPath)) return { summary: null };
    try {
      const raw = await readFile(summaryPath, "utf8");
      const summary = JSON.parse(raw) as Record<string, unknown>;
      let events: ChangelogEvent[] = [];
      if (existsSync(changelogPath)) {
        try {
          const rawLog = await readFile(changelogPath, "utf8");
          events = eventsForLatestTurn(rawLog);
        } catch (logErr) {
          app.log.warn(
            { err: logErr, path: changelogPath },
            "changelog unreadable while building last-turn events",
          );
        }
      }
      return { summary: { ...summary, events } };
    } catch (err) {
      app.log.warn({ err, path: summaryPath }, "last-turn-summary unreadable");
      return { summary: null };
    }
  });
}
