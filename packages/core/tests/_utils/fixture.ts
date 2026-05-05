/**
 * Shared fixture helper for core tests. Creates a temporary vault directory
 * pre-populated with canonical files so reader tests can exercise real filesystem
 * reads without any mocking.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SessionSeed {
  id: string;
  date?: string;
  summary?: string;
  narrative_status?: "empty" | "auto" | "confirmed";
}

export interface TaskSeed {
  id: string;
  title?: string;
  status?: string;
  next_action?: string;
  updated?: string;
  created?: string;
}

export interface InboxProposalSeed {
  id: string;
  status?: "pending" | "accepted" | "rejected" | "duplicate";
  /** `summary` is what PROP files use for the title shown to the user. */
  title?: string;
  /** Alias for `title` — `summary` is the frontmatter field name in PROP files. */
  summary?: string;
}

export interface SignalSeed {
  id: string;
  source?: string;
}

export interface DecisionSeed {
  id: string;
  title?: string;
  status?: string;
  /** Typed links array, e.g. [{ type: "addresses", target: "TASK-003" }] */
  links?: Array<{ type: string; target: string }>;
}

export interface InsightSeed {
  id: string;
  title?: string;
  status?: string;
  links?: Array<{ type: string; target: string }>;
}

export interface FixtureSeed {
  sessions?: SessionSeed[];
  tasks?: TaskSeed[];
  /** Writes a state/current-task marker pointing at this task id */
  currentTask?: string;
  inboxProposals?: InboxProposalSeed[];
  signals?: SignalSeed[];
  decisions?: DecisionSeed[];
  insights?: InsightSeed[];
  /** Raw intent steps to write into state/current-intent.md */
  intentSteps?: string[];
}

/**
 * Create a temporary vault directory seeded with the provided canonical files.
 * Returns the repoRoot (i.e. the directory containing `.cairndex/`).
 *
 * The caller is responsible for cleanup (rmSync tmp, { recursive: true, force: true }).
 */
export function seedFixture(seed: FixtureSeed): string {
  const root = mkdtempSync(join(tmpdir(), "cairn-fix-"));
  const vault = join(root, ".cairndex");

  // Always create core directories
  mkdirSync(join(vault, "sessions"), { recursive: true });
  mkdirSync(join(vault, "tasks"), { recursive: true });
  mkdirSync(join(vault, "inbox", "proposed-memory-updates"), { recursive: true });
  mkdirSync(join(vault, "signals"), { recursive: true });
  mkdirSync(join(vault, "decisions"), { recursive: true });
  mkdirSync(join(vault, "insights"), { recursive: true });
  mkdirSync(join(vault, "state"), { recursive: true });

  // Sessions
  for (const s of seed.sessions ?? []) {
    const date = s.date ?? s.id.slice(0, 10);
    const narrativeStatus = s.narrative_status ?? "empty";
    const summary = s.summary ?? "";
    writeFileSync(
      join(vault, "sessions", `${s.id}.md`),
      `---\nid: ${s.id}\ndate: ${date}\nsummary: '${summary.replace(/'/g, "\\'")}'\nnarrative_status: ${narrativeStatus}\n---\n`,
    );
  }

  // Tasks
  for (const t of seed.tasks ?? []) {
    const status = t.status ?? "pending";
    const title = t.title ?? t.id;
    const created = t.created ?? "2026-05-01";
    const updated = t.updated ?? created;
    let fm = `---\nid: ${t.id}\ntitle: '${title}'\nstatus: ${status}\ncreated: ${created}\nupdated: ${updated}\n`;
    if (t.next_action !== undefined) {
      fm += `next_action: '${t.next_action}'\n`;
    }
    fm += `---\n`;
    writeFileSync(join(vault, "tasks", `${t.id}.md`), fm);
  }

  // Index.md pointing to the current task via next_action on the index
  // (activeContext picks current task by status, so no index marker needed —
  // the `currentTask` seed field just ensures the task's status is in_progress)
  if (seed.currentTask !== undefined) {
    const taskFile = join(vault, "tasks", `${seed.currentTask}.md`);
    // Upgrade the task to in_progress if it exists and isn't already
    try {
      const raw = readFileSync(taskFile, "utf8");
      if (!raw.includes("status: in_progress")) {
        const patched = raw.replace(/^status: .+$/m, "status: in_progress");
        writeFileSync(taskFile, patched);
      }
    } catch {
      // Task file doesn't exist yet — create a minimal one
      writeFileSync(
        taskFile,
        `---\nid: ${seed.currentTask}\ntitle: '${seed.currentTask}'\nstatus: in_progress\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n`,
      );
    }
  }

  // Inbox proposals
  for (const p of seed.inboxProposals ?? []) {
    const status = p.status ?? "pending";
    // `summary` takes precedence over `title`; both map to the frontmatter `summary` field
    const summaryText = p.summary ?? p.title ?? p.id;
    writeFileSync(
      join(vault, "inbox", "proposed-memory-updates", `${p.id}.md`),
      `---\nid: ${p.id}\nproposalType: update\ntargetType: spec\ntarget: SPEC-001\nstatus: ${status}\nsummary: '${summaryText}'\nreason: test\ncontentHash: abc\ncreated: 2026-05-01\nprovenance:\n  created_by: test\n  session: 2026-05-01-1000\n---\n`,
    );
  }

  // Signals (never read by readers — added to confirm signals are excluded)
  for (const sig of seed.signals ?? []) {
    const source = sig.source ?? "auto-distill";
    writeFileSync(
      join(vault, "signals", `${sig.id}.md`),
      `---\nid: ${sig.id}\nsource: ${source}\ncreated: 2026-05-01\n---\n`,
    );
  }

  // Decisions (ADRs)
  for (const d of seed.decisions ?? []) {
    const status = d.status ?? "accepted";
    const title = d.title ?? d.id;
    let fm = `---\nid: ${d.id}\ntitle: '${title}'\nstatus: ${status}\ncreated: 2026-05-01\n`;
    if (d.links && d.links.length > 0) {
      fm += "links:\n";
      for (const l of d.links) {
        fm += `  - type: ${l.type}\n    target: ${l.target}\n`;
      }
    }
    fm += `---\n`;
    writeFileSync(join(vault, "decisions", `${d.id}.md`), fm);
  }

  // Insights
  for (const i of seed.insights ?? []) {
    const status = i.status ?? "stable";
    const title = i.title ?? i.id;
    let fm = `---\nid: ${i.id}\ntitle: '${title}'\nstatus: ${status}\ncreated: 2026-05-01\nupdated: 2026-05-01\n`;
    if (i.links && i.links.length > 0) {
      fm += "links:\n";
      for (const l of i.links) {
        fm += `  - type: ${l.type}\n    target: ${l.target}\n`;
      }
    }
    fm += `---\n`;
    writeFileSync(join(vault, "insights", `${i.id}.md`), fm);
  }

  // Intent steps
  if (seed.intentSteps && seed.intentSteps.length > 0) {
    const body = seed.intentSteps.map((s) => `- ${s}`).join("\n");
    writeFileSync(
      join(vault, "state", "current-intent.md"),
      `---\nset_at: '2026-05-05T12:00:00.000Z'\n---\n${body}\n`,
    );
  }

  return root;
}
