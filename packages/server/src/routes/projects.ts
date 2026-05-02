import { resolveProjectRef } from "@cairndex/core";
import type { FastifyInstance } from "fastify";

/**
 * `/api/projects` enriches each registry entry with `vaultRoot` + `projectId` when
 * the repo has a `.cairndex-project.yaml` pointer, so the GUI can show the user
 * where their durable memory actually lives without making them dig through
 * Settings → Rules. Failures (unreadable pointer, etc.) are swallowed — the
 * entry simply omits the optional fields.
 */
export async function registerProjectsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects", async () => {
    return app.projects.map((p) => {
      try {
        const ref = resolveProjectRef({ cwd: p.path, legacyFallback: false });
        if (ref && ref.projectId !== "legacy") {
          return {
            ...p,
            vaultRoot: ref.vaultRoot,
            projectId: ref.projectId,
            projectRoot: ref.projectRoot,
          };
        }
      } catch {
        // pointer unreadable → return the unenriched entry below.
      }
      return p;
    });
  });
}
