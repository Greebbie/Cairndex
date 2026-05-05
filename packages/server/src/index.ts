import type { ProjectEntry } from "@cairndex/core";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { SseHub } from "./lib/sseHub.js";
import type { OnboardingHooks } from "./routes/onboarding.js";

export { SseHub } from "./lib/sseHub.js";
export type { SseEvent } from "./lib/sseHub.js";
export type { OnboardingHooks } from "./routes/onboarding.js";

export interface CreateServerInput {
  projects: readonly ProjectEntry[];
  logger?: boolean;
  webRoot?: string;
  onboarding?: OnboardingHooks;
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

  // Hold projects in a mutable array but expose it as readonly to consumers.
  // Onboarding routes refresh it in place via `setProjects` after registration.
  const projectsState: ProjectEntry[] = [...input.projects];
  const setProjects = (next: readonly ProjectEntry[]): void => {
    projectsState.length = 0;
    projectsState.push(...next);
  };
  app.decorate("projects", projectsState as readonly ProjectEntry[]);
  app.decorate("setProjects", setProjects);

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
  const { registerDashboardRoutes } = await import("./routes/dashboard.js");
  const { registerPackRoutes } = await import("./routes/pack.js");
  const { registerInboxRoutes } = await import("./routes/inbox.js");
  const { registerRulesRoutes } = await import("./routes/rules.js");
  const { registerLastTurnSummaryRoutes } = await import("./routes/lastTurnSummary.js");
  const { registerIntentRoutes } = await import("./routes/intent.js");
  const { registerUserPreferencesRoutes } = await import("./routes/userPreferences.js");
  const { registerClaudeCodeRoutes } = await import("./routes/claudeCode.js");
  const { registerWorkflowRoutes } = await import("./routes/workflow.js");
  const { registerHandoffRoutes } = await import("./routes/handoff.js");
  const { registerImplementationRoutes } = await import("./routes/implementation.js");
  const { registerResumeRoutes } = await import("./routes/resume.js");
  const { registerCloseOutRoutes } = await import("./routes/closeout.js");

  await registerProjectsRoutes(app);
  await registerVaultRoutes(app);
  await registerChangesRoutes(app);
  await registerConfigRoutes(app);
  await registerDoctorRoutes(app);
  await registerSyncRoutes(app);
  await registerInsightRoutes(app);
  await registerEventsRoutes(app, hub);
  await registerDashboardRoutes(app);
  await registerPackRoutes(app);
  await registerInboxRoutes(app);
  await registerRulesRoutes(app);
  await registerLastTurnSummaryRoutes(app);
  await registerIntentRoutes(app);
  await registerUserPreferencesRoutes(app);
  await registerClaudeCodeRoutes(app);
  await registerWorkflowRoutes(app);
  await registerHandoffRoutes(app);
  await registerImplementationRoutes(app);
  await registerResumeRoutes(app);
  await registerCloseOutRoutes(app);

  if (input.onboarding) {
    const { registerOnboardingRoutes } = await import("./routes/onboarding.js");
    await registerOnboardingRoutes(app, input.onboarding, setProjects);
  }

  const { registerStatic } = await import("./lib/static.js");
  await registerStatic(app, input.webRoot);

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    projects: readonly ProjectEntry[];
    sseHub: SseHub;
    setProjects: (next: readonly ProjectEntry[]) => void;
  }
}
