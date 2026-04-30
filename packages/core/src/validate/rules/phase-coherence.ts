import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../../frontmatter.js";
import { vaultPath } from "../../paths.js";
import type { ValidationRule } from "../types.js";

export const phaseCoherence: ValidationRule = {
  name: "phase-coherence",
  run(ctx) {
    const indexPath = join(vaultPath(ctx.repoRoot), "index.md");
    if (!existsSync(indexPath)) return [];
    const raw = readFileSync(indexPath, "utf8");
    const { data } = parseFrontmatter<Record<string, unknown>>(raw);
    const phase = String(data.phase ?? "");
    if (phase !== "implementing") return [];

    const plansDir = join(vaultPath(ctx.repoRoot), "plans");
    const hasPlans =
      existsSync(plansDir) &&
      readdirSync(plansDir).some((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");
    if (hasPlans) return [];

    return [
      {
        rule: "phase-coherence",
        severity: "warn" as const,
        message: "index.md says phase: implementing but plans/ has no plan files",
        path: indexPath,
        fixable: false,
      },
    ];
  },
};
