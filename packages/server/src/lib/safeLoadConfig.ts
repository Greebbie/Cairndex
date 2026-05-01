import { type Config, defaultConfig, loadProjectConfig } from "@cairndex/core";
import type { FastifyBaseLogger } from "fastify";

export function safeLoadConfig(repoRoot: string, log?: FastifyBaseLogger): Config {
  try {
    return loadProjectConfig(repoRoot);
  } catch (err) {
    log?.warn({ err, repoRoot }, "safeLoadConfig: falling back to defaults due to parse error");
    return defaultConfig();
  }
}
