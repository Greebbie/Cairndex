import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

let proc: ChildProcess;
let tmp: string;
let home: string;
const PORT = 7889;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..", "..", "..");

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-e2e-"));
  home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  const v = join(tmp, ".cairndex");
  for (const f of ["specs", "decisions", "changes", "rules", "templates"]) {
    mkdirSync(join(v, f), { recursive: true });
  }
  writeFileSync(
    join(v, "index.md"),
    "---\nphase: implementing\nnext_action: ship it\nactive_spec: SPEC-001\n---\n# Index\n",
  );
  writeFileSync(
    join(v, "specs/SPEC-001-x.md"),
    "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n## Body\nbody\n",
  );
  writeFileSync(
    join(v, "decisions/ADR-001-x.md"),
    "---\nid: ADR-001\ntitle: Use SPEC-001\nstatus: accepted\ncreated: 2026-04-30\nupdated: 2026-04-30\nlinks:\n  - type: implements\n    target: SPEC-001\n---\n## Decision\nImplement SPEC-001.\n",
  );
  writeFileSync(
    join(v, "changes/changelog.md"),
    "# Changelog\n\n- 2026-04-30 — initialized\n- 2026-04-30 — SPEC-001 added\n",
  );
  writeFileSync(join(v, "config.yaml"), "schemaVersion: 1\n");
  mkdirSync(home, { recursive: true });
  writeFileSync(
    join(home, "projects.json"),
    JSON.stringify(
      { projects: [{ path: tmp, alias: "e2e", registered_at: "2026-04-30T00:00:00Z" }] },
      null,
      2,
    ),
  );

  proc = spawn(
    process.execPath,
    [join(REPO, "packages/cli/bin/cairndex"), "ui", "--port", String(PORT), "--no-open"],
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
  throw new Error("cairndex ui did not start in time");
});

test.afterAll(async () => {
  proc?.kill();
  rmSync(tmp, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test("loads dashboard for the registered project", async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/p/e2e`);
  await expect(page.getByRole("heading", { name: "e2e" })).toBeVisible({ timeout: 10_000 });
  // "implementing" appears in both the NowBar pill and the ProjectStatePanel dd —
  // either match is sufficient evidence the value flowed through.
  await expect(page.getByText("implementing").first()).toBeVisible();
  await expect(page.getByText("ship it").first()).toBeVisible();
});

test("navigates to browse", async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/p/e2e/browse`);
  await expect(page.getByRole("heading", { name: "Browse" })).toBeVisible();
  await expect(page.getByText("spec/")).toBeVisible();
});

test("shows the file view with body and frontmatter", async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/p/e2e/browse/spec/SPEC-001`);
  await expect(page.getByText("body", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("SPEC-001")).toBeVisible();
});

// ── Test 1: Timeline ─────────────────────────────────────────────────────────

test("timeline lists changelog events", async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/p/e2e/timeline`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("initialized")).toBeVisible();
  await expect(page.getByText("SPEC-001 added")).toBeVisible();
});

// ── Test 2: Doctor badge ──────────────────────────────────────────────────────

test("dashboard doctor badge shows verification error count", async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/p/e2e`);
  // The badge renders "1 error" (singular) for one verification-bound issue from ADR-001.
  // Memory Health panel also says "{red} error" so we use exact-match + first()
  // to avoid the strict-mode duplicate against e.g. "0 error" on the panel.
  await expect(page.getByText("1 error", { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });
});

// ── Test 3: BrowseList ────────────────────────────────────────────────────────

test("browse → spec/ shows the per-type listing", async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/p/e2e/browse`);
  // spec/ is now a collapsible button; clicking expands the group inline (no URL change)
  await page.getByRole("button", { name: /spec\// }).click();
  await expect(page.getByRole("link", { name: /SPEC-001/ })).toBeVisible();
  // clicking the spec id navigates into the file view
  await page.getByRole("link", { name: /SPEC-001/ }).click();
  await expect(page).toHaveURL(/\/p\/e2e\/browse\/spec\/SPEC-001$/);
  await expect(page.getByText("body", { exact: true })).toBeVisible({ timeout: 10_000 });
});

// ── Test 3b: Dashboard active spec link opens the file view ───────────────────

test("dashboard active-spec link opens the file view (no broken plural route)", async ({
  page,
}) => {
  await page.goto(`http://localhost:${PORT}/p/e2e`);
  await expect(page.getByText("implementing").first()).toBeVisible({ timeout: 10_000 });
  // ProjectStatePanel renders SPEC-001 as a Link; clicking it must land on
  // /browse/spec/SPEC-001 (singular type), not /browse/specs/... which the
  // server does not accept.
  await page.getByRole("link", { name: "SPEC-001" }).first().click();
  await expect(page).toHaveURL(/\/p\/e2e\/browse\/spec\/SPEC-001$/);
  await expect(page.getByText("body", { exact: true })).toBeVisible({ timeout: 10_000 });
});

// ── Test 4: Settings save round-trip ─────────────────────────────────────────

test("settings page saves edited config", async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/p/e2e/settings`);
  // The raw-JSON textarea now lives inside a collapsed <details> labelled
  // "Advanced (raw JSON)" — open it before interacting.
  await page.getByText("Advanced (raw JSON)").click();
  const ta = page.locator("textarea");
  await expect(ta).toBeVisible();
  await expect(ta).toHaveValue(/schemaVersion/, { timeout: 10_000 });
  await ta.fill('{\n  "schemaVersion": 1,\n  "freshness_warn_days": 60\n}');
  await page.getByRole("button", { name: "Save raw JSON" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });

  const configOnDisk = readFileSync(join(tmp, ".cairndex/config.yaml"), "utf8");
  expect(configOnDisk).toContain("freshness_warn_days: 60");
});

// ── Test 5: SSE invalidation ──────────────────────────────────────────────────

test("SSE invalidation updates browse counts when a file appears", async ({ page }) => {
  // The Browse page now owns per-type counts (Dashboard cockpit panels do not).
  // Each type group is a <button> whose accessible name includes "<type>/" plus
  // the count digit, e.g. "▸ spec/ 1".
  await page.goto(`http://localhost:${PORT}/p/e2e/browse`);
  await expect(page.getByRole("button", { name: /spec\/.*\b1\b/ })).toBeVisible({
    timeout: 10_000,
  });

  writeFileSync(
    join(tmp, ".cairndex/specs/SPEC-002-y.md"),
    "---\nid: SPEC-002\ntitle: Y\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\nbody\n",
  );

  // watcher debounce is 250ms; SSE hub broadcasts; query invalidates; UI re-fetches.
  await expect(page.getByRole("button", { name: /spec\/.*\b2\b/ })).toBeVisible({
    timeout: 8_000,
  });
});
