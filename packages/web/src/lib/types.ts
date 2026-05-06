import { z } from "zod";

export const ProjectSchema = z.object({
  path: z.string(),
  alias: z.string(),
  registered_at: z.string(),
  last_opened: z.string().optional(),
  // Populated by the server when the repo has a .cairndex-project.yaml pointer.
  // Lets the GUI show the user where durable memory actually lives without
  // making them dig through Settings → Rules.
  vaultRoot: z.string().optional(),
  projectId: z.string().optional(),
  projectRoot: z.string().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const VaultOverviewSchema = z.object({
  counts: z.record(z.number()),
  phase: z.string().nullable(),
  nextAction: z.string().nullable(),
});
export type VaultOverview = z.infer<typeof VaultOverviewSchema>;

export const LinkSchema = z.object({
  type: z.string(),
  target: z.string(),
  evidence: z.string().optional(),
});

export const BacklinkSchema = z.object({
  from: z.string(),
  fromType: z.string(),
  type: z.string(),
});

export const NodeListItemSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: z.string().nullable(),
  updated: z.string().nullable(),
  path: z.string(),
});
export type NodeListItem = z.infer<typeof NodeListItemSchema>;

export const NodeResponseSchema = z.object({
  frontmatter: z.record(z.unknown()),
  body: z.string(),
  links: z.array(z.unknown()),
  backlinks: z.array(BacklinkSchema),
  path: z.string(),
});
export type NodeResponse = z.infer<typeof NodeResponseSchema>;

export const ChangeEventSchema = z.object({ date: z.string(), summary: z.string() });
export const ChangesSchema = z.object({ events: z.array(ChangeEventSchema) });

export const IssueSchema = z.object({
  rule: z.string(),
  severity: z.enum(["error", "warn", "info"]),
  message: z.string(),
  nodeType: z.string().optional(),
  nodeId: z.string().optional(),
  path: z.string().optional(),
  fixable: z.boolean(),
});
export type Issue = z.infer<typeof IssueSchema>;

const NodeRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
});
const ActivePlanRefSchema = NodeRefSchema.extend({
  currentTaskId: z.string().nullable(),
});

export const ProjectStateSchema = z.object({
  phase: z.string(),
  phaseSince: z.string().nullable(),
  activeGoal: NodeRefSchema.nullable(),
  activeSpec: NodeRefSchema.nullable(),
  activePlan: ActivePlanRefSchema.nullable(),
  currentTask: NodeRefSchema.nullable(),
  nextAction: z.string().nullable(),
  warnings: z.array(z.string()),
  generatedAt: z.string(),
});
export type ProjectState = z.infer<typeof ProjectStateSchema>;

export const MemoryHealthIssueSchema = z.object({
  rule: z.string(),
  severity: z.enum(["error", "warn", "info"]),
  nodeId: z.string(),
  nodeType: z.string().optional(),
  message: z.string(),
});
export const MemoryHealthSchema = z.object({
  generatedAt: z.string(),
  counts: z.object({ red: z.number(), yellow: z.number(), green: z.number() }),
  issues: z.array(MemoryHealthIssueSchema),
});
export type MemoryHealth = z.infer<typeof MemoryHealthSchema>;

export const AgentContextSchema = z.object({
  latestPack: z
    .object({
      id: z.string(),
      path: z.string(),
      builtAt: z.string(),
      /**
       * Newest mtime under the vault's memory folders at the time of this
       * response. Null when the vault is empty. Optional for backward compat
       * with older API builds that don't carry the field yet.
       */
      lastMemoryChangeAt: z.string().nullable().optional(),
      /** True iff the pack was built before the most recent memory change. */
      stale: z.boolean().optional(),
    })
    .nullable(),
});

export const HandoffReadinessCheckSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "blocker"]),
  label: z.string(),
  detail: z.string(),
  action: z.string(),
});
export const HandoffReadinessSchema = z.object({
  level: z.enum(["ready", "attention", "blocked"]),
  title: z.string(),
  summary: z.string(),
  checks: z.array(HandoffReadinessCheckSchema),
  blockers: z.number(),
  warnings: z.number(),
  ready: z.boolean(),
});
export type HandoffReadiness = z.infer<typeof HandoffReadinessSchema>;

export const HandoffRepairActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["applied", "planned", "skipped", "manual"]),
  detail: z.string(),
  path: z.string().optional(),
});
export const HandoffRepairResultSchema = z.object({
  before: HandoffReadinessSchema,
  after: HandoffReadinessSchema,
  actions: z.array(HandoffRepairActionSchema),
  applied: z.number(),
  planned: z.number(),
  skipped: z.number(),
  manual: z.number(),
  createdTaskId: z.string().nullable(),
  packPath: z.string().nullable(),
});
export type HandoffRepairResult = z.infer<typeof HandoffRepairResultSchema>;

export const RecentActivityEventSchema = z.object({ date: z.string(), summary: z.string() });
export const DashboardSchema = z.object({
  projectState: ProjectStateSchema,
  agentContext: AgentContextSchema,
  memoryHealth: MemoryHealthSchema,
  handoffReadiness: HandoffReadinessSchema,
  recentActivity: z.array(RecentActivityEventSchema),
});
export type Dashboard = z.infer<typeof DashboardSchema>;

// Pre-flight intent: the agent's pre-work declaration of what it's about to do.
// Written by `cairndex intent set`, cleared by the Stop hook. Surfaced live in
// the IntentBar component, and retrospectively inside LastTurnCard.
// Defined before LastTurnSummarySchema because that schema references it.
export const IntentSchema = z.object({
  setAt: z.string(),
  taskId: z.string().nullable(),
  sessionId: z.string().nullable(),
  steps: z.array(z.string()),
});

const LastTurnSummarySchema = z.object({
  ts: z.string(),
  filesTouched: z.number(),
  toolCounts: z.object({
    Edit: z.number(),
    Write: z.number(),
    Bash: z.number(),
    Read: z.number(),
  }),
  newProposals: z.array(z.string()),
  latestSessionId: z.string().nullable(),
  /**
   * Changelog entries between the previous `Session ... recorded` line and the
   * most recent one — the narrative of "what just happened" (proposals accepted/
   * rejected, task switch/complete, phase change). Server-derived; optional for
   * backward compat with older snapshots that don't carry the field.
   */
  events: z
    .array(z.object({ date: z.string(), summary: z.string() }))
    .optional()
    .default([]),
  /**
   * The pre-flight intent that was active when this turn ended (captured before the
   * Stop hook chain's `intent clear` step). Lets the LastTurnCard render "agent said
   * it would do X" alongside the metric line. Optional / nullable for backward compat
   * with snapshots written before this field was added.
   */
  intent: IntentSchema.nullable().optional(),
});
export const LastTurnSummaryResponseSchema = z.object({
  summary: LastTurnSummarySchema.nullable(),
});
export type LastTurnSummary = z.infer<typeof LastTurnSummarySchema>;

export const IntentResponseSchema = z.object({
  intent: IntentSchema.nullable(),
});
export type Intent = z.infer<typeof IntentSchema>;

export const ClaudeCodeStatusSchema = z.object({
  wired: z.boolean(),
  settingsPath: z.string(),
  settingsExists: z.boolean(),
  hookEvents: z.array(z.string()),
  mcpRegistered: z.boolean(),
});
export type ClaudeCodeStatus = z.infer<typeof ClaudeCodeStatusSchema>;

export const CodexStatusSchema = z.object({
  wired: z.boolean(),
  hooksPath: z.string(),
  hooksExists: z.boolean(),
  hookEvents: z.array(z.string()),
  agentsMdPath: z.string(),
  agentsMdExists: z.boolean(),
  agentsBlockPresent: z.boolean(),
});
export type CodexStatus = z.infer<typeof CodexStatusSchema>;

export const UserPreferencesSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    theme: z.enum(["light", "dark", "system"]).default("system"),
    defaultFreshnessWarnDays: z.number().int().positive().nullable().default(null),
    autoAcceptConfidenceThreshold: z.number().min(0).max(1).nullable().default(null),
    personalRulesPath: z.string().nullable().default(null),
    // Mirrors the core schema — the server returns this even when the user
    // has never opened the GUI, and `.strict()` below rejects unknown keys,
    // so this MUST be declared on the web side or the query throws and the
    // banner / settings page silently see "no data."
    lastVaultRoot: z.string().nullable().default(null),
  })
  .strict();
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

const PackItemSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  reason: z.string(),
});
export const ComposePackResponseSchema = z.object({
  packId: z.string(),
  path: z.string(),
  body: z.string(),
  tokenEstimate: z.number(),
  tokenBudget: z.number(),
  trimmedItems: z.number(),
  itemCount: z.number(),
});
export type ComposePackResponse = z.infer<typeof ComposePackResponseSchema>;
export const PackResponseSchema = z.object({
  packId: z.string(),
  path: z.string(),
  raw: z.string(),
  body: z.string(),
  frontmatter: z
    .object({
      id: z.string().optional(),
      type: z.string().optional(),
      task: z.string().optional(),
      builtAt: z.string().optional(),
      tokenEstimate: z.number().optional(),
      tokenBudget: z.number().optional(),
      trimmedItems: z.number().optional(),
      items: z.array(PackItemSummarySchema).optional(),
      warnings: z.array(z.string()).optional(),
    })
    .passthrough(),
});
export type PackResponse = z.infer<typeof PackResponseSchema>;
export const PackListSchema = z.object({
  packs: z.array(
    z.object({
      packId: z.string(),
      task: z.string(),
      builtAt: z.string(),
      tokenEstimate: z.number(),
      path: z.string(),
    }),
  ),
});
export type PackList = z.infer<typeof PackListSchema>;

const ProposalProvenanceSchema = z.object({
  createdBy: z.string(),
  session: z.string(),
  confidence: z.number().optional(),
});
export const PatchOpSchema = z.object({
  kind: z.enum(["append-section", "replace-section"]),
  section: z.string(),
  content: z.string(),
});
export type PatchOp = z.infer<typeof PatchOpSchema>;
export const ProposalSchema = z.object({
  proposalId: z.string(),
  path: z.string(),
  proposalType: z.enum(["create", "update"]),
  targetType: z.string(),
  target: z.string().optional(),
  status: z.enum(["pending", "accepted", "rejected", "duplicate"]),
  summary: z.string(),
  reason: z.string(),
  contentHash: z.string(),
  createdAt: z.string(),
  duplicateOf: z.string().optional(),
  acceptedAt: z.string().optional(),
  /**
   * Who triggered the accept — "user" for manual review, "auto" when the
   * proposal's confidence cleared the user's `autoAcceptConfidenceThreshold`.
   * Optional for backward compat with proposals accepted before the marker
   * was introduced.
   */
  acceptedBy: z.enum(["user", "auto"]).optional(),
  acceptedTarget: z.string().optional(),
  rejectedAt: z.string().optional(),
  rejectionReason: z.string().optional(),
  provenance: ProposalProvenanceSchema,
  newBody: z.string(),
  newFrontmatter: z.record(z.unknown()).optional(),
  patch: z.array(PatchOpSchema).optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const ImplementationLineEntrySchema = z.object({
  taskId: z.string(),
  title: z.string(),
  status: z.string(),
  created: z.string(),
  updated: z.string(),
  completed: z.string().nullable(),
  sessionId: z.string().nullable(),
  planId: z.string().nullable(),
});
export type ImplementationLineEntry = z.infer<typeof ImplementationLineEntrySchema>;

export const ImplementationLineSchema = z.object({
  generatedAt: z.string(),
  entries: z.array(ImplementationLineEntrySchema),
  // Plan-id keys to ordered task-id lists. The server uses the literal "(unlinked)"
  // bucket key for tasks with no PLAN-* link in their frontmatter; the page renders
  // it as a separate group at the bottom.
  byPlan: z.record(z.array(z.string())),
});
export type ImplementationLine = z.infer<typeof ImplementationLineSchema>;

export const InboxListSchema = z.object({
  pending: z.array(ProposalSchema),
  accepted: z.array(ProposalSchema),
  rejected: z.array(ProposalSchema),
  duplicate: z.array(ProposalSchema),
});
export type InboxList = z.infer<typeof InboxListSchema>;

// ---------------------------------------------------------------------------
// Resume view — mirrors packages/core/src/resume/types.ts; web stays decoupled
// from core internals so these are re-declared as part of the API contract.
// ---------------------------------------------------------------------------

export const LastSessionInfoSchema = z.object({
  id: z.string(),
  date: z.string(),
  narrativeStatus: z.enum(["empty", "auto", "confirmed"]),
  summary: z.string(),
});
export type LastSessionInfo = z.infer<typeof LastSessionInfoSchema>;

export const ActiveTaskInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  nextAction: z.string().nullable(),
  ageDays: z.number(),
});
export type ActiveTaskInfo = z.infer<typeof ActiveTaskInfoSchema>;

export const WhyContextInfoSchema = z.object({
  kind: z.enum(["decision", "insight"]),
  id: z.string(),
  title: z.string(),
});
export type WhyContextInfo = z.infer<typeof WhyContextInfoSchema>;

export const PendingMemoryInfoSchema = z.object({
  count: z.number(),
  titles: z.array(z.string()),
});
export type PendingMemoryInfo = z.infer<typeof PendingMemoryInfoSchema>;

export const ResumeViewSchema = z.object({
  lastSession: LastSessionInfoSchema.nullable(),
  activeTask: ActiveTaskInfoSchema.nullable(),
  whyContext: WhyContextInfoSchema.nullable(),
  suggestedNext: z.string().nullable(),
  pendingMemory: PendingMemoryInfoSchema,
  coverageFlags: z.array(z.string()),
  builtAt: z.string(),
  sources: z.array(z.string()),
});
export type ResumeView = z.infer<typeof ResumeViewSchema>;

export const ResumeResponseSchema = z.object({
  generated: z.literal(true),
  sources: z.array(z.string()),
  builtAt: z.string(),
  view: ResumeViewSchema,
});
export type ResumeResponse = z.infer<typeof ResumeResponseSchema>;

// ---------------------------------------------------------------------------
// Close-out — mirrors packages/core/src/closeout/submit.ts CloseOutAnswers.
// Web stays decoupled from core internals; these are re-declared as part of
// the API contract.
// ---------------------------------------------------------------------------

export const CloseOutAnswersSchema = z.object({
  didFinish: z.string(),
  decisionOrLearning: z.string(),
  nextStep: z.string(),
});
export type CloseOutAnswers = z.infer<typeof CloseOutAnswersSchema>;

export const CloseOutDraftResponseSchema = z.object({
  sessionId: z.string(),
  draft: CloseOutAnswersSchema,
});
export type CloseOutDraftResponse = z.infer<typeof CloseOutDraftResponseSchema>;

export const SubmitCloseOutResultSchema = z.object({
  sessionPath: z.string(),
  taskPath: z.string().nullable(),
  proposalId: z.string().nullable(),
});
export type SubmitCloseOutResult = z.infer<typeof SubmitCloseOutResultSchema>;
