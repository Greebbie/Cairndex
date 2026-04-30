export const NODE_TYPES = [
  "goal",
  "intent",
  "spec",
  "decision",
  "plan",
  "task",
  "session",
  "change",
  "insight",
  "question",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const LINK_TYPES = [
  "implements",
  "implements_goal",
  "supersedes",
  "superseded_by",
  "validates",
  "blocks",
  "blocked_by",
  "touches",
  "planned_in",
  "sources",
] as const;

export type LinkType = (typeof LINK_TYPES)[number];
