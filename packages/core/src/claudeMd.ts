export const CAIRNDEX_BLOCK_START = "<!-- cairndex:start v1 -->";
export const CAIRNDEX_BLOCK_END = "<!-- cairndex:end -->";

export type ApplyAction = "created" | "appended" | "replaced";

export interface ApplyResult {
  updated: string;
  action: ApplyAction;
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : `${s}\n`;
}

export function applyCairndexBlock(existing: string | undefined, blockBody: string): ApplyResult {
  const body = ensureTrailingNewline(blockBody);
  const wrapped = `${CAIRNDEX_BLOCK_START}\n${body}${CAIRNDEX_BLOCK_END}\n`;

  if (existing === undefined || existing.trim().length === 0) {
    return { updated: wrapped, action: "created" };
  }

  const startIdx = existing.indexOf(CAIRNDEX_BLOCK_START);
  const endIdx = existing.indexOf(CAIRNDEX_BLOCK_END);
  if (startIdx >= 0 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + CAIRNDEX_BLOCK_END.length);
    // Trim a single leading newline from `after` to avoid blank-line drift on idempotent runs.
    const afterTrimmed = after.startsWith("\n") ? after.slice(1) : after;
    return {
      updated: `${before}${CAIRNDEX_BLOCK_START}\n${body}${CAIRNDEX_BLOCK_END}\n${afterTrimmed}`,
      action: "replaced",
    };
  }

  const sep = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  return {
    updated: `${existing}${sep}${wrapped}`,
    action: "appended",
  };
}
