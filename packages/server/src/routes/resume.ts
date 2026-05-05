import type { FastifyInstance } from "fastify";
import { buildResumeView, writeResumeCache } from "@cairndex/core";
import { resolveProject } from "../lib/resolveProject.js";

/**
 * Returns the current resume view for the given project as JSON.
 *
 * The resume view is built fresh on every request (so the dashboard always sees
 * up-to-date data) and written to `state/resume.json` + `state/resume.md` as a
 * side effect — keeping the cache in sync with whatever the dashboard last fetched.
 *
 * Response shape: `{ generated, sources, builtAt, view }` — identical to the
 * `--json` output of `cairndex resume` and the contents of `state/resume.json`.
 */
export async function registerResumeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/:alias/resume", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) {
      return reply.code(404).send({ error: "project not found" });
    }
    const view = await buildResumeView({ cwd: project.path });
    await writeResumeCache({ cwd: project.path, view });
    return {
      generated: true,
      sources: view.sources,
      builtAt: view.builtAt,
      view,
    };
  });
}
