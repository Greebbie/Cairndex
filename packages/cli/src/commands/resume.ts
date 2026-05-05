import { buildResumeView, writeResumeCache, renderCliFlavor } from "@cairndex/core";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface ResumeOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  json?: boolean;
}

export async function runResume(opts: ResumeOptions): Promise<void> {
  const root = resolveMemoryRoot({
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
  });
  const view = await buildResumeView({
    cwd: root,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
  });
  await writeResumeCache({
    cwd: root,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
    view,
  });
  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        { generated: true, sources: view.sources, builtAt: view.builtAt, view },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(renderCliFlavor(view));
  }
}
