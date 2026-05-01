import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { type Config, folderForNodeType } from "../config.js";
import { buildActiveContext } from "../indexes/activeContext.js";
import { buildMemoryHealth } from "../indexes/memoryHealth.js";
import { indexPath, nodeFolderPath } from "../paths.js";
import { NODE_TYPES, type NodeType } from "../types.js";
import { listNodeFiles, readNode } from "../vault.js";
import type {
  ListResourcesResult,
  McpResource,
  ReadResourceResult,
} from "./types.js";

const SCHEME = "cairndex://vault/";
const NODE_TYPE_TO_FOLDER_NAME: Record<NodeType, string> = {
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

const FOLDER_NAME_TO_NODE_TYPE: Record<string, NodeType> = Object.fromEntries(
  (Object.entries(NODE_TYPE_TO_FOLDER_NAME) as [NodeType, string][]).map(([t, f]) => [f, t]),
);

export async function listMcpResources(
  repoRoot: string,
  cfg: Config,
): Promise<ListResourcesResult> {
  const resources: McpResource[] = [
    {
      uri: `${SCHEME}index`,
      name: "Project index",
      description:
        "Project-level index.md (phase, active focus, recent changes). Always read first.",
      mimeType: "text/markdown",
    },
    {
      uri: `${SCHEME}active-context`,
      name: "Active context",
      description:
        "Derived state: phase, active goal/spec/plan/task, next action. Cheaper than reading the whole vault.",
      mimeType: "application/json",
    },
    {
      uri: `${SCHEME}memory-health`,
      name: "Memory health",
      description:
        "Aggregated red/yellow/green counts plus the underlying issues. Tells the agent what is stale, low-confidence, or unverified.",
      mimeType: "application/json",
    },
  ];

  for (const t of NODE_TYPES) {
    const folderName = NODE_TYPE_TO_FOLDER_NAME[t];
    resources.push({
      uri: `${SCHEME}${folderName}`,
      name: `${t}s (list)`,
      description: `Compact list of all ${t} nodes (id, title, status, freshness).`,
      mimeType: "application/json",
    });
    const files = await listNodeFiles(repoRoot, cfg, t);
    for (const f of files) {
      resources.push({
        uri: `${SCHEME}${folderName}/${f.id}`,
        name: `${f.id} — ${String(f.frontmatter.title ?? f.id)}`,
        description: `${t} node`,
        mimeType: "text/markdown",
      });
    }
  }
  return { resources };
}

export async function readMcpResource(
  repoRoot: string,
  cfg: Config,
  uri: string,
): Promise<ReadResourceResult> {
  if (!uri.startsWith(SCHEME)) {
    throw new Error(`unsupported scheme for cairndex MCP: ${uri}`);
  }
  const tail = uri.slice(SCHEME.length);

  if (tail === "index") {
    const path = indexPath(repoRoot);
    const text = existsSync(path) ? await readFile(path, "utf8") : "";
    return { contents: [{ uri, mimeType: "text/markdown", text }] };
  }

  if (tail === "active-context") {
    const ctx = await buildActiveContext(repoRoot, cfg);
    return {
      contents: [
        { uri, mimeType: "application/json", text: JSON.stringify(ctx, null, 2) },
      ],
    };
  }

  if (tail === "memory-health") {
    const health = await buildMemoryHealth(repoRoot, cfg);
    return {
      contents: [
        { uri, mimeType: "application/json", text: JSON.stringify(health, null, 2) },
      ],
    };
  }

  // Folder list or single node.
  const segs = tail.split("/").filter(Boolean);
  if (segs.length === 0) throw new Error(`malformed cairndex URI: ${uri}`);
  const folderName = segs[0]!;
  const nodeType = FOLDER_NAME_TO_NODE_TYPE[folderName];
  if (!nodeType) {
    throw new Error(`unknown cairndex resource folder: ${folderName}`);
  }

  if (segs.length === 1) {
    const files = await listNodeFiles(repoRoot, cfg, nodeType);
    const nodes = files.map((f) => ({
      id: f.id,
      type: nodeType,
      title: String(f.frontmatter.title ?? f.id),
      status: String(f.frontmatter.status ?? ""),
      updated: String(f.frontmatter.updated ?? f.frontmatter.created ?? ""),
    }));
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ folder: folderName, nodes }, null, 2),
        },
      ],
    };
  }

  if (segs.length === 2) {
    const id = segs[1]!;
    // Confirm folder exists; readNode reads from the configured folder.
    const folder = nodeFolderPath(repoRoot, folderForNodeType(cfg, nodeType));
    if (!existsSync(folder)) throw new Error(`folder not found for ${nodeType}: ${folder}`);
    const node = await readNode(repoRoot, cfg, nodeType, id);
    if (!node) throw new Error(`node not found: ${nodeType}/${id}`);
    return { contents: [{ uri, mimeType: "text/markdown", text: nodeRaw(node) }] };
  }

  throw new Error(`malformed cairndex URI: ${uri}`);
}

function nodeRaw(node: { frontmatter: Record<string, unknown>; body: string }): string {
  // Re-serialize to keep the markdown view canonical.
  // Use a minimal YAML emit to avoid pulling another dep here.
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(node.frontmatter)) {
    lines.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  }
  lines.push("---", "", node.body);
  return lines.join("\n");
}
