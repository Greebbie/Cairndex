import { Command } from "commander";
import { runArchive } from "./commands/archive.js";
import { runBootstrap } from "./commands/bootstrap.js";
import { runConsolidate } from "./commands/consolidate.js";
import { runContext } from "./commands/context.js";
import { runDoctor } from "./commands/doctor.js";
import { runEmitClaudeMd } from "./commands/emitClaudeMd.js";
import {
  runInboxAccept,
  runInboxList,
  runInboxPropose,
  runInboxProposeUpdate,
  runInboxReject,
} from "./commands/inbox.js";
import { runInit } from "./commands/init.js";
import { runInsightPromote, runInsightProposeFromSession, runInsightPull } from "./commands/insight.js";
import { runLastTurnSummary } from "./commands/lastTurnSummary.js";
import { runMcp } from "./commands/mcp.js";
import {
  defaultProjectIdFromRepo,
  runProjectImportRepoVault,
  runProjectRegister,
} from "./commands/project.js";
import { runSessionLog } from "./commands/session.js";
import { runStatus } from "./commands/status.js";
import { runSweep } from "./commands/sweep.js";
import { runSyncCmd } from "./commands/sync.js";
import { runUi } from "./commands/ui.js";
import { runVaultInit } from "./commands/vault.js";
import { runPhaseSet, runTaskComplete, runTaskSwitch } from "./commands/workflow.js";

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

const vault = program
  .command("vault")
  .description(
    "Manage a central Cairndex vault — one folder containing structured project memory for all your repositories.",
  );

vault
  .command("init <path>")
  .description("Create a central Cairndex vault")
  .option("--title <title>", "Vault title")
  .action(async (path, opts) => {
    const r = await runVaultInit({ path, ...(opts.title ? { title: opts.title } : {}) });
    if (r.message) console.error(r.message);
    if (r.vaultRoot) console.log(`vault initialized: ${r.vaultRoot}`);
    process.exit(r.exitCode);
  });

const project = program
  .command("project")
  .description("Register or import code repositories as projects inside a central vault.");

project
  .command("register")
  .description("Register a repo as a project inside a central vault")
  .requiredOption("--vault <path>", "Central vault root")
  .option("--project <id>", "Project id inside the vault")
  .option("--repo <path>", "Code repository path", process.cwd())
  .option("--title <title>", "Project title")
  .option("--alias <alias>", "Project alias for the UI")
  .action(async (opts) => {
    const repoRoot = opts.repo ? String(opts.repo) : process.cwd();
    const r = await runProjectRegister({
      vaultRoot: opts.vault,
      projectId: opts.project ?? defaultProjectIdFromRepo(repoRoot),
      repoRoot,
      ...(opts.title ? { title: opts.title } : {}),
      ...(opts.alias ? { alias: opts.alias } : {}),
    });
    if (r.message) console.error(r.message);
    if (r.projectRoot) console.log(`project registered: ${r.projectRoot}`);
    process.exit(r.exitCode);
  });

project
  .command("import-repo-vault")
  .description("Import a legacy repo-local .cairndex/ into a central vault project")
  .requiredOption("--vault <path>", "Central vault root")
  .option("--project <id>", "Project id inside the vault")
  .option("--repo <path>", "Code repository path", process.cwd())
  .option("--title <title>", "Project title")
  .option("--alias <alias>", "Project alias for the UI")
  .option("--overwrite", "Overwrite existing central project files", false)
  .action(async (opts) => {
    const repoRoot = opts.repo ? String(opts.repo) : process.cwd();
    const r = await runProjectImportRepoVault({
      vaultRoot: opts.vault,
      projectId: opts.project ?? defaultProjectIdFromRepo(repoRoot),
      repoRoot,
      overwrite: opts.overwrite === true,
      ...(opts.title ? { title: opts.title } : {}),
      ...(opts.alias ? { alias: opts.alias } : {}),
    });
    if (r.message) console.error(r.message);
    if (r.projectRoot) console.log(`project imported: ${r.projectRoot}`);
    process.exit(r.exitCode);
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

async function readStdinTextOrFail(missingFlag: string): Promise<string> {
  // Refuse to hang on a TTY waiting for input the user didn't intend to provide.
  if (process.stdin.isTTY) {
    console.error(`error: no input on stdin. Either pipe content or pass ${missingFlag}.`);
    process.exit(1);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

program
  .command("doctor")
  .description("Validate vault, show status, optionally auto-fix")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Central vault root")
  .option("--project <id>", "Project id inside a central vault")
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
      ...(opts.vault ? { vaultRoot: opts.vault } : {}),
      ...(opts.project ? { projectId: opts.project } : {}),
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
  .description("Sync shared rules and templates into a project")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Central vault root")
  .option("--project <id>", "Project id inside a central vault")
  .option("--silent", "No output, exit code only", false)
  .action(async (opts) => {
    const r = await runSyncCmd({
      cwd: opts.cwd,
      ...(opts.vault ? { vaultRoot: opts.vault } : {}),
      ...(opts.project ? { projectId: opts.project } : {}),
      silent: opts.silent,
    });
    process.exit(r.exitCode);
  });
program
  .command("ui")
  .description("Launch local web GUI + watcher")
  .option("--vault <path>", "Central vault root")
  .option("--port <n>", "Port to bind", (v) => Number.parseInt(v, 10), 7777)
  .option("--no-open", "Do not auto-open the browser")
  .action(async (opts) => {
    await runUi({
      port: opts.port,
      openBrowser: opts.open !== false,
      ...(opts.vault ? { vaultRoot: opts.vault } : {}),
    });
    // runUi never returns under normal operation (server keeps running)
  });

program
  .command("context")
  .description("Build a token-budgeted context pack for the current vault state")
  .argument("[task]", "Task label — used for logging/caching only, does not affect selection")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd for vault discovery)")
  .option("--project <id>", "Project id inside a central vault")
  .option("--budget <n>", "Token budget cap", (v) => Number.parseInt(v, 10))
  .option("--out <path>", "Override output path (absolute or vault-relative)")
  .option("--no-stdout", "Do not print pack body to stdout (file only)")
  .option(
    "--if-stale",
    "Only rebuild when the latest pack is older than the newest memory file. Used by the Stop / SessionStart hooks so each session boots with a fresh pack without paying the rebuild cost when nothing changed.",
    false,
  )
  .option("--silent", "Suppress non-error output (still writes the pack file)", false)
  .action(async (task: string | undefined, opts) => {
    const callOpts: Parameters<typeof runContext>[0] = {
      cwd: opts.cwd,
      emitStdout: opts.stdout !== false && !opts.silent,
    };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    if (task !== undefined) callOpts.task = task;
    if (typeof opts.budget === "number" && !Number.isNaN(opts.budget))
      callOpts.budget = opts.budget;
    if (opts.out) callOpts.out = opts.out;
    if (opts.ifStale) callOpts.ifStale = true;
    const r = await runContext(callOpts);
    if (r.message && !opts.silent) console.error(r.message);
    process.exit(r.exitCode);
  });

const emit = program
  .command("emit")
  .description("Regenerate derived agent surfaces from the vault");

emit
  .command("claude-md")
  .description("Regenerate the cairndex region inside CLAUDE.md from the current vault state")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .option("--repo <path>", "Repo path whose CLAUDE.md should be updated")
  .option("--out <path>", "Override CLAUDE.md path (absolute or vault-relative)")
  .action(async (opts) => {
    const callOpts: Parameters<typeof runEmitClaudeMd>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    if (opts.repo) callOpts.repoRoot = opts.repo;
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
  .option("--project <id>", "Project id inside a central vault")
  .option("--lookback <days>", "Lookback window in days (default 30)", (v) =>
    Number.parseInt(v, 10),
  )
  .option("--min-mentions <n>", "Minimum sessions before drafting (default 3)", (v) =>
    Number.parseInt(v, 10),
  )
  .action(async (opts) => {
    const callOpts: Parameters<typeof runConsolidate>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
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
  .option("--project <id>", "Project id inside a central vault")
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
    if (opts.project) callOpts.projectId = opts.project;
    if (typeof opts.age === "number" && !Number.isNaN(opts.age)) {
      callOpts.ageDays = opts.age;
    }
    if (typeof opts.confidenceThreshold === "number" && !Number.isNaN(opts.confidenceThreshold)) {
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
  .option("--project <id>", "Project id inside a central vault")
  .option("--silent", "Suppress per-candidate output (still prints summary unless 0/0)", false)
  .option("--lookback <days>", "Consolidate lookback window (default 30)", (v) =>
    Number.parseInt(v, 10),
  )
  .option("--min-mentions <n>", "Consolidate min mentions (default 3)", (v) =>
    Number.parseInt(v, 10),
  )
  .option("--age <days>", "Archive min age (default 180)", (v) => Number.parseInt(v, 10))
  .option("--confidence-threshold <n>", "Archive confidence threshold (default 0.5)", (v) =>
    Number.parseFloat(v),
  )
  .action(async (opts) => {
    const callOpts: Parameters<typeof runSweep>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    if (typeof opts.lookback === "number" && !Number.isNaN(opts.lookback)) {
      callOpts.lookbackDays = opts.lookback;
    }
    if (typeof opts.minMentions === "number" && !Number.isNaN(opts.minMentions)) {
      callOpts.minMentions = opts.minMentions;
    }
    if (typeof opts.age === "number" && !Number.isNaN(opts.age)) {
      callOpts.ageDays = opts.age;
    }
    if (typeof opts.confidenceThreshold === "number" && !Number.isNaN(opts.confidenceThreshold)) {
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
            console.log(`    ${c.nodeType}/${c.nodeId}  age=${Math.round(c.ageDays)}d — ${status}`);
          }
        }
      }
    }
    process.exit(r.exitCode);
  });

program
  .command("last-turn-summary")
  .description(
    "Write <vault>/state/last-turn-summary.json with this turn's tool counts + new proposals. Used by the Stop Claude Code hook.",
  )
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .action(async (opts) => {
    const callOpts: Parameters<typeof runLastTurnSummary>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    // Stop hook payload arrives on stdin as JSON with transcript_path; reuse the same
    // helper that doctor --auto-session uses so the parsing is identical.
    const payload = await readStdinJson();
    if (payload && typeof payload.transcript_path === "string") {
      callOpts.transcriptPath = payload.transcript_path;
    }
    const r = await runLastTurnSummary(callOpts);
    if (r.message) console.error(r.message);
    process.exit(r.exitCode);
  });

program
  .command("bootstrap")
  .description(
    "Emit a session-start context block (phase / active task / pending proposals). Used by the SessionStart Claude Code hook.",
  )
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .option(
    "--proposal-limit <n>",
    "Cap on pending proposals to surface (default 5)",
    (v) => Number.parseInt(v, 10),
  )
  .action(async (opts) => {
    const callOpts: Parameters<typeof runBootstrap>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    if (typeof opts.proposalLimit === "number" && !Number.isNaN(opts.proposalLimit)) {
      callOpts.proposalLimit = opts.proposalLimit;
    }
    const r = await runBootstrap(callOpts);
    if (r.message) console.error(r.message);
    if (r.body) console.log(r.body);
    process.exit(r.exitCode);
  });

program
  .command("status")
  .description(
    "One-screen summary: phase / active task / inbox count / health / last vault change",
  )
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .option("--json", "Emit machine-readable JSON instead of a human report", false)
  .action(async (opts) => {
    const callOpts: Parameters<typeof runStatus>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    if (opts.json) callOpts.json = true;
    const r = await runStatus(callOpts);
    if (r.message) console.error(r.message);
    if (r.body) console.log(r.body);
    process.exit(r.exitCode);
  });

program
  .command("mcp")
  .description("Start an MCP (Model Context Protocol) server over stdio for the current vault")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .action(async (opts) => {
    const callOpts: Parameters<typeof runMcp>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
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
  .option("--project <id>", "Project id inside a central vault")
  .action(async (opts) => {
    const callOpts: Parameters<typeof runInboxList>[0] = { cwd: opts.cwd };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    const r = await runInboxList(callOpts);
    if (r.message) console.error(r.message);
    if (r.list) {
      const fmt = (label: string, items: typeof r.list.pending) => {
        if (items.length === 0) return;
        console.log(`\n${label} (${items.length}):`);
        for (const p of items) {
          const t = p.target ?? "(new)";
          console.log(`  ${p.proposalId}  ${p.proposalType}  ${p.targetType}/${t}  — ${p.summary}`);
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
  .option("--project <id>", "Project id inside a central vault")
  .action(async (proposalId, opts) => {
    const callOpts: Parameters<typeof runInboxAccept>[0] = { cwd: opts.cwd, proposalId };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    const r = await runInboxAccept(callOpts);
    if (r.message) console.error(r.message);
    if (r.applied) {
      console.log(`applied ${r.applied.action} -> ${r.applied.targetId} (${r.applied.targetPath})`);
    }
    process.exit(r.exitCode);
  });

inbox
  .command("reject <proposalId>")
  .description("Reject a pending proposal")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .option("--reason <text>", "Why this proposal was rejected", "no reason given")
  .action(async (proposalId, opts) => {
    const callOpts: Parameters<typeof runInboxReject>[0] = {
      cwd: opts.cwd,
      proposalId,
      reason: opts.reason,
    };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
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
  .requiredOption("--target-type <nodeType>", "Durable folder: spec/decision/plan/task/...")
  .option("--target <id>", "Existing node id (required for --type update)")
  .requiredOption("--summary <text>", "One-line description shown in inbox")
  .option("--reason <text>", "Why this change is proposed", "(no reason)")
  .option("--body-file <path>", "Read newBody from a file (otherwise reads stdin)")
  .option("--by <agent>", "createdBy provenance", "user")
  .option("--session <id>", "session id provenance", "manual")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .action(async (opts) => {
    let body: string;
    if (opts.bodyFile) {
      const fs = await import("node:fs/promises");
      body = await fs.readFile(opts.bodyFile, "utf8");
    } else {
      body = await readStdinTextOrFail("--body-file");
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
    if (opts.project) callOpts.projectId = opts.project;
    if (opts.target) callOpts.target = opts.target;
    const r = await runInboxPropose(callOpts);
    if (r.message) console.error(r.message);
    if (r.proposalId) {
      console.log(`proposed ${r.proposalId} -> ${r.path}`);
      if (r.duplicateOf)
        console.log(`note: identical content already proposed as ${r.duplicateOf}`);
    }
    process.exit(r.exitCode);
  });

inbox
  .command("propose-update <targetId>")
  .description(
    "One-shot section-level edit. Auto-infers targetType from the id prefix (e.g. SPEC-001 -> spec).",
  )
  .requiredOption(
    "--section <heading>",
    "Section heading (e.g. '## History' or 'History' — missing hashes default to level 2)",
  )
  .option(
    "--mode <mode>",
    "How to apply newContent: replace | append",
    (v) => v as "replace" | "append",
    "replace",
  )
  .requiredOption("--summary <text>", "One-line description shown in inbox")
  .option("--reason <text>", "Why this change is proposed", "(no reason)")
  .option("--content-file <path>", "Read newContent from a file (otherwise reads stdin)")
  .option("--by <agent>", "createdBy provenance", "user")
  .option("--session <id>", "session id provenance", "manual")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .action(async (targetId, opts) => {
    let content: string;
    if (opts.contentFile) {
      const fs = await import("node:fs/promises");
      content = await fs.readFile(opts.contentFile, "utf8");
    } else {
      content = await readStdinTextOrFail("--content-file");
    }
    const callOpts: Parameters<typeof runInboxProposeUpdate>[0] = {
      cwd: opts.cwd,
      targetId,
      section: opts.section,
      newContent: content,
      mode: opts.mode,
      summary: opts.summary,
      reason: opts.reason,
      createdBy: opts.by,
      session: opts.session,
    };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    const r = await runInboxProposeUpdate(callOpts);
    if (r.message) console.error(r.message);
    if (r.proposalId) {
      console.log(
        `proposed ${r.proposalId} -> ${r.path} (${r.targetType}/${r.targetId} ${r.mode} '${r.section}')`,
      );
    }
    process.exit(r.exitCode);
  });

const insight = program.command("insight").description("Cross-project insight management");

insight
  .command("promote <id>")
  .description("Promote a project insight to the vault's shared/insights/ folder")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Central vault root")
  .option("--project <id>", "Project id inside a central vault")
  .action(async (id, opts) => {
    const callOpts: Parameters<typeof runInsightPromote>[0] = { cwd: opts.cwd, id };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    const r = await runInsightPromote(callOpts);
    if (r.message) console.error(r.message);
    process.exit(r.exitCode);
  });

insight
  .command("propose-from-session [sessionId]")
  .description(
    "Heuristically distill a draft insight from a session and submit it to the inbox. No LLM call. When sessionId is omitted, the latest session by mtime is used (default for Stop hook chains). Reads stdin for the Claude Code Stop-hook payload `{\"transcript_path\":\"...\"}`; when present, the heuristic also scans assistant-text content from the transcript for decision phrases.",
  )
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Central vault root")
  .option("--project <id>", "Project id inside a central vault")
  .option("--by <agent>", "createdBy provenance", "auto-distill")
  .option("--silent", "Suppress non-error output", false)
  .action(async (sessionId: string | undefined, opts) => {
    const callOpts: Parameters<typeof runInsightProposeFromSession>[0] = {
      cwd: opts.cwd,
    };
    if (sessionId) callOpts.sessionId = sessionId;
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    if (opts.by) callOpts.createdBy = opts.by;
    // Read the Stop-hook payload from stdin if available — same envelope shape as
    // doctor --auto-session and last-turn-summary.
    const payload = await readStdinJson();
    if (payload && typeof payload.transcript_path === "string") {
      callOpts.transcriptPath = payload.transcript_path;
    }
    const r = await runInsightProposeFromSession(callOpts);
    if (r.message && !opts.silent) console.error(r.message);
    if (r.proposalId && !opts.silent) {
      console.log(`proposed ${r.proposalId} -> ${r.path}`);
    }
    process.exit(r.exitCode);
  });

insight
  .command("pull <id>")
  .description("Pull a global insight into the current project")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Central vault root")
  .option("--project <id>", "Project id inside a central vault")
  .action(async (id, opts) => {
    const callOpts: Parameters<typeof runInsightPull>[0] = { cwd: opts.cwd, id };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    const r = await runInsightPull(callOpts);
    if (r.message) console.error(r.message);
    process.exit(r.exitCode);
  });

const session = program
  .command("session")
  .description(
    "Append timestamped progress / verification / decision notes to the active session.",
  );

session
  .command("log <kind>")
  .description(
    "Append a timestamped bullet to the active session. kind: progress | verify | decision. Reads stdin if --text is omitted.",
  )
  .option("--text <text>", "Inline text. If omitted, reads from stdin.")
  .option("--by <agent>", "agent name (only used when creating a new session file)")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .action(async (kind, opts) => {
    if (kind !== "progress" && kind !== "verify" && kind !== "decision") {
      console.error(`unknown kind: ${kind} (expected: progress | verify | decision)`);
      process.exit(1);
    }
    let text: string;
    if (opts.text) {
      text = String(opts.text);
    } else {
      text = await readStdinTextOrFail("--text");
    }
    const callOpts: Parameters<typeof runSessionLog>[0] = {
      cwd: opts.cwd,
      kind,
      text,
    };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    if (opts.by) callOpts.agentName = opts.by;
    const r = await runSessionLog(callOpts);
    if (r.message) console.error(r.message);
    if (r.sessionId) {
      const verb = r.created ? "created" : "appended to";
      console.log(`${verb} ${r.sessionId} (${r.section}) -> ${r.path}`);
    }
    process.exit(r.exitCode);
  });

// Workflow-state commands. Direct mutations (no inbox round-trip) — see
// `packages/core/src/workflow/taskState.ts` for why these aren't proposals.
const taskCmd = program
  .command("task")
  .description("Workflow-state commands: switch / complete the current task");

taskCmd
  .command("switch <id>")
  .description("Make <id> the current in-progress task; demotes any other in_progress to pending")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .action(async (id, opts) => {
    const callOpts: Parameters<typeof runTaskSwitch>[0] = { cwd: opts.cwd, taskId: id };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    const r = await runTaskSwitch(callOpts);
    if (r.message) (r.exitCode === 0 ? console.log : console.error)(r.message);
    process.exit(r.exitCode);
  });

taskCmd
  .command("complete [id]")
  .description("Mark a task as done. Defaults to the active context's current task.")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .action(async (id, opts) => {
    const callOpts: Parameters<typeof runTaskComplete>[0] = { cwd: opts.cwd };
    if (id) callOpts.taskId = id;
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    const r = await runTaskComplete(callOpts);
    if (r.message) (r.exitCode === 0 ? console.log : console.error)(r.message);
    process.exit(r.exitCode);
  });

const phaseCmd = program.command("phase").description("Workflow-state commands: advance the project phase");

phaseCmd
  .command("set <name>")
  .description("Set the project phase (e.g. discovering | planning | implementing | testing)")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--vault <path>", "Vault root (overrides --cwd)")
  .option("--project <id>", "Project id inside a central vault")
  .action(async (name, opts) => {
    const callOpts: Parameters<typeof runPhaseSet>[0] = { cwd: opts.cwd, phase: name };
    if (opts.vault) callOpts.vaultRoot = opts.vault;
    if (opts.project) callOpts.projectId = opts.project;
    const r = await runPhaseSet(callOpts);
    if (r.message) (r.exitCode === 0 ? console.log : console.error)(r.message);
    process.exit(r.exitCode);
  });

export { program };

if (process.env.CAIRNDEX_SKIP_PARSE !== "1") {
  void program.parseAsync(process.argv);
}
