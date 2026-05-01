import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjects } from "../../src/lib/api.js";

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

describe("api hooks", () => {
  it("useProjects returns parsed list", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify([{ path: "/p", alias: "a", registered_at: "2026-04-30T00:00:00Z" }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useProjects(), { wrapper: withClient() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.alias).toBe("a");
  });

  it("useProjects rejects malformed payloads via zod", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify([{ wrong: "shape" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useProjects(), { wrapper: withClient() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
