import { ResumeCard } from "@/components/cockpit/ResumeCard";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ResumeView } from "@/lib/types";

afterEach(() => cleanup());

const baseView: ResumeView = {
  lastSession: {
    id: "2026-05-05-1000",
    date: "2026-05-05",
    narrativeStatus: "confirmed",
    summary: "did X",
  },
  activeTask: {
    id: "TASK-007",
    title: "ship resume + close-out",
    status: "in_progress",
    nextAction: "write tests",
    ageDays: 1,
  },
  whyContext: { kind: "insight", id: "INS-002", title: "regex not enough" },
  suggestedNext: "write tests",
  pendingMemory: { count: 2, titles: ["rethink Y", "ADR for Z"] },
  coverageFlags: [],
  builtAt: "2026-05-05T12:00:00Z",
  sources: [],
};

describe("ResumeCard", () => {
  it("renders the active task title prominently (title is headline, ID is secondary)", () => {
    render(<ResumeCard view={baseView} />);
    // getByText throws if not found — toBeDefined() confirms presence
    expect(screen.getByText(/ship resume \+ close-out/)).toBeDefined();
    // TASK-007 should also be visible somewhere (tooltip or secondary line)
    expect(screen.getByText(/TASK-007/)).toBeDefined();
  });

  it("renders the last session id and summary", () => {
    render(<ResumeCard view={baseView} />);
    expect(screen.getByText(/2026-05-05-1000/)).toBeDefined();
    expect(screen.getByText(/did X/)).toBeDefined();
  });

  it("flags last session as unconfirmed when narrativeStatus is empty", () => {
    render(
      <ResumeCard
        view={{
          ...baseView,
          lastSession: {
            ...baseView.lastSession!,
            narrativeStatus: "empty",
            summary: "",
          },
        }}
      />,
    );
    expect(screen.getByText(/unconfirmed/i)).toBeDefined();
  });

  it("renders the why context with title prominent", () => {
    render(<ResumeCard view={baseView} />);
    expect(screen.getByText(/regex not enough/)).toBeDefined();
  });

  it("omits the why section when whyContext is null", () => {
    const { container } = render(<ResumeCard view={{ ...baseView, whyContext: null }} />);
    expect(container.textContent).not.toMatch(/regex not enough/);
    expect(container.textContent).not.toMatch(/INS-002/);
  });

  it("shows pending memory count", () => {
    render(<ResumeCard view={baseView} />);
    expect(screen.getByText(/2 pending/i)).toBeDefined();
  });

  it("shows '0 pending' (or equivalent empty state) when pendingMemory.count is 0", () => {
    render(
      <ResumeCard view={{ ...baseView, pendingMemory: { count: 0, titles: [] } }} />,
    );
    // accept "0 pending", "no pending", or similar
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/0 pending|no pending/i);
  });

  it("shows next action when present and distinct from suggestedNext", () => {
    render(<ResumeCard view={baseView} />);
    expect(screen.getByText(/write tests/)).toBeDefined();
  });

  it("renders empty-state placeholder when view has no last session and no active task", () => {
    render(
      <ResumeCard
        view={{
          lastSession: null,
          activeTask: null,
          whyContext: null,
          suggestedNext: null,
          pendingMemory: { count: 0, titles: [] },
          coverageFlags: [],
          builtAt: "2026-05-05T12:00:00Z",
          sources: [],
        }}
      />,
    );
    // Should render SOMETHING reasonable — not crash, not show literal "null"
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/null|undefined/i);
  });

  it("renders coverage flags when present", () => {
    render(
      <ResumeCard
        view={{ ...baseView, coverageFlags: ["recent-narrative: yellow"] }}
      />,
    );
    expect(screen.getByText(/recent-narrative/i)).toBeDefined();
  });
});
