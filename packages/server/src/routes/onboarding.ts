import { homedir } from "node:os";
import { join } from "node:path";
import { type ProjectEntry, listVaultProjects } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

export interface OnboardingHooks {
  initVault: (input: { path: string; title?: string }) => Promise<{ vaultRoot: string }>;
  registerProject: (input: {
    vaultRoot: string;
    projectId?: string;
    repoRoot: string;
    alias?: string;
    title?: string;
  }) => Promise<{ projectRoot: string; vaultRoot: string }>;
  onProjectRegistered?: (project: ProjectEntry) => Promise<void> | void;
}

const InitVaultBody = z.object({
  path: z.string().min(1),
  title: z.string().min(1).optional(),
});

const RegisterProjectBody = z.object({
  vault: z.string().min(1),
  project: z.string().min(1).optional(),
  repo: z.string().min(1),
  alias: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
});

// Node does not auto-expand `~` in paths. Tilde-prefix is so common in user-typed
// paths (especially in onboarding forms) that it's worth normalizing once at the
// boundary instead of pretending it never happens.
function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

function flattenZodError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

// Errors that come from "you typed a bad path" rather than "the server broke"
// should surface as 400 so the UI can render them as form-level validation.
function isUserInputError(message: string): boolean {
  return (
    /does not exist/i.test(message) ||
    /not found/i.test(message) ||
    /no central vault/i.test(message)
  );
}

export async function registerOnboardingRoutes(
  app: FastifyInstance,
  hooks: OnboardingHooks,
  setProjects: (next: readonly ProjectEntry[]) => void,
): Promise<void> {
  app.post("/api/vault/init", async (req, reply) => {
    const parsed = InitVaultBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: flattenZodError(parsed.error) });
    }
    try {
      const result = await hooks.initVault({
        path: expandHome(parsed.data.path),
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      });
      return { vaultRoot: result.vaultRoot };
    } catch (err) {
      const message = (err as Error).message;
      const code = isUserInputError(message) ? 400 : 500;
      return reply.code(code).send({ error: message });
    }
  });

  app.post("/api/projects/register", async (req, reply) => {
    const parsed = RegisterProjectBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: flattenZodError(parsed.error) });
    }
    try {
      const result = await hooks.registerProject({
        vaultRoot: expandHome(parsed.data.vault),
        ...(parsed.data.project !== undefined ? { projectId: parsed.data.project } : {}),
        repoRoot: expandHome(parsed.data.repo),
        ...(parsed.data.alias !== undefined ? { alias: parsed.data.alias } : {}),
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      });
      const fresh = await listVaultProjects(result.vaultRoot);
      setProjects(fresh);
      const newEntry =
        fresh.find((p) => p.projectRoot === result.projectRoot) ??
        fresh.find((p) => p.path === result.projectRoot);
      if (!newEntry) {
        return reply.code(500).send({ error: "project registered but not found in vault scan" });
      }
      if (hooks.onProjectRegistered) {
        try {
          await hooks.onProjectRegistered(newEntry);
        } catch (err) {
          // The project is registered and persisted; failing to start a watcher
          // shouldn't fail the whole request — just log it. The user can hit
          // refresh on the dashboard or restart `cairndex ui` to recover.
          app.log.warn({ err, alias: newEntry.alias }, "post-register hook failed");
        }
      }
      return {
        alias: newEntry.alias,
        projectId: newEntry.projectId ?? null,
        projectRoot: newEntry.projectRoot ?? newEntry.path,
        vaultRoot: result.vaultRoot,
      };
    } catch (err) {
      const message = (err as Error).message;
      const code = isUserInputError(message) ? 400 : 500;
      return reply.code(code).send({ error: message });
    }
  });
}
