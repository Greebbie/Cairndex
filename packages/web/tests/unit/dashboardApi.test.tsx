import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboard } from "../../src/lib/api.js";

let originalFetch: typeof fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function withClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const goodPayload = {
  projectState: {
    phase: "implementing",
    phaseSince: "2026-04-30",
    activeGoal: null,
    activeSpec: { id: "SPEC-001", title: "Cockpit", status: "active" },
    activePlan: null,
    currentTask: null,
    nextAction: "do thing",
    warnings: [],
    generatedAt: "2026-05-02T00:00:00.000Z",
  },
  agentContext: { latestPack: null },
  memoryHealth: {
    generatedAt: "2026-05-02T00:00:00.000Z",
    counts: { red: 0, yellow: 0, green: 1 },
    issues: [],
  },
  recentActivity: [{ date: "2026-05-02", summary: "init" }],
};

describe("useDashboard", () => {
  it("returns parsed dashboard payload", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(goodPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useDashboard("demo"), { wrapper: withClient() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.projectState.phase).toBe("implementing");
    expect(result.current.data?.memoryHealth.counts.green).toBe(1);
  });

  it("rejects malformed dashboard payload via zod", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ wrong: "shape" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useDashboard("demo"), { wrapper: withClient() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
