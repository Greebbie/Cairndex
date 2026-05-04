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

/**
 * User-defined node types. Built-in types (spec, decision, …) get specialised
 * Dashboard / active-context behaviour; custom types added here become first-class
 * for Browse, doctor (no "unknown folder" warning), context pack inclusion via
 * generic helpers, and per-vault rules — but they don't get the active-context
 * hooks.
 */
const CustomTypeDefSchema = z.object({
  folder: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "folder must be a kebab-case directory name"),
  id_prefix: z
    .string()
    .min(1)
    .regex(/^[A-Z][A-Z0-9_]*$/, "id_prefix must be UPPER_SNAKE"),
  // undefined → treated as false by isImmutableType. Optional so existing custom
  // type defs in user configs don't have to be touched.
  immutable: z.boolean().optional(),
});

export type CustomTypeDef = z.infer<typeof CustomTypeDefSchema>;

export const ConfigSchema = z.object({
  schemaVersion: z.literal(1),
  folders: FoldersSchema.default({} as never),
  ids: IdsSchema.default({} as never),
  required_frontmatter: RequiredFrontmatterSchema.default({} as never),
  verification_required_for_status: z.array(z.string()).default(["done", "accepted"]),
  freshness_warn_days: z.number().int().min(0).default(30),
  node_types: z.record(z.string(), CustomTypeDefSchema).default({}),
  immutable_types: z.array(z.string()).default(["decision", "session", "change", "insight"]),
});

export type Config = z.infer<typeof ConfigSchema>;

export function defaultConfig(): Config {
  return ConfigSchema.parse({ schemaVersion: 1 });
}

export function loadProjectConfig(repoRoot: string): Config {
  const p = configPath(repoRoot);
  if (!existsSync(p)) return defaultConfig();
  const raw = readFileSync(p, "utf8");
  const data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
  return ConfigSchema.parse(data);
}

export interface ConfigOverride {
  schemaVersion?: 1;
  folders?: Partial<Config["folders"]>;
  ids?: Partial<Config["ids"]>;
  required_frontmatter?: Partial<Config["required_frontmatter"]>;
  verification_required_for_status?: Config["verification_required_for_status"];
  freshness_warn_days?: Config["freshness_warn_days"];
  node_types?: Config["node_types"];
  immutable_types?: Config["immutable_types"];
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
    node_types: { ...base.node_types, ...(override.node_types ?? {}) },
    immutable_types: override.immutable_types ?? base.immutable_types,
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

/**
 * A type entry as understood by Browse, the Settings UI, and any code that
 * needs to enumerate every node type the user has configured (built-in + custom).
 */
export interface AnyTypeDef {
  /** Type name — e.g. "spec" or "experiment". */
  name: string;
  /** Folder name under the project root where nodes of this type live. */
  folder: string;
  /** ID prefix for new nodes. */
  idPrefix: string;
  /** True for the 10 baked-in types; false for user-added entries. */
  builtIn: boolean;
}

/** All declared node types in stable order: built-ins first, then custom alphabetical. */
export function listAllTypes(cfg: Config): AnyTypeDef[] {
  const out: AnyTypeDef[] = [];
  for (const t of NODE_TYPES) {
    out.push({
      name: t,
      folder: folderForNodeType(cfg, t),
      idPrefix: cfg.ids[t],
      builtIn: true,
    });
  }
  const customNames = Object.keys(cfg.node_types ?? {}).sort();
  for (const name of customNames) {
    const def = cfg.node_types[name];
    if (!def) continue;
    out.push({
      name,
      folder: def.folder,
      idPrefix: def.id_prefix,
      builtIn: false,
    });
  }
  return out;
}

/** Folder name for any declared type, or null if the type is unknown. */
export function folderForType(cfg: Config, typeName: string): string | null {
  if ((NODE_TYPES as readonly string[]).includes(typeName)) {
    return folderForNodeType(cfg, typeName as NodeType);
  }
  const custom = cfg.node_types?.[typeName];
  return custom ? custom.folder : null;
}

/** True for the 10 built-in types only. */
export function isBuiltInType(typeName: string): typeName is NodeType {
  return (NODE_TYPES as readonly string[]).includes(typeName);
}

/**
 * True when a node type is treated as append-only (proposal `update` is forbidden).
 * Two opt-in sources are checked: `cfg.immutable_types` (works for any type name,
 * built-in or custom) and `cfg.node_types[name].immutable === true` (per-type-def
 * opt-in for custom types). Either source flips it on.
 *
 * Note: end-to-end enforcement for *custom* type names is currently bottlenecked
 * by `asNodeType` in `inbox/read.ts`, which only accepts the 10 built-in
 * NodeType strings. A hand-authored proposal targeting a custom immutable type
 * is dropped at parse time with `proposal not found`, so this guard never sees
 * it. The check below is correct in isolation; the gap is in `read.ts` and
 * resolves once that whitelist is widened.
 */
export function isImmutableType(cfg: Config, typeName: string): boolean {
  if (cfg.immutable_types.includes(typeName)) return true;
  const custom = cfg.node_types?.[typeName];
  if (custom?.immutable === true) return true;
  return false;
}
