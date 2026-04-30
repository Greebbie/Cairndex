export interface ParsedId {
  prefix: string;
  number: number;
  raw: string;
}

const ID_RE = /^([A-Z]+)-(\d+)$/;

export function parseId(raw: string): ParsedId | null {
  const m = ID_RE.exec(raw);
  if (!m || !m[1] || !m[2]) return null;
  return { prefix: m[1], number: Number.parseInt(m[2], 10), raw };
}

export function formatSequentialId(prefix: string, n: number): string {
  const padded = String(n).padStart(3, "0");
  return `${prefix}-${padded}`;
}

export function nextSequentialId(prefix: string, existingIds: readonly string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const parsed = parseId(id);
    if (parsed && parsed.prefix === prefix && parsed.number > max) {
      max = parsed.number;
    }
  }
  return formatSequentialId(prefix, max + 1);
}

export function formatSessionId(d: Date, opts: { utc?: boolean } = {}): string {
  const yyyy = opts.utc ? d.getUTCFullYear() : d.getFullYear();
  const MM = (opts.utc ? d.getUTCMonth() : d.getMonth()) + 1;
  const dd = opts.utc ? d.getUTCDate() : d.getDate();
  const HH = opts.utc ? d.getUTCHours() : d.getHours();
  const mm = opts.utc ? d.getUTCMinutes() : d.getMinutes();
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${yyyy}-${p2(MM)}-${p2(dd)}-${p2(HH)}${p2(mm)}`;
}
