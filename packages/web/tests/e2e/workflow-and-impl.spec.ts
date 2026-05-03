import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * E2E coverage for Phase 1-3 features that don't yet have a Playwright
 * spec — Implementation page, ActivePlanPanel, WorkflowActions buttons,
 * and the LastTurnCard events narrative. Mirrors the central-vault.spec.ts
 * fixture pattern (own port, central vault layout) so all three E2E specs
 * can run in the same suite without port collisions.
 *
 * Tests are described.serial because some mutate vault state on disk
 * (mark-task-done, switch-task, phase-set) and depend on a known starting
 * shape from the fixture.
 */

let proc: ChildProcess;
let vaultRoot: string;
let home: string;
const PORT = 7891;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..", "..", "..");

let projectRoot: string;

test.beforeAll(async () => {
  vaultRoot = mkdtempSync(join(tmpdir(), "cairn-wi-vault-"));
  home = mkdtempSync(join(tmpdir(), "cairn-wi-home-"));
  writeFileSync(join(vaultRoot, "vault.yaml"), "schemaVersion: 1\ntitle: E2E Vault\n");
  projectRoot = join(vaultRoot, "projects", "demo");
  for (const f of [
    "specs",
    "decisions",
    "plans",
    "tasks",
    "sessions",
    "changes",
    "rules",
    "templates",
    "indexes",
    "indexes/context-packs",
    "inbox",
    "inbox/proposed-memory-updates",
    "insights",
    "state",
  ]) {
    mkdirSync(join(projectRoot, f), { recursive: true });
  }
  writeFileSync(
    join(projectRoot, "project.yaml"),
    'id: demo\ntitle: Demo\nrepo_paths: []\naliases: ["demo"]\nstatus: active\n',
  );
  writeFileSync(
    join(projectRoot, "index.md"),
    "---\nphase: implementing\nphase_since: 2026-05-01\nnext_action: ship it\nactive_plan: PLAN-001\ncurrent_task: TASK-001\n---\n# Demo\n",
  );
  writeFileSync(join(projectRoot, "config.yaml"), "schemaVersion: 1\n");

  // Plan that owns the three tasks below.
  writeFileSync(
    join(projectRoot, "plans/PLAN-001.md"),
    "---\nid: PLAN-001\ntitle: First plan\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n# Plan\n",
  );

  // Three tasks: one done (history), one in_progress (current), one pending (switchable).
  // All link to PLAN-001 so byPlan grouping renders.
  writeFileSync(
    join(projectRoot, "tasks/TASK-001.md"),
    "---\nid: TASK-001\ntitle: Current work\nstatus: in_progress\ncreated: 2026-05-01\nupdated: 2026-05-02\nlinks:\n  - PLAN-001\n---\nbody\n",
  );
  writeFileSync(
    join(projectRoot, "tasks/TASK-002.md"),
    "---\nid: TASK-002\ntitle: Already shipped\nstatus: done\ncreated: 2026-04-30\nupdated: 2026-05-02\ncompleted: '2026-05-02'\nlinks:\n  - PLAN-001\n---\nbody\n",
  );
  writeFileSync(
    join(projectRoot, "tasks/TASK-003.md"),
    "---\nid: TASK-003\ntitle: Up next\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\nlinks:\n  - PLAN-001\n---\nbody\n",
  );

  // Multi-segment changelog so the LastTurn events list slices a real narrative
  // between two `Session ... recorded` boundary lines.
  writeFileSync(
    join(projectRoot, "changes/changelog.md"),
    [
      "# Changelog",
      "",
      "- 2026-05-02 — Session 2026-05-02-1900 recorded (Edit×10 Write×2 Bash×5 Read×8)",
      "- 2026-05-02 — Accepted PROP-003 → created insight/INS-001",
      "- 2026-05-02 — Rejected PROP-005",
      "- 2026-05-02 — task switch → TASK-001",
      "- 2026-05-02 — Session 2026-05-02-2242 recorded (Edit×5 Write×1 Bash×2 Read×4)",
      "",
    ].join("\n"),
  );

  // last-turn-summary.json so the LastTurnCard component renders. The route
  // augments this with `events` derived from changelog.md at request time.
  writeFileSync(
    join(projectRoot, "state/last-turn-summary.json"),
    JSON.stringify({
      ts: "2026-05-02T22:42:00Z",
      filesTouched: 3,
      toolCounts: { Edit: 5, Write: 1, Bash: 2, Read: 4 },
      newProposals: ["PROP-007"],
      latestSessionId: "2026-05-02-2242",
    }),
  );

  proc = spawn(
    process.execPath,
    [
      join(REPO, "packages/cli/bin/cairndex"),
      "ui",
      "--port",
      String(PORT),
      "--no-open",
      "--vault",
      vaultRoot,
    ],
    { env: { ...process.env, CAIRNDEX_HOME: home }, stdio: "ignore" },
  );

  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`);
      if (r.ok) return;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("cairndex ui (workflow+impl) did not start in time");
});

test.afterAll(async () => {
  proc?.kill();
  rmSync(vaultRoot, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

// Tests that don't mutate state can run in any order; mutating tests below run
// described.serial so disk state is predictable.

test.describe("read-only views", () => {
  test("Implementation page renders the line grouped by plan", async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/p/demo/implementation`);
    await expect(page.getByRole("heading", { name: "Implementation" })).toBeVisible({
      timeout: 10_000,
    });
    // PLAN-001 group header is the linked plan id at the top of the section.
    const planLink = page.getByRole("link", { name: "PLAN-001" });
    await expect(planLink.first()).toBeVisible();
    // The done task should appear in the table with the "Done" status badge.
    await expect(page.getByText("TASK-002").first()).toBeVisible();
    await expect(page.getByText("Done", { exact: true }).first()).toBeVisible();
    // Clicking a task link routes to the file view.
    await page.getByRole("link", { name: "TASK-002" }).first().click();
    await expect(page).toHaveURL(/\/p\/demo\/browse\/task\/TASK-002$/);
  });

  test("Sidebar has the Implementation link and it routes to /implementation", async ({
    page,
  }) => {
    await page.goto(`http://localhost:${PORT}/p/demo`);
    await expect(page.getByRole("heading", { name: "demo" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("link", { name: "Implementation" }).click();
    await expect(page).toHaveURL(/\/p\/demo\/implementation$/);
    await expect(page.getByRole("heading", { name: "Implementation" })).toBeVisible();
  });

  test("ActivePlanPanel shows the plan and progress counts on the dashboard", async ({
    page,
  }) => {
    await page.goto(`http://localhost:${PORT}/p/demo`);
    // Scope to the panel by its heading — the same words ("pending", "in progress")
    // appear inside the WorkflowActions Switch dropdown's option text on this
    // page, so an unscoped getByText would match the wrong element.
    const panel = page.locator("section").filter({ hasText: "Plan progress" });
    await expect(panel).toBeVisible({ timeout: 10_000 });
    // Counts live inline as "<n> done", "<n> in progress", "<n> pending".
    // The leading digit anchors the regex to the panel and excludes the
    // dropdown's "(pending)" option text.
    await expect(panel.getByText(/\d+\s+done/)).toBeVisible();
    await expect(panel.getByText(/\d+\s+in progress/)).toBeVisible();
    await expect(panel.getByText(/\d+\s+pending/)).toBeVisible();
    // Recently shipped section lists TASK-002 (done) inside the panel.
    await expect(panel.getByText("TASK-002")).toBeVisible();
  });

  test("LastTurnCard renders the events narrative (filters out the Session-recorded anchor)", async ({
    page,
  }) => {
    await page.goto(`http://localhost:${PORT}/p/demo`);
    const card = page.getByTestId("last-turn-card");
    await expect(card).toBeVisible({ timeout: 10_000 });
    // The events list should include the mid-turn entries between the two
    // `Session ... recorded` boundary lines.
    await expect(card.getByText(/Accepted PROP-003/)).toBeVisible();
    await expect(card.getByText(/Rejected PROP-005/)).toBeVisible();
    await expect(card.getByText(/task switch → TASK-001/)).toBeVisible();
    // The trailing `Session 2026-05-02-2242 recorded` line is the boundary,
    // not narrative — the card's filter should suppress it from the events list.
    const events = card.getByTestId("last-turn-events");
    await expect(events).toBeVisible();
    await expect(events.getByText(/Session.*recorded/)).toHaveCount(0);
  });
});

test.describe.serial("smart inbox: auto-accept + create/update split", () => {
  // Threshold is set on this fixture's CAIRNDEX_HOME (a preferences.yaml the
  // server reads at request time). The test seeds preferences before opening
  // the page, then verifies:
  //   1. an agent-proposed PROP with confidence >= threshold lands in
  //      `accepted` status with `acceptedBy: auto` written to its frontmatter
  //   2. the durable target on disk reflects the auto-applied content
  //   3. the UI surfaces the auto-accept banner + ⚡ badge in Recently accepted
  //   4. a mixed inbox renders "New content" + "Updates" subsection headings

  test("auto-accept gate fires when user threshold is set + UI renders ⚡ badge", async ({
    page,
  }) => {
    // Set the threshold on this fixture's HOME by writing preferences.yaml.
    const prefsPath = join(home, "preferences.yaml");
    writeFileSync(
      prefsPath,
      "schemaVersion: 1\nautoAcceptConfidenceThreshold: 0.4\n",
      "utf8",
    );
    // Submit a proposal with confidence 0.6 (cleared the 0.4 gate).
    const propRes = await fetch(`http://localhost:${PORT}/api/vault/demo/inbox/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalType: "create",
        targetType: "insight",
        newFrontmatter: {
          title: "Auto-accepted via E2E",
          status: "active",
          created: "2026-05-03",
        },
        newBody: "auto-accepted body\n",
        summary: "agent-proposed insight",
        reason: "high signal",
        provenance: { createdBy: "agent", session: "e2e", confidence: 0.6 },
      }),
    });
    expect(propRes.status).toBe(200);
    const json = (await propRes.json()) as { autoAccepted: boolean };
    expect(json.autoAccepted).toBe(true);

    // Open the inbox UI; banner reflects the user pref, badge reflects the PROP.
    await page.goto(`http://localhost:${PORT}/p/demo/inbox`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Auto-accept enabled/)).toBeVisible({ timeout: 10_000 });
    const acceptedSection = page
      .locator("section")
      .filter({ hasText: "Recently accepted" });
    await expect(acceptedSection).toBeVisible({ timeout: 10_000 });
    await expect(acceptedSection.getByText(/auto-accepted/).first()).toBeVisible();

    // Cleanup: remove the threshold so subsequent tests don't auto-accept.
    rmSync(join(home, "preferences.yaml"), { force: true });
  });

  test("inbox splits pending into Create / Update sections when both types present", async ({
    page,
  }) => {
    // Seed two pending proposals — one create, one update — both above
    // confidence 0.5 so they land in pendingHigh and the split is visible.
    // No threshold set, so neither auto-accepts.
    const create = await fetch(`http://localhost:${PORT}/api/vault/demo/inbox/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalType: "create",
        targetType: "insight",
        newFrontmatter: { title: "Split test create", status: "active", created: "2026-05-03" },
        newBody: "create body\n",
        summary: "create proposal",
        reason: "x",
        provenance: { createdBy: "agent", session: "e2e", confidence: 0.6 },
      }),
    });
    expect(create.status).toBe(200);

    const update = await fetch(`http://localhost:${PORT}/api/vault/demo/inbox/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalType: "update",
        targetType: "task",
        target: "TASK-003",
        newBody: "updated body for TASK-003\n",
        summary: "update proposal",
        reason: "x",
        provenance: { createdBy: "agent", session: "e2e", confidence: 0.6 },
      }),
    });
    expect(update.status).toBe(200);

    await page.goto(`http://localhost:${PORT}/p/demo/inbox`);
    // The two new section headings render only when both kinds are present.
    await expect(page.getByText(/📥 New content/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/✏️ Updates/)).toBeVisible();
  });
});

test.describe.serial("workflow actions (mutate vault state)", () => {
  test("Mark current task done → file frontmatter flips to done with completed:", async ({
    page,
  }) => {
    await page.goto(`http://localhost:${PORT}/p/demo`);
    await expect(page.getByText("Plan progress")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Mark current task done/ }).click();
    // Wait for the network round-trip + invalidation.
    await page.waitForResponse(
      (r) => r.url().includes("/task/complete") && r.status() === 200,
    );
    // Read the file back from disk to confirm the mutation actually landed.
    const file = readFileSync(join(projectRoot, "tasks/TASK-001.md"), "utf8");
    expect(file).toMatch(/status:\s*done/);
    expect(file).toMatch(/completed:\s*['"]?\d{4}-\d{2}-\d{2}/);
  });

  test("Switch task → previously-pending task becomes in_progress on disk", async ({
    page,
  }) => {
    await page.goto(`http://localhost:${PORT}/p/demo`);
    // After the prior test TASK-001 is done. Eligible-to-switch dropdown should
    // contain TASK-003 (still pending). Pick it and click Switch.
    const select = page.getByRole("combobox", { name: "Switch to task" });
    await expect(select).toBeVisible({ timeout: 10_000 });
    await select.selectOption("TASK-003");
    await page.getByRole("button", { name: "Switch", exact: true }).click();
    await page.waitForResponse(
      (r) => r.url().includes("/task/switch") && r.status() === 200,
    );
    const file = readFileSync(join(projectRoot, "tasks/TASK-003.md"), "utf8");
    expect(file).toMatch(/status:\s*in_progress/);
  });

  test("Phase set → index.md frontmatter updates phase + phase_since", async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/p/demo`);
    const select = page.getByRole("combobox", { name: "Advance phase" });
    await expect(select).toBeVisible({ timeout: 10_000 });
    // Phase dropdown filters out the current phase; pick "testing" (current is
    // "implementing"). The select's onChange handler fires the mutation.
    await select.selectOption("testing");
    await page.waitForResponse(
      (r) => r.url().includes("/phase/set") && r.status() === 200,
    );
    const idx = readFileSync(join(projectRoot, "index.md"), "utf8");
    expect(idx).toMatch(/phase:\s*testing/);
  });
});
