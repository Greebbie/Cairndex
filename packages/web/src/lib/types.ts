import { z } from "zod";

export const ProjectSchema = z.object({
  path: z.string(),
  alias: z.string(),
  registered_at: z.string(),
  last_opened: z.string().optional(),
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
    })
    .nullable(),
});

export const RecentActivityEventSchema = z.object({ date: z.string(), summary: z.string() });
export const DashboardSchema = z.object({
  projectState: ProjectStateSchema,
  agentContext: AgentContextSchema,
  memoryHealth: MemoryHealthSchema,
  recentActivity: z.array(RecentActivityEventSchema),
});
export type Dashboard = z.infer<typeof DashboardSchema>;

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
  rejectedAt: z.string().optional(),
  rejectionReason: z.string().optional(),
  provenance: ProposalProvenanceSchema,
  newBody: z.string(),
  newFrontmatter: z.record(z.unknown()).optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const InboxListSchema = z.object({
  pending: z.array(ProposalSchema),
  accepted: z.array(ProposalSchema),
  rejected: z.array(ProposalSchema),
  duplicate: z.array(ProposalSchema),
});
export type InboxList = z.infer<typeof InboxListSchema>;
