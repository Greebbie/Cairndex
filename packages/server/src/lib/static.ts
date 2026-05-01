import { existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";

export async function registerStatic(app: FastifyInstance, rootDir?: string): Promise<void> {
  if (!rootDir) return;
  if (!existsSync(rootDir)) {
    app.log.warn(`static: rootDir ${rootDir} does not exist; skipping`);
    return;
  }
  const fastifyStatic = (await import("@fastify/static")).default;
  // wildcard: true so /assets/*.js, /assets/*.css, etc. are served as real files.
  // Any path that doesn't map to a file (SPA routes like /p/demo) falls into the
  // 404 handler below, which returns index.html so React Router can take over.
  await app.register(fastifyStatic, {
    root: rootDir,
    prefix: "/",
    wildcard: true,
  });
  app.setNotFoundHandler((req, reply) => {
    // Don't shadow API 404s with index.html.
    if (req.url.startsWith("/api/") || req.url === "/health") {
      return reply.code(404).send({ error: "not found" });
    }
    return reply.sendFile("index.html");
  });
}
