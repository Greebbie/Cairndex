import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { consolidateRecentSessions } from "../src/consolidate/index.js";
import { parseFrontmatter } from "../src/frontmatter.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-consol-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/insights"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/signals"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeSession(id: string, date: string, summary: string, body: string): void {
  writeFileSync(
    join(tmp, ".cairndex/sessions", `${id}.md`),
    `---\nid: ${id}\ndate: ${date}\nsummary: '${summary}'\n---\n\n${body}\n`,
  );
}

describe("consolidateRecentSessions", () => {
  it("emits a signal to signals/ when a node is referenced in 3+ recent sessions", async () => {
    writeSession(
      "2026-05-01-1000",
      "2026-05-01",
      "first attempt",
      "Touched [[SPEC-001]] and noticed retry timing issue",
    );
    writeSession(
      "2026-05-02-1100",
      "2026-05-02",
      "second attempt",
      "[[SPEC-001]] retry logic still flaky on Windows",
    );
    writeSession(
      "2026-05-03-0900",
      "2026-05-03",
      "third attempt",
      "Confirmed [[SPEC-001]] is the source — retry needs jitter",
    );

    const result = await consolidateRecentSessions(tmp, defaultConfig());
    expect(result.proposalsCreated).toBeGreaterThanOrEqual(1);

    // Output goes to signals/, NOT inbox.
    const sigFiles = readdirSync(join(tmp, ".cairndex/signals")).filter((f) =>
      f.endsWith(".md"),
    );
    expect(sigFiles.length).toBeGreaterThan(0);

    const raw = await readFile(join(tmp, ".cairndex/signals", sigFiles[0]), "utf8");
    const { data } = parseFrontmatter<Record<string, unknown>>(raw);
    expect(data.source).toBe("auto-consolidate");
    expect(data.id).toMatch(/^SIG-\d{3}$/);
    expect(String(data.summary ?? "")).toContain("SPEC-001");

    // signalId in the candidate result.
    const candidate = result.candidates.find((c) => c.target === "SPEC-001");
    expect(candidate?.signalId).toMatch(/^SIG-\d{3}$/);
  });

  it("does not emit a signal when references are sparse (<3 sessions)", async () => {
    writeSession("2026-05-01-1000", "2026-05-01", "one mention", "Saw [[SPEC-001]] briefly");
    writeSession("2026-05-02-1100", "2026-05-02", "another", "[[SPEC-001]] again");

    const result = await consolidateRecentSessions(tmp, defaultConfig());
    expect(result.proposalsCreated).toBe(0);
    const sigFiles = readdirSync(join(tmp, ".cairndex/signals")).filter((f) =>
      f.endsWith(".md"),
    );
    expect(sigFiles).toHaveLength(0);
  });

  it("dedupes — re-running does not create a second identical signal", async () => {
    writeSession("2026-04-25-1000", "2026-04-25", "a", "[[SPEC-001]]");
    writeSession("2026-04-26-1000", "2026-04-26", "b", "[[SPEC-001]]");
    writeSession("2026-04-27-1000", "2026-04-27", "c", "[[SPEC-001]]");

    const first = await consolidateRecentSessions(tmp, defaultConfig());
    const second = await consolidateRecentSessions(tmp, defaultConfig());

    // The second run should be a no-op because the signal already exists.
    expect(first.proposalsCreated).toBeGreaterThan(0);
    expect(second.proposalsCreated).toBe(0);

    const sigFiles = readdirSync(join(tmp, ".cairndex/signals")).filter((f) =>
      f.endsWith(".md"),
    );
    expect(sigFiles.length).toBe(first.proposalsCreated);
  });

  it("respects the lookbackDays window — old sessions are ignored", async () => {
    writeSession("2025-01-01-1000", "2025-01-01", "old1", "[[SPEC-001]]");
    writeSession("2025-01-02-1100", "2025-01-02", "old2", "[[SPEC-001]]");
    writeSession("2025-01-03-0900", "2025-01-03", "old3", "[[SPEC-001]]");

    const result = await consolidateRecentSessions(tmp, defaultConfig(), { lookbackDays: 30 });
    expect(result.proposalsCreated).toBe(0);
  });

  it("ignores PROP- / INBOX- / SESSION- IDs — these are workflow housekeeping, not subject matter", async () => {
    // The exact dogfood failure: sessions where the agent triages the inbox
    // mention PROP-028 / PROP-020 a few times each. consolidateRecentSessions
    // would then auto-draft "Pattern around PROP-028" meta-signals — noise
    // about the noise. Same workflow-prefix filter as extractFromSession.ts.
    writeSession(
      "2026-04-25-1000",
      "2026-04-25",
      "triage",
      "Reviewed [[PROP-028]] and PROP-028 again",
    );
    writeSession(
      "2026-04-26-1000",
      "2026-04-26",
      "triage",
      "[[PROP-028]] still pending — PROP-028",
    );
    writeSession(
      "2026-04-27-1000",
      "2026-04-27",
      "triage",
      "Looked at PROP-028 and INBOX-007 plus [[SESSION-2026-04-26-1000]]",
    );
    const result = await consolidateRecentSessions(tmp, defaultConfig());
    expect(result.proposalsCreated).toBe(0);
    const sigFiles = readdirSync(join(tmp, ".cairndex/signals")).filter((f) =>
      f.endsWith(".md"),
    );
    expect(sigFiles).toHaveLength(0);
  });

  it("skips nodes that already have an insight covering them", async () => {
    writeSession("2026-04-25-1000", "2026-04-25", "a", "[[SPEC-001]]");
    writeSession("2026-04-26-1000", "2026-04-26", "b", "[[SPEC-001]]");
    writeSession("2026-04-27-1000", "2026-04-27", "c", "[[SPEC-001]]");
    writeFileSync(
      join(tmp, ".cairndex/insights/INS-001.md"),
      "---\nid: INS-001\ntitle: 'Pattern around SPEC-001'\nstatus: stable\ncreated: 2026-04-28\nlinks:\n  - { type: implements, target: SPEC-001 }\n---\nexisting insight body\n",
    );
    const result = await consolidateRecentSessions(tmp, defaultConfig());
    expect(result.proposalsCreated).toBe(0);
  });
});

describe("consolidateRecentSessions — signal shape", () => {
  it("consolidate writes to signals/ with source: auto-consolidate", async () => {
    writeSession("2026-04-25-1000", "2026-04-25", "a", "[[SPEC-001]]");
    writeSession("2026-04-26-1000", "2026-04-26", "b", "[[SPEC-001]]");
    writeSession("2026-04-27-1000", "2026-04-27", "c", "[[SPEC-001]]");

    await consolidateRecentSessions(tmp, defaultConfig());

    // Must write to signals/, not inbox.
    const inboxFiles = await readdir(join(tmp, ".cairndex/inbox/proposed-memory-updates")).catch(
      () => [],
    );
    const sigFiles = await readdir(join(tmp, ".cairndex/signals")).catch(() => []);

    expect(inboxFiles.filter((f) => f.endsWith(".md"))).toHaveLength(0);
    expect(sigFiles.filter((f) => f.endsWith(".md")).length).toBeGreaterThan(0);

    const sigMdFiles = sigFiles.filter((f) => f.endsWith(".md"));
    const raw = await readFile(join(tmp, ".cairndex/signals", sigMdFiles[0]), "utf8");
    const { data } = parseFrontmatter<Record<string, unknown>>(raw);

    expect(data.source).toBe("auto-consolidate");
    // Signal shape must NOT carry inbox proposal lifecycle fields.
    expect(data.proposalType).toBeUndefined();
    expect(data.status).toBeUndefined();
    expect(data.id).toMatch(/^SIG-\d{3}$/);
    expect(data.targetType).toBe("insight");
    expect(typeof data.contentHash).toBe("string");
    expect((data.provenance as Record<string, unknown>)?.created_by).toBe("auto-consolidate");
  });

  it("newFrontmatter in the signal contains insight seed fields", async () => {
    writeSession("2026-04-25-1000", "2026-04-25", "a", "[[SPEC-001]]");
    writeSession("2026-04-26-1000", "2026-04-26", "b", "[[SPEC-001]]");
    writeSession("2026-04-27-1000", "2026-04-27", "c", "[[SPEC-001]]");
    await consolidateRecentSessions(tmp, defaultConfig());

    const sigFiles = readdirSync(join(tmp, ".cairndex/signals")).filter((f) =>
      f.endsWith(".md"),
    );
    const raw = await readFile(join(tmp, ".cairndex/signals", sigFiles[0]), "utf8");
    const { data } = parseFrontmatter<Record<string, unknown>>(raw);
    const nfm = data.newFrontmatter as Record<string, unknown> | undefined;
    expect(nfm?.title).toBeDefined();
    expect(nfm?.tags).toEqual(expect.arrayContaining(["consolidated"]));
  });
});
