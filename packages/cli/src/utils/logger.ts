import pino from "pino";

// Detect Node SEA — pino-pretty's transport spawns a worker thread that
// requires `pino-pretty/lib/worker.js` from disk. SEA has no node_modules,
// so the worker can't be resolved. Fall back to raw JSON logs there.
function isSeaRuntime(): boolean {
  // Tsup may bundle `node:sea` as a non-builtin if we use require/import,
  // so use eval to defer resolution to the actual Node runtime where the
  // bundle executes. Falls back to false (regular CJS bundle).
  try {
    // biome-ignore lint/security/noGlobalEval: Node SEA detection needs runtime require after bundling.
    const dynamicRequire = eval("require") as typeof require;
    const sea = dynamicRequire("node:sea") as { isSea?: () => boolean };
    return sea.isSea?.() ?? false;
  } catch {
    return false;
  }
}

export const logger = isSeaRuntime()
  ? pino({ level: process.env.CAIRNDEX_LOG_LEVEL ?? "info" })
  : pino({
      level: process.env.CAIRNDEX_LOG_LEVEL ?? "info",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname,time",
          singleLine: true,
        },
      },
    });

export function silent(): void {
  logger.level = "silent";
}
