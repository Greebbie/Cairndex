import matter from "gray-matter";

export interface FrontmatterParsed<T = Record<string, unknown>> {
  data: T;
  content: string;
}

export function parseFrontmatter<T = Record<string, unknown>>(
  source: string,
): FrontmatterParsed<T> {
  const parsed = matter(source);
  return {
    data: parsed.data as T,
    content: parsed.content,
  };
}

export function serializeFrontmatter<T extends Record<string, unknown>>(
  data: T,
  content: string,
): string {
  return matter.stringify(content, data);
}
