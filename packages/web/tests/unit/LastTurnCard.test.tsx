import { LastTurnCard } from "@/components/LastTurnCard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let originalFetch: typeof fetch;

interface SummaryFixture {
  ts: string;
  filesTouched: number;
  toolCounts: { Edit: number; Write: number; Bash: number; Read: number };
  newProposals: string[];
  latestSessionId: string | null;
  intent: {
    setAt: string;
    taskId: string | null;
    sessionId: string | null;
    steps: string[];
  } | null;
  events?: unknown[];
}

function makeSummary(overrides: Partial<SummaryFixture> = {}): SummaryFixture {
  return {
    ts: "2026-05-05T12:00:00.000Z",
    filesTouched: 3,
    toolCounts: { Edit: 5, Write: 2, Bash: 1, Read: 4 },
    newProposals: [],
    latestSessionId: "2026-05-05-1200",
    intent: null,
    events: [],
    ...overrides,
  };
}

function installFetch(payload: { summary: SummaryFixture | null }): void {
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = typeof url === "string" ? url : url.toString();
    if (u.endsWith("/last-turn-summary")) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function withProviders(children: ReactNode): ReactNode {
  // LastTurnCard reads via useQuery, so it needs a QueryClient. EventLine inside it
  // links to nodes via react-router, so a router context is also required.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe("LastTurnCard", () => {
  it("renders nothing when the server reports no summary", async () => {
    installFetch({ summary: null });
    const { container } = render(withProviders(<LastTurnCard alias="demo" />));
    // Wait one microtask cycle to let the query resolve.
    await waitFor(() => {
      expect(container.querySelector("[data-testid='last-turn-card']")).toBeNull();
    });
  });

  it("renders the metric line and session id without an intent block when intent is null", async () => {
    installFetch({ summary: makeSummary({ intent: null }) });
    render(withProviders(<LastTurnCard alias="demo" />));
    const card = await screen.findByTestId("last-turn-card");
    expect(card.textContent).toContain("3 files touched");
    // Total tool calls = 5 + 2 + 1 + 4 = 12.
    expect(card.textContent).toMatch(/12 tool calls/);
    expect(card.textContent).toContain("2026-05-05-1200");
    // No retrospective intent block when intent is null.
    expect(screen.queryByTestId("last-turn-intent")).toBeNull();
  });

  it("renders the retrospective intent block when intent has steps", async () => {
    installFetch({
      summary: makeSummary({
        intent: {
          setAt: "2026-05-05T11:55:00.000Z",
          taskId: "TASK-007",
          sessionId: null,
          steps: ["audit api.ts", "extract inbox hooks", "rerun tests"],
        },
      }),
    });
    render(withProviders(<LastTurnCard alias="demo" />));
    const intentBlock = await screen.findByTestId("last-turn-intent");
    expect(intentBlock).toBeDefined();
    expect(intentBlock.textContent).toContain("Intent for this turn");
    expect(intentBlock.textContent).toContain("audit api.ts");
    expect(intentBlock.textContent).toContain("rerun tests");
    // Numbered ordering preserved (the agent's contract is positional).
    expect(intentBlock.textContent).toMatch(/1\..*audit/);
    expect(intentBlock.textContent).toMatch(/3\..*rerun/);
  });

  it("hides the retrospective intent block when intent.steps is empty", async () => {
    // Edge case: a frontmatter-only intent file round-trips as `steps: []`. Showing
    // a header with zero items would be more confusing than hiding it; the metric
    // line above still tells the user what the turn did.
    installFetch({
      summary: makeSummary({
        intent: {
          setAt: "2026-05-05T11:55:00.000Z",
          taskId: null,
          sessionId: null,
          steps: [],
        },
      }),
    });
    render(withProviders(<LastTurnCard alias="demo" />));
    await screen.findByTestId("last-turn-card");
    expect(screen.queryByTestId("last-turn-intent")).toBeNull();
  });
});
