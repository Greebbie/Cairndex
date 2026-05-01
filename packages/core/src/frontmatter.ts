import matter from "gray-matter";
import yaml from "js-yaml";

export interface FrontmatterParsed<T = Record<string, unknown>> {
  data: T;
  content: string;
}

/**
 * Safe gray-matter engines: only YAML (with JSON_SCHEMA restriction) is accepted.
 * The `js` and `coffee` entries are replaced with no-ops that throw, preventing
 * arbitrary code execution via `---js` or `---coffee` frontmatter delimiters.
 */
const SAFE_ENGINES = {
  yaml: {
    parse: (s: string) => yaml.load(s, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>,
    stringify: (o: unknown) => yaml.dump(o),
  },
  js: {
    parse: (_s: string): Record<string, unknown> => {
      throw new Error("js frontmatter engine is disabled for security");
    },
    stringify: (_o: unknown): string => {
      throw new Error("js frontmatter engine is disabled for security");
    },
  },
  coffee: {
    parse: (_s: string): Record<string, unknown> => {
      throw new Error("coffee frontmatter engine is disabled for security");
    },
    stringify: (_o: unknown): string => {
      throw new Error("coffee frontmatter engine is disabled for security");
    },
  },
};

export function parseFrontmatter<T = Record<string, unknown>>(
  source: string,
): FrontmatterParsed<T> {
  const parsed = matter(source, { engines: SAFE_ENGINES, language: "yaml" });
  return {
    data: parsed.data as T,
    content: parsed.content,
  };
}

export function serializeFrontmatter<T extends Record<string, unknown>>(
  data: T,
  content: string,
): string {
  return matter.stringify(content, data, { engines: SAFE_ENGINES, language: "yaml" });
}
