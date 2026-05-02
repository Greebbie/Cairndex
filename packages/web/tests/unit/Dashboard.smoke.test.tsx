import Dashboard from "@/pages/Dashboard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
    else body = {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
});
afterEach(() => {
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
  it("renders all four panels (Project State / Agent Context / Memory Health / Activity) and the Inbox panel", async () => {
    const Wrapper = withRouting();
    render(
      <Wrapper>
        <Dashboard />
      </Wrapper>,
    );
    expect(await screen.findByText("Project State")).toBeDefined();
    expect(await screen.findByText("Agent Context")).toBeDefined();
    expect(await screen.findByText("Memory Health")).toBeDefined();
    expect(await screen.findByText("Recent Activity")).toBeDefined();
    expect(await screen.findByText("Review Inbox")).toBeDefined();
    expect(await screen.findByText("Phase")).toBeDefined();
    // Phase + active spec now appear in both the sticky NowBar and the ProjectStatePanel —
    // either one matching is enough to confirm the data flowed through.
    expect((await screen.findAllByText("implementing")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("SPEC-003")).length).toBeGreaterThan(0);
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
