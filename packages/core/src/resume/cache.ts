import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { resumeJsonPath, resumeMdPath } from "../paths.js";
import { renderCliFlavor } from "./renderers.js";
import type { ResumeView } from "./types.js";

export interface WriteResumeCacheOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  view: ResumeView;
}

export async function writeResumeCache(opts: WriteResumeCacheOptions): Promise<void> {
  // Resolve target paths.
  // Note: paths helpers take repoRoot; treat opts.cwd as repoRoot. The vault-resolution
  // shim (vaultRoot / projectId) only kicks in inside vaultPath() if a central pointer
  // exists at opts.cwd — which is the right behavior; the paths helpers handle it.
  const jsonPath = resumeJsonPath(opts.cwd);
  const mdPath = resumeMdPath(opts.cwd);

  await fs.mkdir(dirname(jsonPath), { recursive: true });

  const wrapper = {
    generated: true,
    sources: opts.view.sources,
    builtAt: opts.view.builtAt,
    view: opts.view,
  };
  await fs.writeFile(jsonPath, JSON.stringify(wrapper, null, 2) + "\n");

  // YAML header above the human-rendered body. Kept readable rather than
  // js-yaml-roundtripped so humans can inspect it without a parser.
  // Source paths may contain Windows separators or colons (e.g. C:\Users\...).
  // We single-quote each source path so YAML parsers handle colons and backslashes
  // safely, doubling any embedded single-quotes per the YAML spec.
  const quotedSources = opts.view.sources.map((s) => `  - '${s.replace(/'/g, "''")}'`);
  const sourcesYaml =
    quotedSources.length === 0
      ? "sources: []"
      : "sources:\n" + quotedSources.join("\n");

  const mdHeader = [
    "---",
    "generated: true",
    sourcesYaml,
    `builtAt: '${opts.view.builtAt}'`,
    "---",
    "",
  ].join("\n");

  await fs.writeFile(mdPath, mdHeader + renderCliFlavor(opts.view));
}
