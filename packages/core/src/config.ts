import { existsSync, readFileSync } from "node:fs";
import yaml from "js-yaml";
import { z } from "zod";
import { configPath } from "./paths.js";
import { NODE_TYPES, type NodeType } from "./types.js";

const FoldersSchema = z.object({
  goals: z.string().default("goals"),
  intents: z.string().default("intents"),
  specs: z.string().default("specs"),
  decisions: z.string().default("decisions"),
  plans: z.string().default("plans"),
  tasks: z.string().default("tasks"),
  sessions: z.string().default("sessions"),
  changes: z.string().default("changes"),
  insights: z.string().default("insights"),
  questions: z.string().default("questions"),
  context: z.string().default("context"),
});

const IdsSchema = z.object({
  goal: z.string().default("GOAL"),
  intent: z.string().default("INT"),
  spec: z.string().default("SPEC"),
  decision: z.string().default("ADR"),
  plan: z.string().default("PLAN"),
  task: z.string().default("TASK"),
  session: z.string().default("yyyy-MM-dd-HHmm"),
  insight: z.string().default("INS"),
  question: z.string().default("QUESTION"),
  change: z.string().default("CHG"),
});

const RequiredFrontmatterSchema = z.object({
  spec: z.array(z.string()).default(["id", "title", "status", "created", "updated"]),
  decision: z.array(z.string()).default(["id", "title", "status", "created"]),
  plan: z.array(z.string()).default(["id", "title", "status", "created", "updated"]),
  task: z.array(z.string()).default(["id", "title", "status", "created", "updated"]),
  goal: z.array(z.string()).default(["id", "title", "status", "created"]),
  intent: z.array(z.string()).default(["id", "title", "created"]),
  session: z.array(z.string()).default(["id", "date", "summary"]),
  insight: z.array(z.string()).default(["id", "title", "status", "created"]),
  question: z.array(z.string()).default(["id", "title", "status", "created"]),
  change: z.array(z.string()).default(["id", "date", "type", "target", "summary"]),
});

export const ConfigSchema = z.object({
  schemaVersion: z.literal(1),
  folders: FoldersSchema.default({} as never),
  ids: IdsSchema.default({} as never),
  required_frontmatter: RequiredFrontmatterSchema.default({} as never),
  verification_required_for_status: z.array(z.string()).default(["done", "accepted"]),
  freshness_warn_days: z.number().int().min(0).default(30),
});

export type Config = z.infer<typeof ConfigSchema>;

export function defaultConfig(): Config {
  return ConfigSchema.parse({ schemaVersion: 1 });
}

export function loadProjectConfig(repoRoot: string): Config {
  const p = configPath(repoRoot);
  if (!existsSync(p)) return defaultConfig();
  const raw = readFileSync(p, "utf8");
  const data = yaml.load(raw);
  return ConfigSchema.parse(data);
}

export interface ConfigOverride {
  schemaVersion?: 1;
  folders?: Partial<Config["folders"]>;
  ids?: Partial<Config["ids"]>;
  required_frontmatter?: Partial<Config["required_frontmatter"]>;
  verification_required_for_status?: Config["verification_required_for_status"];
  freshness_warn_days?: Config["freshness_warn_days"];
}

export function mergeConfig(base: Config, override: ConfigOverride): Config {
  return ConfigSchema.parse({
    schemaVersion: 1,
    folders: { ...base.folders, ...(override.folders ?? {}) },
    ids: { ...base.ids, ...(override.ids ?? {}) },
    required_frontmatter: {
      ...base.required_frontmatter,
      ...(override.required_frontmatter ?? {}),
    },
    verification_required_for_status:
      override.verification_required_for_status ?? base.verification_required_for_status,
    freshness_warn_days: override.freshness_warn_days ?? base.freshness_warn_days,
  });
}

export function folderForNodeType(cfg: Config, type: NodeType): string {
  const map: Record<NodeType, keyof typeof cfg.folders> = {
    goal: "goals",
    intent: "intents",
    spec: "specs",
    decision: "decisions",
    plan: "plans",
    task: "tasks",
    session: "sessions",
    change: "changes",
    insight: "insights",
    question: "questions",
  };
  return cfg.folders[map[type]];
}

export function nodeTypeForFolder(cfg: Config, folderName: string): NodeType | null {
  for (const t of NODE_TYPES) {
    if (folderForNodeType(cfg, t) === folderName) return t;
  }
  return null;
}
