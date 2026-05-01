import type { Node, Parent, Root, Text } from "mdast";
import type { Plugin } from "unified";

const WIKILINK = /\[\[([A-Z]+-\d+|\d{4}-\d{2}-\d{2}-\d{4})\]\]/g;

const PREFIX_TO_TYPE: Record<string, string> = {
  GOAL: "goal",
  INT: "intent",
  SPEC: "spec",
  ADR: "decision",
  PLAN: "plan",
  TASK: "task",
  INS: "insight",
  QUESTION: "question",
  CHG: "change",
};

function resolveType(id: string): string | null {
  // Date-form session IDs.
  if (/^\d{4}-\d{2}-\d{2}-\d{4}$/.test(id)) return "session";
  const m = /^([A-Z]+)-\d+$/.exec(id);
  if (!m || !m[1]) return null;
  return PREFIX_TO_TYPE[m[1]] ?? null;
}

function urlForId(id: string, alias: string | undefined): string {
  const type = resolveType(id);
  if (alias && type) return `/p/${alias}/browse/${type}/${id}`;
  // Fallback: anchor-only link, won't resolve but won't navigate away either.
  return `#${id}`;
}

export interface RemarkWikilinksOptions {
  alias?: string;
}

export const remarkWikilinks: Plugin<[RemarkWikilinksOptions?], Root> = (options = {}) => {
  const alias = options.alias;
  return (tree) => {
    const visit = (node: Node, parent: Parent | null, index: number | undefined) => {
      if (
        node.type === "text" &&
        "value" in node &&
        typeof (node as Text).value === "string" &&
        WIKILINK.test((node as Text).value)
      ) {
        const text = (node as Text).value;
        const newChildren: Node[] = [];
        let last = 0;
        WIKILINK.lastIndex = 0;
        let m = WIKILINK.exec(text);
        while (m !== null) {
          if (m.index > last)
            newChildren.push({ type: "text", value: text.slice(last, m.index) } as Text);
          newChildren.push({
            type: "link",
            url: urlForId(m[1] ?? "", alias),
            children: [{ type: "text", value: m[1] } as Text],
          } as Node);
          last = m.index + m[0].length;
          m = WIKILINK.exec(text);
        }
        if (last < text.length) newChildren.push({ type: "text", value: text.slice(last) } as Text);
        if (parent && index !== undefined)
          parent.children.splice(
            index,
            1,
            ...(newChildren as Parameters<typeof parent.children.splice>[2][]),
          );
      }
      if ("children" in node && Array.isArray((node as Parent).children)) {
        const children = (node as Parent).children;
        for (let i = children.length - 1; i >= 0; i--) {
          const child = children[i];
          if (child) visit(child, node as Parent, i);
        }
      }
    };
    visit(tree, null, undefined);
  };
};
