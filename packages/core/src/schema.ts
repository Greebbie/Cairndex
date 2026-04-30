import { z } from "zod";
import { LINK_TYPES } from "./types.js";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const LinkSchema = z.object({
  type: z.enum(LINK_TYPES),
  target: z.string().min(1),
  evidence: z.string().optional(),
});

export const ProvenanceSchema = z.object({
  created_by: z.string().min(1),
  session: z.string().min(1),
  evidence: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  last_verified: IsoDate.optional(),
});

export const VerificationSchema = z
  .object({
    test: z.string().optional(),
    commit: z.string().optional(),
    run: z.string().optional(),
  })
  .refine((v) => v.test || v.commit || v.run, {
    message: "verification must have at least one of: test, commit, run",
  });

const BaseFrontmatter = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  tags: z.array(z.string()).optional(),
  created: IsoDate,
  updated: IsoDate.optional(),
  provenance: ProvenanceSchema.optional(),
  links: z.array(LinkSchema).optional(),
  verification: VerificationSchema.optional(),
});

// --- per-type schemas ---

const SpecStatus = z.enum(["active", "superseded", "removed", "done"]);
export const SpecFrontmatterSchema = BaseFrontmatter.extend({
  status: SpecStatus,
  updated: IsoDate, // required for specs
  phase: z
    .enum(["discovering", "specifying", "planning", "implementing", "reviewing", "shipping"])
    .optional(),
});

const DecisionStatus = z.enum(["proposed", "accepted", "superseded"]);
export const DecisionFrontmatterSchema = BaseFrontmatter.extend({
  status: DecisionStatus,
  updated: IsoDate.optional(),
});

const PlanStatus = z.enum(["draft", "active", "superseded", "done"]);
export const PlanFrontmatterSchema = BaseFrontmatter.extend({
  status: PlanStatus,
  updated: IsoDate,
});

const TaskStatus = z.enum(["pending", "in_progress", "done", "blocked", "abandoned"]);
export const TaskFrontmatterSchema = BaseFrontmatter.extend({
  status: TaskStatus,
  updated: IsoDate,
});

const GoalStatus = z.enum(["active", "achieved", "abandoned"]);
export const GoalFrontmatterSchema = BaseFrontmatter.extend({
  status: GoalStatus,
  updated: IsoDate,
});

export const IntentFrontmatterSchema = BaseFrontmatter.extend({
  status: z.enum(["captured"]).default("captured"),
  source: z.string().optional(),
});

const SessionId = z.string().regex(/^\d{4}-\d{2}-\d{2}-\d{4}$/, "expected yyyy-MM-dd-HHmm");
export const SessionFrontmatterSchema = z.object({
  id: SessionId,
  date: IsoDate,
  summary: z.string(),
  provenance: ProvenanceSchema.optional(),
  links: z.array(LinkSchema).optional(),
  tags: z.array(z.string()).optional(),
});

const InsightStatus = z.enum(["draft", "stable"]);
export const InsightFrontmatterSchema = BaseFrontmatter.extend({
  status: InsightStatus,
  promoted_to_global: z.boolean().optional(),
});

const QuestionStatus = z.enum(["open", "answered", "abandoned"]);
export const QuestionFrontmatterSchema = BaseFrontmatter.extend({
  status: QuestionStatus,
  answered_by: z.string().optional(), // ID reference
});

export const ChangeFrontmatterSchema = z.object({
  id: z.string(),
  date: IsoDate,
  type: z.enum(["created", "updated", "superseded", "archived", "removed", "promoted"]),
  target: z.string(),
  summary: z.string(),
  provenance: ProvenanceSchema.optional(),
});

// --- registry ---

export const FrontmatterSchemaByNodeType = {
  spec: SpecFrontmatterSchema,
  decision: DecisionFrontmatterSchema,
  plan: PlanFrontmatterSchema,
  task: TaskFrontmatterSchema,
  goal: GoalFrontmatterSchema,
  intent: IntentFrontmatterSchema,
  session: SessionFrontmatterSchema,
  insight: InsightFrontmatterSchema,
  question: QuestionFrontmatterSchema,
  change: ChangeFrontmatterSchema,
} as const;

export type SpecFrontmatter = z.infer<typeof SpecFrontmatterSchema>;
export type DecisionFrontmatter = z.infer<typeof DecisionFrontmatterSchema>;
export type SessionFrontmatter = z.infer<typeof SessionFrontmatterSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
