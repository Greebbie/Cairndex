import type { ProjectEntry } from "@cairndex/core";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { SseHub } from "./lib/sseHub.js";

export { SseHub } from "./lib/sseHub.js";
export type { SseEvent } from "./lib/sseHub.js";

export interface CreateServerInput {
  projects: readonly ProjectEntry[];
  logger?: boolean;
  webRoot?: string;
}

export type CreateServerResult = FastifyInstance;

export async function createServer(input: CreateServerInput): Promise<CreateServerResult> {
  const app = Fastify({ logger: input.logger ?? false });
  await app.register(cors, {
    origin: [
      "http://localhost:5173",
      "http://localhost:7777",
      /^http:\/\/127\.0\.0\.1:\d+$/,
      /^http:\/\/localhost:\d+$/,
    ],
    credentials: false,
  });

  // Pass projects via decorate so route plugins can access them.
  app.decorate("projects", input.projects);

  const hub = new SseHub();
  app.decorate("sseHub", hub);

  app.get("/health", async () => ({ ok: true }));

  const { registerProjectsRoutes } = await import("./routes/projects.js");
  const { registerVaultRoutes } = await import("./routes/vault.js");
  const { registerChangesRoutes } = await import("./routes/changes.js");
  const { registerConfigRoutes } = await import("./routes/config.js");
  const { registerDoctorRoutes } = await import("./routes/doctor.js");
  const { registerSyncRoutes } = await import("./routes/sync.js");
  const { registerInsightRoutes } = await import("./routes/insight.js");
  const { registerEventsRoutes } = await import("./routes/events.js");

  await registerProjectsRoutes(app);
  await registerVaultRoutes(app);
  await registerChangesRoutes(app);
  await registerConfigRoutes(app);
  await registerDoctorRoutes(app);
  await registerSyncRoutes(app);
  await registerInsightRoutes(app);
  await registerEventsRoutes(app, hub);

  const { registerStatic } = await import("./lib/static.js");
  await registerStatic(app, input.webRoot);

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    projects: readonly ProjectEntry[];
    sseHub: SseHub;
  }
}
