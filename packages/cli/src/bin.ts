import { Command } from "commander";
import { runArchive } from "./commands/archive.js";
import { runConsolidate } from "./commands/consolidate.js";
import { runContext } from "./commands/context.js";
import { runDoctor } from "./commands/doctor.js";
import { runEmitClaudeMd } from "./commands/emitClaudeMd.js";
import {
  runInboxAccept,
  runInboxList,
  runInboxPropose,
  runInboxReject,
} from "./commands/inbox.js";
import { runInit } from "./commands/init.js";
import { runMcp } from "./commands/mcp.js";
import { runInsightPromote, runInsightPull } from "./commands/insight.js";
import { runSweep } from "./commands/sweep.js";
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

program
  .command("context")
  .description("Build a token-budgeted context pack for the current vault state")
  .argument("[task]", "Task label — used for logging/caching only, does not affect selection")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd for vault discovery)")
  .option("--budget <n>", "Token budget cap", (v) => Number.parseInt(v, 10))
  .option("--out <path>", "Override output path (absolute or vault-relative)")
  .option("--no-stdout", "Do not print pack body to stdout (file only)")
  .action(async (task: string | undefined, opts) => {
    const callOpts: Parameters<typeof runContext>[0] = {
      cwd: opts.cwd,
      emitStdout: opts.stdout !== false,
    };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (task !== undefined) callOpts.task = task;
    if (typeof opts.budget === "number" && !Number.isNaN(opts.budget)) callOpts.budget = opts.budget;
    if (opts.out) callOpts.out = opts.out;
    const r = await runContext(callOpts);
    if (r.message) console.error(r.message);
    process.exit(r.exitCode);
  });

const emit = program.command("emit").description("Regenerate derived agent surfaces from the vault");

emit
  .command("claude-md")
  .description("Regenerate the cairndex region inside CLAUDE.md from the current vault state")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--out <path>", "Override CLAUDE.md path (absolute or vault-relative)")
  .action(async (opts) => {
    const callOpts: Parameters<typeof runEmitClaudeMd>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.out) callOpts.claudeMdPath = opts.out;
    const r = await runEmitClaudeMd(callOpts);
    if (r.message) console.error(r.message);
    process.exit(r.exitCode);
  });

program
  .command("consolidate")
  .description(
    "Scan recent sessions for repeated node references and draft insight proposals into the inbox",
  )
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--lookback <days>", "Lookback window in days (default 30)", (v) =>
    Number.parseInt(v, 10),
  )
  .option("--min-mentions <n>", "Minimum sessions before drafting (default 3)", (v) =>
    Number.parseInt(v, 10),
  )
  .action(async (opts) => {
    const callOpts: Parameters<typeof runConsolidate>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (typeof opts.lookback === "number" && !Number.isNaN(opts.lookback)) {
      callOpts.lookbackDays = opts.lookback;
    }
    if (typeof opts.minMentions === "number" && !Number.isNaN(opts.minMentions)) {
      callOpts.minMentions = opts.minMentions;
    }
    const r = await runConsolidate(callOpts);
    if (r.message) console.error(r.message);
    if (r.result) {
      console.log(
        `consolidate: ${r.result.proposalsCreated} proposal(s) created, ${r.result.candidates.length} candidate target(s) examined.`,
      );
      for (const c of r.result.candidates) {
        const status = c.proposalId
          ? `proposed as ${c.proposalId}`
          : c.skipped === "covered"
            ? "skipped (covered by existing insight)"
            : c.skipped === "duplicate"
              ? "skipped (duplicate proposal)"
              : "skipped";
        console.log(`  ${c.target}: ${c.mentions} mention(s) — ${status}`);
      }
    }
    process.exit(r.exitCode);
  });

program
  .command("archive")
  .description(
    "Scan the vault for stale, low-confidence, unverified nodes and draft archive proposals into the inbox",
  )
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--age <days>", "Minimum age in days before a node is a candidate (default 180)", (v) =>
    Number.parseInt(v, 10),
  )
  .option(
    "--confidence-threshold <n>",
    "Confidence below which a node counts as low-confidence (default 0.5)",
    (v) => Number.parseFloat(v),
  )
  .action(async (opts) => {
    const callOpts: Parameters<typeof runArchive>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (typeof opts.age === "number" && !Number.isNaN(opts.age)) {
      callOpts.ageDays = opts.age;
    }
    if (
      typeof opts.confidenceThreshold === "number" &&
      !Number.isNaN(opts.confidenceThreshold)
    ) {
      callOpts.confidenceThreshold = opts.confidenceThreshold;
    }
    const r = await runArchive(callOpts);
    if (r.message) console.error(r.message);
    if (r.result) {
      console.log(
        `archive: ${r.result.proposalsCreated} proposal(s) created, ${r.result.candidates.length} node(s) examined.`,
      );
      for (const c of r.result.candidates) {
        const status = c.proposalId
          ? `proposed as ${c.proposalId}`
          : c.skipped
            ? `skipped (${c.skipped})`
            : "skipped";
        console.log(
          `  ${c.nodeType}/${c.nodeId}  age=${Math.round(c.ageDays)}d  conf=${
            c.confidence === undefined ? "?" : c.confidence.toFixed(2)
          }  status=${c.status || "(empty)"}  — ${status}`,
        );
      }
    }
    process.exit(r.exitCode);
  });

program
  .command("sweep")
  .description(
    "Run consolidate + archive together — drafts insight and archive proposals into the inbox. Safe to run on every session end (idempotent via dedupe).",
  )
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--silent", "Suppress per-candidate output (still prints summary unless 0/0)", false)
  .option("--lookback <days>", "Consolidate lookback window (default 30)", (v) =>
    Number.parseInt(v, 10),
  )
  .option("--min-mentions <n>", "Consolidate min mentions (default 3)", (v) =>
    Number.parseInt(v, 10),
  )
  .option("--age <days>", "Archive min age (default 180)", (v) => Number.parseInt(v, 10))
  .option(
    "--confidence-threshold <n>",
    "Archive confidence threshold (default 0.5)",
    (v) => Number.parseFloat(v),
  )
  .action(async (opts) => {
    const callOpts: Parameters<typeof runSweep>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (typeof opts.lookback === "number" && !Number.isNaN(opts.lookback)) {
      callOpts.lookbackDays = opts.lookback;
    }
    if (typeof opts.minMentions === "number" && !Number.isNaN(opts.minMentions)) {
      callOpts.minMentions = opts.minMentions;
    }
    if (typeof opts.age === "number" && !Number.isNaN(opts.age)) {
      callOpts.ageDays = opts.age;
    }
    if (
      typeof opts.confidenceThreshold === "number" &&
      !Number.isNaN(opts.confidenceThreshold)
    ) {
      callOpts.confidenceThreshold = opts.confidenceThreshold;
    }
    const r = await runSweep(callOpts);
    if (r.message) console.error(r.message);
    if (r.exitCode === 0) {
      const cCreated = r.consolidate?.proposalsCreated ?? 0;
      const aCreated = r.archive?.proposalsCreated ?? 0;
      const cExamined = r.consolidate?.candidates.length ?? 0;
      const aExamined = r.archive?.candidates.length ?? 0;
      const isQuiet = opts.silent && cCreated === 0 && aCreated === 0;
      if (!isQuiet) {
        console.log(
          `sweep: consolidate=${cCreated}/${cExamined} archive=${aCreated}/${aExamined} (proposals/candidates)`,
        );
      }
      if (!opts.silent) {
        if (r.consolidate && r.consolidate.candidates.length > 0) {
          console.log("  consolidate:");
          for (const c of r.consolidate.candidates) {
            const status = c.proposalId
              ? `proposed as ${c.proposalId}`
              : c.skipped
                ? `skipped (${c.skipped})`
                : "skipped";
            console.log(`    ${c.target}: ${c.mentions} mention(s) — ${status}`);
          }
        }
        if (r.archive && r.archive.candidates.length > 0) {
          console.log("  archive:");
          for (const c of r.archive.candidates) {
            const status = c.proposalId
              ? `proposed as ${c.proposalId}`
              : c.skipped
                ? `skipped (${c.skipped})`
                : "skipped";
            console.log(
              `    ${c.nodeType}/${c.nodeId}  age=${Math.round(c.ageDays)}d — ${status}`,
            );
          }
        }
      }
    }
    process.exit(r.exitCode);
  });

program
  .command("mcp")
  .description("Start an MCP (Model Context Protocol) server over stdio for the current vault")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .action(async (opts) => {
    const callOpts: Parameters<typeof runMcp>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    const r = await runMcp(callOpts);
    if (r.message) console.error(r.message);
    process.exit(r.exitCode);
  });

const inbox = program
  .command("inbox")
  .description("Review-and-accept queue for agent-proposed memory updates");

inbox
  .command("list")
  .description("Show pending and recently accepted/rejected proposals")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .action(async (opts) => {
    const callOpts: Parameters<typeof runInboxList>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    const r = await runInboxList(callOpts);
    if (r.message) console.error(r.message);
    if (r.list) {
      const fmt = (label: string, items: typeof r.list.pending) => {
        if (items.length === 0) return;
        console.log(`\n${label} (${items.length}):`);
        for (const p of items) {
          const t = p.target ?? "(new)";
          console.log(
            `  ${p.proposalId}  ${p.proposalType}  ${p.targetType}/${t}  — ${p.summary}`,
          );
        }
      };
      fmt("PENDING", r.list.pending);
      fmt("ACCEPTED", r.list.accepted);
      fmt("REJECTED", r.list.rejected);
      fmt("DUPLICATE", r.list.duplicate);
      const totalPending = r.list.pending.length;
      console.log(
        `\n${totalPending} pending  ${r.list.accepted.length} accepted  ${r.list.rejected.length} rejected`,
      );
    }
    process.exit(r.exitCode);
  });

inbox
  .command("accept <proposalId>")
  .description("Apply a pending proposal to the durable folder")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .action(async (proposalId, opts) => {
    const callOpts: Parameters<typeof runInboxAccept>[0] = { cwd: opts.cwd, proposalId };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    const r = await runInboxAccept(callOpts);
    if (r.message) console.error(r.message);
    if (r.applied) {
      console.log(
        `applied ${r.applied.action} -> ${r.applied.targetId} (${r.applied.targetPath})`,
      );
    }
    process.exit(r.exitCode);
  });

inbox
  .command("reject <proposalId>")
  .description("Reject a pending proposal")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--reason <text>", "Why this proposal was rejected", "no reason given")
  .action(async (proposalId, opts) => {
    const callOpts: Parameters<typeof runInboxReject>[0] = {
      cwd: opts.cwd,
      proposalId,
      reason: opts.reason,
    };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    const r = await runInboxReject(callOpts);
    if (r.message) console.error(r.message);
    process.exit(r.exitCode);
  });

inbox
  .command("propose")
  .description(
    "Submit a memory-update proposal (agents normally use this; humans can too for testing)",
  )
  .requiredOption(
    "--type <type>",
    "Proposal type: update | create",
    (v) => v as "update" | "create",
    "update",
  )
  .requiredOption(
    "--target-type <nodeType>",
    "Durable folder: spec/decision/plan/task/...",
  )
  .option("--target <id>", "Existing node id (required for --type update)")
  .requiredOption("--summary <text>", "One-line description shown in inbox")
  .option("--reason <text>", "Why this change is proposed", "(no reason)")
  .option("--body-file <path>", "Read newBody from a file (otherwise reads stdin)")
  .option("--by <agent>", "createdBy provenance", "user")
  .option("--session <id>", "session id provenance", "manual")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .action(async (opts) => {
    let body: string;
    if (opts.bodyFile) {
      const fs = await import("node:fs/promises");
      body = await fs.readFile(opts.bodyFile, "utf8");
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      body = Buffer.concat(chunks).toString("utf8");
    }
    const callOpts: Parameters<typeof runInboxPropose>[0] = {
      cwd: opts.cwd,
      proposalType: opts.type,
      targetType: opts.targetType,
      newBody: body,
      summary: opts.summary,
      reason: opts.reason,
      createdBy: opts.by,
      session: opts.session,
    };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.target) callOpts.target = opts.target;
    const r = await runInboxPropose(callOpts);
    if (r.message) console.error(r.message);
    if (r.proposalId) {
      console.log(`proposed ${r.proposalId} -> ${r.path}`);
      if (r.duplicateOf) console.log(`note: identical content already proposed as ${r.duplicateOf}`);
    }
    process.exit(r.exitCode);
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
