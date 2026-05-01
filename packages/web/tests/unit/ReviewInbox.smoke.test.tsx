import ReviewInbox from "@/pages/ReviewInbox";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let originalFetch: typeof fetch;

const inboxPayload = {
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

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (_url: string | URL | Request) => {
    return new Response(JSON.stringify(inboxPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
});
afterEach(() => {
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
});
