import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { vaultPath } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";

/**
 * Returns the most recent end-of-turn summary written by the Stop hook chain
 * (`cairndex last-turn-summary`). Used by the dashboard to render a "this turn"
 * affordance — counts of new proposals, files touched, latest session id.
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
    const path = join(vaultPath(project.path), "state", "last-turn-summary.json");
    if (!existsSync(path)) return { summary: null };
    try {
      const raw = await readFile(path, "utf8");
      return { summary: JSON.parse(raw) };
    } catch (err) {
      app.log.warn({ err, path }, "last-turn-summary unreadable");
      return { summary: null };
    }
  });
}
