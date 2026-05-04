import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseFrontmatter } from "../src/frontmatter.js";
import { acceptProposal } from "../src/inbox/accept.js";
import { createProposal } from "../src/inbox/create.js";

/**
 * Bug surfaced by dogfood: accepting a `create` proposal lost the proposal's
 * provenance. INS-001 ended up with no `created_by` / `session` fields and the
 * provenance-present validator flagged it. The fix carries proposal.provenance
 * forward into the new node's frontmatter (under the standard `created_by`
 * key, matching the rest of the codebase).
 */
describe("acceptProposal — provenance preservation (create branch)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function repo(): string {
    const r = mkdtempSync(join(tmpdir(), "cairn-prov-"));
    dirs.push(r);
    // Pre-create the durable folders so accept's nodeFolderPath finds them.
    for (const sub of [
      "specs",
      "decisions",
      "plans",
      "tasks",
      "insights",
      "inbox/proposed-memory-updates",
    ]) {
      mkdirSync(join(r, ".cairndex", sub), { recursive: true });
    }
    return r;
  }

  it("transfers provenance from PROP to the newly-created durable node", async () => {
    const r = repo();
    const cfg = defaultConfig();
    const propResult = await createProposal(r, cfg, {
      proposalType: "create",
      targetType: "insight",
      newFrontmatter: { title: "Test insight", status: "active" },
      newBody: "## Body\n",
      summary: "test",
      reason: "test",
      provenance: {
        createdBy: "agent-x",
        session: "2026-05-03-1200",
        confidence: 0.7,
      },
    });
    const accept = await acceptProposal(r, cfg, propResult.proposalId);
    expect(accept.action).toBe("created");

    const raw = readFileSync(accept.targetPath, "utf8");
    const { data } = parseFrontmatter<{ provenance?: Record<string, unknown> }>(raw);
    expect(data?.provenance).toBeDefined();
    expect(data?.provenance?.created_by).toBe("agent-x");
    expect(data?.provenance?.session).toBe("2026-05-03-1200");
    expect(data?.provenance?.confidence).toBe(0.7);
  });

  it("omits confidence when the PROP didn't have one", async () => {
    const r = repo();
    const cfg = defaultConfig();
    const propResult = await createProposal(r, cfg, {
      proposalType: "create",
      targetType: "insight",
      newFrontmatter: { title: "No confidence", status: "active" },
      newBody: "body\n",
      summary: "s",
      reason: "r",
      provenance: { createdBy: "a", session: "s1" },
    });
    const accept = await acceptProposal(r, cfg, propResult.proposalId);
    const raw = readFileSync(accept.targetPath, "utf8");
    const { data } = parseFrontmatter<{ provenance?: Record<string, unknown> }>(raw);
    expect(data?.provenance?.created_by).toBe("a");
    expect(data?.provenance?.session).toBe("s1");
    expect(data?.provenance?.confidence).toBeUndefined();
  });

  it("respects caller-supplied provenance in newFrontmatter — does not overwrite it", async () => {
    const r = repo();
    const cfg = defaultConfig();
    const propResult = await createProposal(r, cfg, {
      proposalType: "create",
      targetType: "insight",
      newFrontmatter: {
        title: "Custom prov",
        status: "active",
        provenance: { created_by: "explicit", session: "explicit-session" },
      },
      newBody: "body\n",
      summary: "s",
      reason: "r",
      provenance: { createdBy: "agent-default", session: "default-session" },
    });
    const accept = await acceptProposal(r, cfg, propResult.proposalId);
    const raw = readFileSync(accept.targetPath, "utf8");
    const { data } = parseFrontmatter<{ provenance?: Record<string, unknown> }>(raw);
    // newFrontmatter's explicit provenance wins.
    expect(data?.provenance?.created_by).toBe("explicit");
    expect(data?.provenance?.session).toBe("explicit-session");
  });
});
