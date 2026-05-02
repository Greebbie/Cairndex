import { ProposalDiff } from "@/components/inbox/ProposalDiff";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanup();
});

describe("ProposalDiff", () => {
  it("renders + and - markers for small bodies", () => {
    const current = `alpha\nbeta\n`;
    const next = `alpha\ngamma\n`;
    render(<ProposalDiff currentBody={current} newBody={next} />);
    // Small body diff produces both removed (-) and added (+) lines.
    expect(screen.getByText(/-\s*beta/)).toBeDefined();
    expect(screen.getByText(/\+\s*gamma/)).toBeDefined();
  });

  it("renders a fallback when the combined diff exceeds the size guard", () => {
    // Combined > 100KB → guard kicks in.
    const big = "x".repeat(60_000);
    render(<ProposalDiff currentBody={big} newBody={big + "diff"} />);
    expect(screen.getByText(/too large to render inline/i)).toBeDefined();
    // The diff body itself must not be rendered.
    expect(screen.queryByText(/\+\s*x{10,}/)).toBeNull();
    expect(screen.queryByText(/-\s*x{10,}/)).toBeNull();
  });
});
