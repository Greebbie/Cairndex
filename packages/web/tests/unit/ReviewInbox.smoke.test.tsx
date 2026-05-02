import ReviewInbox from "@/pages/ReviewInbox";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let originalFetch: typeof fetch;

const defaultInboxPayload = {
  pending: [
    {
      proposalId: "PROP-001",
      path: "/p.md",
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      status: "pending",
      summary: "Tighten the language",
      reason: "User asked for clearer wording",
      contentHash: "abc",
      createdAt: "2026-05-02",
      provenance: { createdBy: "claude", session: "2026-05-02-1500" },
      newBody: "new body content",
    },
  ],
  accepted: [],
  rejected: [],
  duplicate: [],
};

let currentInboxPayload: unknown = defaultInboxPayload;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  currentInboxPayload = defaultInboxPayload;
  globalThis.fetch = vi.fn(async (_url: string | URL | Request) => {
    return new Response(JSON.stringify(currentInboxPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/p/demo/inbox"]}>
        <Routes>
          <Route path="/p/:alias/inbox" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ReviewInbox (smoke)", () => {
  it("renders the pending proposal with id, summary, and Accept/Reject buttons", async () => {
    const Wrapper = wrap();
    render(
      <Wrapper>
        <ReviewInbox />
      </Wrapper>,
    );
    expect(await screen.findByText("Review Inbox")).toBeDefined();
    expect(await screen.findByText("PROP-001")).toBeDefined();
    expect(await screen.findByText("Tighten the language")).toBeDefined();
    expect(await screen.findByText("Accept")).toBeDefined();
    expect(await screen.findByText("Reject")).toBeDefined();
  });

  it("renders patch-mode proposals as labeled section ops, not a single body blob", async () => {
    currentInboxPayload = {
      pending: [
        {
          proposalId: "PROP-002",
          path: "/p2.md",
          proposalType: "update",
          targetType: "spec",
          target: "SPEC-001",
          status: "pending",
          summary: "log entry",
          reason: "audit",
          contentHash: "h2",
          createdAt: "2026-05-02",
          provenance: { createdBy: "claude", session: "s" },
          newBody: "snapshot",
          patch: [
            {
              kind: "append-section",
              section: "## History",
              content: "- 2026-05-02: tightened\n",
            },
          ],
        },
      ],
      accepted: [],
      rejected: [],
      duplicate: [],
    };

    const Wrapper = wrap();
    render(
      <Wrapper>
        <ReviewInbox />
      </Wrapper>,
    );

    expect(await screen.findByText("PROP-002")).toBeDefined();
    const toggle = await screen.findByText("View proposed body");
    fireEvent.click(toggle);

    expect(await screen.findByText(/Append to/)).toBeDefined();
    expect(await screen.findByText(/## History/)).toBeDefined();
    expect(await screen.findByText(/2026-05-02: tightened/)).toBeDefined();
  });
});
