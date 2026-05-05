import { readIntent } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";

/**
 * Returns the active pre-flight intent (or null) for the given project.
 *
 * The intent file at `<vault>/state/current-intent.md` is written by `cairndex intent set`
 * before the agent starts non-trivial work, and cleared by the Stop hook chain at end-of-turn.
 * Surfacing it on the dashboard lets the user confirm the agent's pre-flight contract
 * matches their intent — the same signal the terminal banner gives, but visible from
 * the global cockpit view.
 *
 * 200 / { intent: null } when the file is absent (most turns, since Stop clears it).
 * The 200 + null shape lets the client render a clean "no active intent" empty state
 * without treating absence as an error.
 */
export async function registerIntentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/:alias/intent", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });
    try {
      const intent = await readIntent(project.path);
      return { intent };
    } catch (err) {
      app.log.warn({ err, alias }, "intent file unreadable");
      return { intent: null };
    }
  });
}
