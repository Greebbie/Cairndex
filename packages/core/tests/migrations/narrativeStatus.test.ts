import { promises as fs } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { migrateNarrativeStatus } from "../../src/migrations/narrativeStatus.js";
import { vaultPath } from "../../src/paths.js";

describe("migrateNarrativeStatus", () => {
  it("adds narrative_status: empty to sessions missing the field", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairndex-mig-"));
    const sessionsDir = join(vaultPath(root), "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(
      join(sessionsDir, "2026-04-30-1000.md"),
      `---
id: 2026-04-30-1000
date: '2026-04-30'
summary: ''
provenance:
  created_by: claude-code
  session: 2026-04-30-1000
links: []
---

## What I did

(TODO: describe the work in 1–3 bullets.)
`,
    );

    const result = await migrateNarrativeStatus({ cwd: root });
    expect(result.updated).toBe(1);
    expect(result.scanned).toBe(1);
    expect(result.skipped).toBe(0);

    const after = await fs.readFile(join(sessionsDir, "2026-04-30-1000.md"), "utf8");
    expect(after).toMatch(/^narrative_status: empty$/m);
  });

  it("is idempotent — does not bump narrative_status: confirmed back to empty", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairndex-mig-idem-"));
    const sessionsDir = join(vaultPath(root), "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(
      join(sessionsDir, "2026-04-29-0900.md"),
      `---
id: 2026-04-29-0900
date: '2026-04-29'
summary: 'real work'
narrative_status: confirmed
provenance:
  created_by: x
  session: y
links: []
---
body
`,
    );

    const result = await migrateNarrativeStatus({ cwd: root });
    expect(result.updated).toBe(0);
    expect(result.scanned).toBe(1);
    expect(result.skipped).toBe(1);

    const after = await fs.readFile(join(sessionsDir, "2026-04-29-0900.md"), "utf8");
    expect(after).toMatch(/^narrative_status: confirmed$/m);
  });

  it("is idempotent — does not overwrite narrative_status: auto", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairndex-mig-auto-"));
    const sessionsDir = join(vaultPath(root), "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    await fs.writeFile(
      join(sessionsDir, "2026-05-01-1200.md"),
      `---
id: 2026-05-01-1200
date: '2026-05-01'
summary: 'auto-generated'
narrative_status: auto
provenance:
  created_by: cairndex-auto-session
  session: 2026-05-01-1200
links: []
---
body
`,
    );

    const result = await migrateNarrativeStatus({ cwd: root });
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);

    const after = await fs.readFile(join(sessionsDir, "2026-05-01-1200.md"), "utf8");
    expect(after).toMatch(/^narrative_status: auto$/m);
  });

  it("returns zero counts gracefully when no sessions/ folder exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairndex-mig-empty-"));
    const result = await migrateNarrativeStatus({ cwd: root });
    expect(result.scanned).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("handles multiple session files correctly — updates missing, skips present", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairndex-mig-multi-"));
    const sessionsDir = join(vaultPath(root), "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    // Two files without narrative_status
    await fs.writeFile(
      join(sessionsDir, "2026-04-01-0900.md"),
      `---
id: 2026-04-01-0900
date: '2026-04-01'
summary: ''
provenance:
  created_by: claude-code
  session: 2026-04-01-0900
links: []
---
body1
`,
    );
    await fs.writeFile(
      join(sessionsDir, "2026-04-02-1000.md"),
      `---
id: 2026-04-02-1000
date: '2026-04-02'
summary: ''
provenance:
  created_by: claude-code
  session: 2026-04-02-1000
links: []
---
body2
`,
    );
    // One file already confirmed
    await fs.writeFile(
      join(sessionsDir, "2026-04-03-1100.md"),
      `---
id: 2026-04-03-1100
date: '2026-04-03'
summary: 'done'
narrative_status: confirmed
provenance:
  created_by: x
  session: 2026-04-03-1100
links: []
---
body3
`,
    );

    const result = await migrateNarrativeStatus({ cwd: root });
    expect(result.scanned).toBe(3);
    expect(result.updated).toBe(2);
    expect(result.skipped).toBe(1);

    const f1 = await fs.readFile(join(sessionsDir, "2026-04-01-0900.md"), "utf8");
    const f2 = await fs.readFile(join(sessionsDir, "2026-04-02-1000.md"), "utf8");
    const f3 = await fs.readFile(join(sessionsDir, "2026-04-03-1100.md"), "utf8");
    expect(f1).toMatch(/^narrative_status: empty$/m);
    expect(f2).toMatch(/^narrative_status: empty$/m);
    expect(f3).toMatch(/^narrative_status: confirmed$/m);
  });

  it("preserves all other frontmatter fields and body content unchanged", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairndex-mig-preserve-"));
    const sessionsDir = join(vaultPath(root), "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const originalContent = `---
id: 2026-04-15-0830
date: '2026-04-15'
summary: 'some summary text'
provenance:
  created_by: claude-code
  session: 2026-04-15-0830
links:
  - type: relates_to
    target: task-123
tags:
  - feature
---

## Progress

- did something important

## Next

- follow up tomorrow
`;

    await fs.writeFile(join(sessionsDir, "2026-04-15-0830.md"), originalContent);

    await migrateNarrativeStatus({ cwd: root });

    const after = await fs.readFile(join(sessionsDir, "2026-04-15-0830.md"), "utf8");
    // narrative_status added
    expect(after).toMatch(/^narrative_status: empty$/m);
    // All original fields preserved
    expect(after).toMatch(/^id: 2026-04-15-0830$/m);
    expect(after).toMatch(/^date: '2026-04-15'$/m);
    expect(after).toMatch(/^summary: some summary text$/m);
    // Body content preserved
    expect(after).toContain("## Progress");
    expect(after).toContain("did something important");
    expect(after).toContain("## Next");
    expect(after).toContain("follow up tomorrow");
  });
});
