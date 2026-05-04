import Dashboard from "@/pages/Dashboard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let originalFetch: typeof fetch;

const projectsPayload = [{ path: "/p", alias: "demo", registered_at: "2026-05-02T00:00:00Z" }];

const dashboardPayload = {
  projectState: {
    phase: "implementing",
    phaseSince: "2026-04-30",
    activeGoal: { id: "GOAL-002", title: "Memory cockpit MVP", status: "active" },
    activeSpec: { id: "SPEC-003", title: "Memory cockpit", status: "active" },
    activePlan: {
      id: "PLAN-002",
      title: "Cockpit plan",
      status: "active",
      currentTaskId: "TASK-007",
    },
    currentTask: { id: "TASK-007", title: "Fix web e2e", status: "in_progress" },
    nextAction: "Run cairndex doctor --fix",
    warnings: [],
    generatedAt: "2026-05-02T00:00:00Z",
  },
  agentContext: {
    latestPack: {
      id: "pack-fix-web-e2e-abc12345",
      path: "/tmp/pack.md",
      builtAt: "2026-05-02T00:00:00Z",
    },
  },
  memoryHealth: {
    generatedAt: "2026-05-02T00:00:00Z",
    counts: { red: 1, yellow: 3, green: 12 },
    issues: [],
  },
  recentActivity: [{ date: "2026-05-02", summary: "SPEC-003 -> active" }],
};

const inboxPayload = {
  pending: [
    {
      proposalId: "PROP-001",
      path: "/p.md",
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      status: "pending",
      summary: "tighten",
      reason: "clarity",
      contentHash: "abc",
      createdAt: "2026-05-02",
      provenance: { createdBy: "claude", session: "s" },
      newBody: "x",
    },
  ],
  accepted: [],
  rejected: [],
  duplicate: [],
};

// jsdom doesn't ship EventSource; the Dashboard subscribes to /api/events via SSE so
// we install a no-op stub that satisfies the constructor without opening a connection.
class StubEventSource {
  url: string;
  readyState = 0;
  withCredentials = false;
  onopen: ((ev: Event) => unknown) | null = null;
  onmessage: ((ev: MessageEvent) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
  dispatchEvent() {
    return true;
  }
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
    StubEventSource as unknown as typeof EventSource;
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = typeof url === "string" ? url : url.toString();
    let body: unknown;
    if (u.endsWith("/api/projects")) body = projectsPayload;
    else if (u.endsWith("/dashboard")) body = dashboardPayload;
    else if (u.endsWith("/inbox")) body = inboxPayload;
    else if (u.endsWith("/doctor/demo")) body = { issues: [] };
    else if (u.endsWith("/implementation"))
      body = { generatedAt: "2026-05-02T00:00:00Z", entries: [], byPlan: {} };
    else if (u.endsWith("/last-turn-summary")) body = { summary: null };
    else if (u.endsWith("/api/vault/demo/task")) body = [];
    else body = {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function withRouting() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/p/demo"]}>
        <Routes>
          <Route path="/p/:alias" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Dashboard (smoke)", () => {
  it("renders the dashboard panels with humanized headlines (titles, not IDs)", async () => {
    const Wrapper = withRouting();
    render(
      <Wrapper>
        <Dashboard />
      </Wrapper>,
    );
    expect(await screen.findByText("Project State")).toBeDefined();
    // Agent Context is on the dashboard front door so stale/current context-pack
    // state is visible without asking the user to know about the Pack page.
    expect(await screen.findByText("Agent Context")).toBeDefined();
    expect(await screen.findByText("pack-fix-web-e2e-abc12345")).toBeDefined();
    // Memory Health panel renders only when red+yellow > 0 (this fixture has
    // red:1, yellow:3). The heading is now "Vault status" — humans don't
    // think of their project notes as "memory."
    expect(await screen.findByText("Vault status")).toBeDefined();
    expect(await screen.findByText("Recent Activity")).toBeDefined();
    expect(await screen.findByText("Review Inbox")).toBeDefined();
    // Phase + the active spec both appear. The spec now appears as its TITLE
    // ("Memory cockpit"), not its ID — IDs are link-target / tooltip only on
    // human surfaces. Verifying the title shows up in visible text confirms
    // the headline-vs-ID rule is in force in ProjectStatePanel.
    expect((await screen.findAllByText("implementing")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Memory cockpit")).length).toBeGreaterThan(0);
  });

  it("collapses Memory Health to a one-line badge when all green (no warnings/errors)", async () => {
    // Override the dashboard payload for this test only — counts all healthy.
    const greenPayload = {
      ...dashboardPayload,
      memoryHealth: {
        generatedAt: "2026-05-02T00:00:00Z",
        counts: { red: 0, yellow: 0, green: 32 },
        issues: [],
      },
    };
    const prevFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      let body: unknown;
      if (u.endsWith("/api/projects")) body = projectsPayload;
      else if (u.endsWith("/dashboard")) body = greenPayload;
      else if (u.endsWith("/inbox")) body = inboxPayload;
      else if (u.endsWith("/doctor/demo")) body = { issues: [] };
      else if (u.endsWith("/implementation"))
        body = { generatedAt: "2026-05-02T00:00:00Z", entries: [], byPlan: {} };
      else if (u.endsWith("/last-turn-summary")) body = { summary: null };
      else if (u.endsWith("/api/vault/demo/task")) body = [];
      else body = {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    try {
      const Wrapper = withRouting();
      render(
        <Wrapper>
          <Dashboard />
        </Wrapper>,
      );
      const badge = await screen.findByTestId("memory-health-badge");
      expect(badge).toBeDefined();
      expect(badge.textContent).toMatch(/Vault healthy/);
      expect(badge.textContent).toMatch(/32/);
      // The full-panel heading should NOT appear when collapsed.
      expect(screen.queryByText("Vault status")).toBeNull();
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it("renders the sticky Now bar with phase + current task + next action", async () => {
    const Wrapper = withRouting();
    render(
      <Wrapper>
        <Dashboard />
      </Wrapper>,
    );
    const nowBar = await screen.findByTestId("now-bar");
    expect(nowBar).toBeDefined();
    expect(nowBar.textContent).toContain("Now");
    expect(nowBar.textContent).toContain("implementing");
    expect(nowBar.textContent).toContain("TASK-007");
  });
});
