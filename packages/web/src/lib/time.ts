/**
 * Compact relative-time helpers used by the dashboard. Mirrors the CLI's `cairndex status`
 * output style so a human switching between terminal and GUI sees the same labels.
 */

/** Format a millisecond delta into a short human label. */
export function humanizeRelative(then: number, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.round(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.round(diffMo / 12)}y ago`;
}

/**
 * Best-effort: parse a date string (ISO or ISO-prefix like "2026-05-03") and return a
 * relative label. If parsing fails, return the original string so the UI still shows
 * something legible. Pass `now` for deterministic rendering in tests.
 */
export function humanizeDateString(value: string, now: number = Date.now()): string {
  if (!value) return value;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value;
  return humanizeRelative(ms, now);
}
