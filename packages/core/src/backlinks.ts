import type { Config } from "./config.js";
import { NODE_TYPES, type NodeType } from "./types.js";
import { listNodeFiles } from "./vault.js";

export interface Backlink {
  from: string;
  fromType: NodeType; // source node's type
  type: string; // typed-edge type, or "mentions" for wikilinks
}

export type BacklinkIndex = Map<string, Backlink[]>;

const WIKILINK_RE = /\[\[([A-Z]+-\d+|[\d-]+)\]\]/g;

interface LinkLike {
  type: string;
  target: string;
}

export async function computeBacklinks(repoRoot: string, cfg: Config): Promise<BacklinkIndex> {
  const idx: BacklinkIndex = new Map();
  const all: { id: string; type: NodeType; body: string; frontmatter: Record<string, unknown> }[] =
    [];
  for (const t of NODE_TYPES) {
    for (const n of await listNodeFiles(repoRoot, cfg, t)) {
      all.push({ id: n.id, type: t, body: n.body, frontmatter: n.frontmatter });
      if (!idx.has(n.id)) idx.set(n.id, []);
    }
  }
  for (const n of all) {
    // typed edges
    const links = (n.frontmatter.links ?? []) as unknown[];
    if (Array.isArray(links)) {
      for (const link of links) {
        if (typeof link === "string") {
          const list = idx.get(link) ?? [];
          list.push({ from: n.id, fromType: n.type, type: "links" });
          idx.set(link, list);
          continue;
        }
        if (!link || typeof link !== "object") continue;
        const typed = link as Partial<LinkLike>;
        if (!typed.target) continue;
        const list = idx.get(typed.target) ?? [];
        list.push({ from: n.id, fromType: n.type, type: typed.type ?? "links" });
        idx.set(typed.target, list);
      }
    }
    // wikilinks in body
    WIKILINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null = WIKILINK_RE.exec(n.body);
    while (m !== null) {
      const target = m[1];
      if (target) {
        const list = idx.get(target) ?? [];
        list.push({ from: n.id, fromType: n.type, type: "mentions" });
        idx.set(target, list);
      }
      m = WIKILINK_RE.exec(n.body);
    }
  }
  return idx;
}
