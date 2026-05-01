import type { FastifyInstance } from "fastify";

export async function registerProjectsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects", async () => app.projects);
}
