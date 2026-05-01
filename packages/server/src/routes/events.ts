import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";
import type { SseHub } from "../lib/sseHub.js";

export async function registerEventsRoutes(app: FastifyInstance, hub: SseHub): Promise<void> {
  app.get("/api/events/:alias", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    // initial heartbeat to flush headers
    reply.raw.write(": connected\n\n");

    const off = hub.subscribe(alias, (chunk) => reply.raw.write(chunk));
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      off();
      reply.raw.end();
    };

    req.raw.on("close", cleanup);
    reply.raw.on("error", cleanup);
  });
}
