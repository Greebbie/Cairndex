import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-srv-inbox-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"), { recursive: true });
  writeFileSync(
    join(tmp, ".cairndex/specs/SPEC-001.md"),
    "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nold body\n",
    "utf8",
  );
  writeFileSync(join(tmp, ".cairndex/config.yaml"), "schemaVersion: 1\n");
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function makeApp() {
  return await createServer({
    projects: [{ path: tmp, alias: "demo", registered_at: "2026-05-02T00:00:00Z" }],
  });
}

async function postProposal(app: Awaited<ReturnType<typeof makeApp>>) {
  return await app.inject({
    method: "POST",
    url: "/api/vault/demo/inbox/propose",
    payload: {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "shiny new body\n",
      summary: "tighten",
      reason: "clarity",
      provenance: { createdBy: "claude", session: "s" },
    },
  });
}

describe("GET /api/vault/:alias/inbox", () => {
  it("returns the bucketed proposal list", async () => {
    const app = await makeApp();
    await postProposal(app);
    const r = await app.inject({ method: "GET", url: "/api/vault/demo/inbox" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { pending: Array<{ proposalId: string }> };
    expect(body.pending.length).toBe(1);
    await app.close();
  });
});

describe("POST /api/vault/:alias/inbox/propose", () => {
  it("creates a proposal and reports duplicateOf when applicable", async () => {
    const app = await makeApp();
    const a = await postProposal(app);
    expect(a.statusCode).toBe(200);
    const aBody = a.json() as { proposalId: string };
    const b = await postProposal(app);
    const bBody = b.json() as { proposalId: string; duplicateOf?: string };
    expect(bBody.duplicateOf).toBe(aBody.proposalId);
    await app.close();
  });
});

describe("POST /api/vault/:alias/inbox/:proposalId/accept", () => {
  it("applies the proposal and updates the durable file", async () => {
    const app = await makeApp();
    const created = await postProposal(app);
    const proposalId = (created.json() as { proposalId: string }).proposalId;
    const r = await app.inject({
      method: "POST",
      url: `/api/vault/demo/inbox/${proposalId}/accept`,
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { applied: { action: string } };
    expect(body.applied.action).toBe("updated");
    await app.close();
  });

  it("returns 4xx for an unknown proposal id", async () => {
    const app = await makeApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/vault/demo/inbox/PROP-999/accept",
    });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

describe("POST /api/vault/:alias/inbox/:proposalId/reject", () => {
  it("marks the proposal rejected with the supplied reason", async () => {
    const app = await makeApp();
    const created = await postProposal(app);
    const proposalId = (created.json() as { proposalId: string }).proposalId;
    const r = await app.inject({
      method: "POST",
      url: `/api/vault/demo/inbox/${proposalId}/reject`,
      payload: { reason: "stale context" },
    });
    expect(r.statusCode).toBe(200);
    const list = await app.inject({ method: "GET", url: "/api/vault/demo/inbox" });
    const body = list.json() as { rejected: Array<{ rejectionReason?: string }> };
    expect(body.rejected.some((p) => p.rejectionReason === "stale context")).toBe(true);
    await app.close();
  });
});

describe("POST /api/vault/:alias/inbox/propose — auto-accept gate", () => {
  // The auto-accept gate is wired through the `createWithAutoAccept` helper.
  // We control the user pref via CAIRNDEX_HOME so the test never touches the
  // real ~/.cairndex/preferences.yaml. Each test sets/clears the threshold
  // via a fresh per-test home directory.
  function setHomeWithThreshold(value: number | null): string {
    const home = mkdtempSync(join(tmpdir(), "cairn-srv-inbox-pref-"));
    if (value !== null) {
      writeFileSync(
        join(home, "preferences.yaml"),
        `schemaVersion: 1\nautoAcceptConfidenceThreshold: ${value}\n`,
        "utf8",
      );
    }
    process.env.CAIRNDEX_HOME = home;
    return home;
  }

  it("returns autoAccepted: false and durable target NOT updated when threshold is unset", async () => {
    const home = setHomeWithThreshold(null);
    try {
      const app = await makeApp();
      const r = await postProposal(app);
      const body = r.json() as { proposalId: string; autoAccepted: boolean };
      expect(body.autoAccepted).toBe(false);
      // Durable spec body unchanged because no auto-accept fired.
      const specBody = readFileSync(join(tmp, ".cairndex/specs/SPEC-001.md"), "utf8");
      expect(specBody).toMatch(/old body/);
      await app.close();
    } finally {
      process.env.CAIRNDEX_HOME = undefined;
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("auto-accepts and updates the durable target when confidence ≥ threshold", async () => {
    const home = setHomeWithThreshold(0.4);
    try {
      const app = await makeApp();
      const r = await app.inject({
        method: "POST",
        url: "/api/vault/demo/inbox/propose",
        payload: {
          proposalType: "update",
          targetType: "spec",
          target: "SPEC-001",
          newBody: "shiny auto-accepted body\n",
          summary: "tighten via auto",
          reason: "high confidence",
          provenance: { createdBy: "agent", session: "s", confidence: 0.8 },
        },
      });
      const body = r.json() as {
        proposalId: string;
        autoAccepted: boolean;
        applied?: { action: string; targetId: string };
      };
      expect(body.autoAccepted).toBe(true);
      expect(body.applied?.action).toBe("updated");
      // Durable spec body now reflects the auto-accepted content.
      const specBody = readFileSync(join(tmp, ".cairndex/specs/SPEC-001.md"), "utf8");
      expect(specBody).toMatch(/shiny auto-accepted body/);
      await app.close();
    } finally {
      process.env.CAIRNDEX_HOME = undefined;
      rmSync(home, { recursive: true, force: true });
    }
  });
});
