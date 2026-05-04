import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { consolidateRecentSessions } from "../src/consolidate/index.js";
import { listProposals } from "../src/inbox/read.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-consol-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/insights"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"), { recursive: true });
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
  it("drafts an insight proposal when a node is referenced in 3+ recent sessions", async () => {
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

    const inbox = await listProposals(tmp, defaultConfig());
    const draft = inbox.pending.find((p) => p.targetType === "insight");
    expect(draft).toBeDefined();
    expect(draft?.proposalType).toBe("create");
    expect(draft?.summary).toContain("SPEC-001");
    expect(draft?.newBody).toContain("2026-05-01");
    expect(draft?.newBody).toContain("2026-05-03");
  });

  it("does not draft a proposal when references are sparse (<3 sessions)", async () => {
    writeSession("2026-05-01-1000", "2026-05-01", "one mention", "Saw [[SPEC-001]] briefly");
    writeSession("2026-05-02-1100", "2026-05-02", "another", "[[SPEC-001]] again");

    const result = await consolidateRecentSessions(tmp, defaultConfig());
    expect(result.proposalsCreated).toBe(0);
    const inbox = await listProposals(tmp, defaultConfig());
    expect(inbox.pending.filter((p) => p.targetType === "insight")).toHaveLength(0);
  });

  it("dedupes — re-running does not create a second identical proposal", async () => {
    writeSession("2026-04-25-1000", "2026-04-25", "a", "[[SPEC-001]]");
    writeSession("2026-04-26-1000", "2026-04-26", "b", "[[SPEC-001]]");
    writeSession("2026-04-27-1000", "2026-04-27", "c", "[[SPEC-001]]");

    const first = await consolidateRecentSessions(tmp, defaultConfig());
    const second = await consolidateRecentSessions(tmp, defaultConfig());

    // The second run should be a no-op because the proposal already exists in the inbox.
    expect(first.proposalsCreated).toBeGreaterThan(0);
    expect(second.proposalsCreated).toBe(0);

    const proposalFiles = readdirSync(join(tmp, ".cairndex/inbox/proposed-memory-updates")).filter(
      (f) => f.endsWith(".md"),
    );
    expect(proposalFiles.length).toBe(first.proposalsCreated);
  });

  it("respects the lookbackDays window — old sessions are ignored", async () => {
    writeSession("2025-01-01-1000", "2025-01-01", "old1", "[[SPEC-001]]");
    writeSession("2025-01-02-1100", "2025-01-02", "old2", "[[SPEC-001]]");
    writeSession("2025-01-03-0900", "2025-01-03", "old3", "[[SPEC-001]]");

    const result = await consolidateRecentSessions(tmp, defaultConfig(), { lookbackDays: 30 });
    expect(result.proposalsCreated).toBe(0);
  });

  it("ignores PROP- / INBOX- / SESSION- IDs — these are workflow housekeeping, not subject matter", async () => {
    // The exact dogfood failure: sessions where the agent triaged the inbox
    // mention PROP-028 / PROP-020 a few times each. consolidateRecentSessions
    // would then auto-draft "Pattern around PROP-028" meta-proposals — noise
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
    const inbox = await listProposals(tmp, defaultConfig());
    expect(inbox.pending.filter((p) => p.targetType === "insight")).toHaveLength(0);
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

describe("consolidateRecentSessions — file shape", () => {
  it("creates a proposal whose newFrontmatter conforms to insight schema", async () => {
    writeSession("2026-04-25-1000", "2026-04-25", "a", "[[SPEC-001]]");
    writeSession("2026-04-26-1000", "2026-04-26", "b", "[[SPEC-001]]");
    writeSession("2026-04-27-1000", "2026-04-27", "c", "[[SPEC-001]]");
    await consolidateRecentSessions(tmp, defaultConfig());
    const inbox = await listProposals(tmp, defaultConfig());
    const draft = inbox.pending.find((p) => p.targetType === "insight");
    expect(draft?.newFrontmatter?.title).toBeDefined();
    expect(draft?.newFrontmatter?.status).toBe("draft");
    expect(draft?.newFrontmatter?.tags).toEqual(expect.arrayContaining(["consolidated"]));
  });

  it("the proposal lives in inbox/proposed-memory-updates/ and is committed when the proposal id appears", async () => {
    writeSession("2026-04-25-1000", "2026-04-25", "a", "[[SPEC-001]]");
    writeSession("2026-04-26-1000", "2026-04-26", "b", "[[SPEC-001]]");
    writeSession("2026-04-27-1000", "2026-04-27", "c", "[[SPEC-001]]");
    await consolidateRecentSessions(tmp, defaultConfig());
    const dir = join(tmp, ".cairndex/inbox/proposed-memory-updates");
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir);
    expect(files.some((f) => /^PROP-\d+\.md$/.test(f))).toBe(true);
  });
});
