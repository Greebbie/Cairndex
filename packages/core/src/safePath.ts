import { resolve, sep } from "node:path";

/**
 * Returns the absolute, normalized path if it is contained within `base`.
 * Throws otherwise. Use at every site that joins user-derived path segments.
 */
export function assertContained(candidate: string, base: string): string {
  const target = resolve(candidate);
  const root = resolve(base);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`path traversal: ${candidate} escapes ${base}`);
  }
  return target;
}
