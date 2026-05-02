/**
 * Construct the SPA route for a node detail page. The API and React route both
 * key on the singular type name (e.g. "spec", not "specs"); using `${type}/${id}`
 * directly keeps it that way. Centralized here so a route format change touches
 * one file instead of every component that links into the browse tree.
 */
export function nodeLink(alias: string, type: string, id: string): string {
  return `/p/${alias}/browse/${type}/${id}`;
}
