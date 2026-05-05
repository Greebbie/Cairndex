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
    vaultRoot: opts.vaultRoot,
    projectId: opts.projectId,
  });
  const view = await buildResumeView({
    cwd: root,
    vaultRoot: opts.vaultRoot,
    projectId: opts.projectId,
  });
  await writeResumeCache({
    cwd: root,
    vaultRoot: opts.vaultRoot,
    projectId: opts.projectId,
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
