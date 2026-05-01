import pino from "pino";

export const logger = pino({
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
