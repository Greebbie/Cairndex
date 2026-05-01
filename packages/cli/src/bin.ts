import { Command } from "commander";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runInsightPromote, runInsightPull } from "./commands/insight.js";
import { runSyncCmd } from "./commands/sync.js";
import { runUi } from "./commands/ui.js";

const program = new Command();

program
  .name("cairndex")
  .description("Markdown-native project memory for AI-assisted coding")
  .version("0.0.0");

program
  .command("init")
  .description("Initialize cairndex in the current repo")
  .option("--cwd <path>", "Working directory (default: current directory)", process.cwd())
  .option("--yes", "Skip interactive prompts", false)
  .option("--no-claude-md", "Do not modify CLAUDE.md")
  .option("--no-hooks", "Do not write .claude/settings.json hooks")
  .option("--alias <name>", "Project alias for the global registry")
  .action(async (opts) => {
    await runInit({
      cwd: opts.cwd,
      yes: opts.yes,
      claudeMd: opts.claudeMd !== false,
      hooks: opts.hooks !== false,
      alias: opts.alias,
    });
  });

async function readStdinJson(): Promise<Record<string, unknown> | null> {
  // Skip if stdin is a TTY (interactive use, not a hook payload).
  if (process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

program
  .command("doctor")
  .description("Validate vault, show status, optionally auto-fix")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--fix", "Auto-fix safe issues", false)
  .option("--silent", "No output, exit code only", false)
  .option("--scope <mode>", "Validation scope: changed | all", "all")
  .option("--auto-session", "Generate a session note from the recent transcript", false)
  .option("--filter-path <prefix>", "Only check files under this path prefix")
  .action(async (opts) => {
    let transcriptPath: string | undefined;
    if (opts.autoSession) {
      const payload = await readStdinJson();
      if (payload && typeof payload.transcript_path === "string") {
        transcriptPath = payload.transcript_path;
      }
    }
    const r = await runDoctor({
      cwd: opts.cwd,
      silent: opts.silent,
      fix: opts.fix,
      scope: opts.scope,
      autoSession: opts.autoSession,
      filterPath: opts.filterPath,
      ...(transcriptPath ? { transcriptPath } : {}),
    });
    process.exit(r.exitCode);
  });
program
  .command("sync")
  .description("Sync rules and templates from global ~/.cairndex/shared into project")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--silent", "No output, exit code only", false)
  .action(async (opts) => {
    const r = await runSyncCmd({ cwd: opts.cwd, silent: opts.silent });
    process.exit(r.exitCode);
  });
program
  .command("ui")
  .description("Launch local web GUI + watcher")
  .option("--port <n>", "Port to bind", (v) => Number.parseInt(v, 10), 7777)
  .option("--no-open", "Do not auto-open the browser")
  .action(async (opts) => {
    await runUi({ port: opts.port, openBrowser: opts.open !== false });
    // runUi never returns under normal operation (server keeps running)
  });

const insight = program.command("insight").description("Cross-project insight management");

insight
  .command("promote <id>")
  .description("Promote a project insight to ~/.cairndex/shared/insights/")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (id, opts) => {
    const r = await runInsightPromote({ cwd: opts.cwd, id });
    if (r.message) console.error(r.message);
    process.exit(r.exitCode);
  });

insight
  .command("pull <id>")
  .description("Pull a global insight into the current project")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (id, opts) => {
    const r = await runInsightPull({ cwd: opts.cwd, id });
    if (r.message) console.error(r.message);
    process.exit(r.exitCode);
  });

export { program };

if (process.env.CAIRNDEX_SKIP_PARSE !== "1") {
  void program.parseAsync(process.argv);
}
