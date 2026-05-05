import { IntentBar } from "@/components/cockpit/IntentBar";
import type { Intent } from "@/lib/types";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => cleanup());

function withRouter(children: React.ReactNode): React.ReactElement {
  // IntentBar renders a Link to the active task when `intent.taskId` is set, so the
  // component must run inside a router context even for the empty-state branch (the
  // empty branch never reaches Link, but importing IntentBar pulls react-router).
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("IntentBar", () => {
  it("renders an empty-state banner when intent is null", () => {
    render(withRouter(<IntentBar alias="demo" intent={null} />));
    const empty = screen.getByTestId("intent-bar-empty");
    expect(empty).toBeDefined();
    expect(empty.textContent).toMatch(/no pre-flight intent/i);
    // The populated bar must NOT also be rendered.
    expect(screen.queryByTestId("intent-bar")).toBeNull();
  });

  it("renders an empty-state banner when intent.steps is empty", () => {
    // Defensive: a frontmatter-only file (no bullets) round-trips as `steps: []`.
    // The bar should treat that the same as "no intent" — otherwise the user sees
    // a populated header with zero steps, which is worse than the explicit empty.
    const intent: Intent = {
      setAt: "2026-05-05T12:00:00.000Z",
      taskId: null,
      sessionId: null,
      steps: [],
    };
    render(withRouter(<IntentBar alias="demo" intent={intent} />));
    expect(screen.getByTestId("intent-bar-empty")).toBeDefined();
    expect(screen.queryByTestId("intent-bar")).toBeNull();
  });

  it("renders the populated bar with numbered steps and the set-time hint", () => {
    const intent: Intent = {
      setAt: "2026-05-05T12:00:00.000Z",
      taskId: null,
      sessionId: null,
      steps: ["audit api.ts", "extract inbox hooks", "rerun tests"],
    };
    render(withRouter(<IntentBar alias="demo" intent={intent} />));
    const bar = screen.getByTestId("intent-bar");
    expect(bar).toBeDefined();
    expect(bar.textContent).toContain("audit api.ts");
    expect(bar.textContent).toContain("extract inbox hooks");
    expect(bar.textContent).toContain("rerun tests");
    // Each step is prefixed with `${i+1}.` — verify the numbering renders.
    expect(bar.textContent).toMatch(/1\..*audit/);
    expect(bar.textContent).toMatch(/3\..*rerun/);
    // The interrupt-hint copy is what makes the contract actionable for the user.
    expect(bar.textContent).toMatch(/interrupt the agent/i);
  });

  it("links to the active task when taskId is present", () => {
    const intent: Intent = {
      setAt: "2026-05-05T12:00:00.000Z",
      taskId: "TASK-007",
      sessionId: null,
      steps: ["ship it"],
    };
    render(withRouter(<IntentBar alias="demo" intent={intent} />));
    // The taskId surfaces as a Link with mono styling — the cockpit's link-target
    // convention (titles for headlines, IDs only as links / tooltips).
    const link = screen.getByText("TASK-007");
    expect(link).toBeDefined();
    expect(link.tagName.toLowerCase()).toBe("a");
    expect((link as HTMLAnchorElement).getAttribute("href")).toMatch(/TASK-007/);
  });

  it("does not render a task link when taskId is null", () => {
    const intent: Intent = {
      setAt: "2026-05-05T12:00:00.000Z",
      taskId: null,
      sessionId: null,
      steps: ["ship it"],
    };
    render(withRouter(<IntentBar alias="demo" intent={intent} />));
    expect(screen.queryByText(/TASK-/)).toBeNull();
  });
});
