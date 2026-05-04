import PackPreview from "@/pages/PackPreview";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let originalFetch: typeof fetch;

const packPayload = {
  packId: "pack-fix-web-e2e-abc12345",
  path: "/tmp/pack.md",
  raw: "---\nid: pack-fix-web-e2e-abc12345\n---\nbody",
  body: "body",
  frontmatter: {
    id: "pack-fix-web-e2e-abc12345",
    type: "context-pack",
    task: "fix web e2e",
    builtAt: "2026-05-02T01:00:00Z",
    tokenEstimate: 6234,
    tokenBudget: 8000,
    trimmedItems: 0,
    items: [
      { id: "PROJECT-STATE", type: "project-state", reason: "project state" },
      { id: "SPEC-001", type: "spec", reason: "active spec" },
    ],
    warnings: [],
  },
};

const packListPayload = {
  packs: [
    {
      packId: "pack-fix-web-e2e-abc12345",
      task: "fix web e2e",
      builtAt: "2026-05-02T01:00:00Z",
      tokenEstimate: 6234,
      path: "/tmp/pack.md",
    },
  ],
};

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = typeof url === "string" ? url : url.toString();
    let body: unknown;
    if (u.includes("/pack/pack-")) body = packPayload;
    else if (u.endsWith("/packs")) body = packListPayload;
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

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/p/demo/pack/pack-fix-web-e2e-abc12345"]}>
        <Routes>
          <Route path="/p/:alias/pack/:packId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PackPreview (smoke)", () => {
  it("renders the compose box, token bar, and the linear-list-with-reasons items", async () => {
    const Wrapper = wrap();
    render(
      <Wrapper>
        <PackPreview />
      </Wrapper>,
    );
    expect(await screen.findByText("Context Pack")).toBeDefined();
    expect(await screen.findByText("Compose")).toBeDefined();
    expect(await screen.findByText("Build")).toBeDefined();
    expect(await screen.findByText(/Token estimate/)).toBeDefined();
    expect(await screen.findByText("Claude will read:")).toBeDefined();
    expect(await screen.findByText("PROJECT-STATE")).toBeDefined();
    expect(await screen.findByText("SPEC-001")).toBeDefined();
  });
});
