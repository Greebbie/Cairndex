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
