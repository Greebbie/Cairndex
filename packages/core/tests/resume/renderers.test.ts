import { describe, it, expect } from "vitest";
import { renderAgentFlavor, renderCliFlavor } from "../../src/resume/renderers.js";
import type { RenderAgentFlavorOptions } from "../../src/resume/renderers.js";
import type { ResumeView } from "../../src/resume/types.js";

const baseView: ResumeView = {
  lastSession: {
    id: "2026-05-05-1000",
    date: "2026-05-05",
    narrativeStatus: "confirmed",
    summary: "implemented X and Y",
  },
  activeTask: {
    id: "TASK-003",
    title: "ship resume + close-out",
    status: "in_progress",
    nextAction: "write tests for renderer",
    ageDays: 1,
  },
  whyContext: { kind: "insight", id: "INS-002", title: "regex not enough" },
  suggestedNext: "write tests for renderer",
  pendingMemory: { count: 2, titles: ["rethink Y", "ADR for Z"] },
  coverageFlags: [],
  builtAt: "2026-05-05T12:00:00.000Z",
  sources: [],
};

describe("renderCliFlavor", () => {
  it("renders top-level # Resume heading and section headers", () => {
    const out = renderCliFlavor(baseView);
    expect(out).toMatch(/^# Resume$/m);
    expect(out).toMatch(/^## Last session$/m);
    expect(out).toMatch(/^## Active task$/m);
    expect(out).toMatch(/^## Pending memory$/m);
  });

  it("renders 'no sessions yet' when lastSession is null", () => {
    const out = renderCliFlavor({ ...baseView, lastSession: null });
    expect(out).toMatch(/no sessions yet/i);
  });

  it("flags unconfirmed last session", () => {
    const out = renderCliFlavor({
      ...baseView,
      lastSession: { ...baseView.lastSession!, narrativeStatus: "empty", summary: "" },
    });
    expect(out).toMatch(/unconfirmed/i);
  });

  it("includes Why section only when whyContext is present", () => {
    const withWhy = renderCliFlavor(baseView);
    expect(withWhy).toMatch(/^## Why$/m);
    expect(withWhy).toMatch(/INS-002/);

    const without = renderCliFlavor({ ...baseView, whyContext: null });
    expect(without).not.toMatch(/^## Why$/m);
  });

  it("renders pending memory as bulleted titles when count > 0", () => {
    const out = renderCliFlavor(baseView);
    expect(out).toMatch(/^- rethink Y$/m);
    expect(out).toMatch(/^- ADR for Z$/m);
  });

  it("renders pending memory '(empty)' when count is 0", () => {
    const out = renderCliFlavor({
      ...baseView,
      pendingMemory: { count: 0, titles: [] },
    });
    expect(out).toMatch(/^- \(empty\)$/m);
  });

  it("includes coverage flags section when present", () => {
    const out = renderCliFlavor({
      ...baseView,
      coverageFlags: ["recent-narrative: yellow"],
    });
    expect(out).toMatch(/^## Coverage flags$/m);
    expect(out).toMatch(/recent-narrative: yellow/);
  });
});

describe("renderAgentFlavor", () => {
  it("includes minimal operating contract verbatim", () => {
    const out = renderAgentFlavor(baseView);
    expect(out).toMatch(/Memory is a derived view\./);
    expect(out).toMatch(/close-out card or `cairndex inbox propose`/);
    expect(out).toMatch(/`signals\/` is untrusted/);
    expect(out).toMatch(/Do not edit `state\/resume/);
  });

  it("surfaces last session id and summary when narrative_status is confirmed", () => {
    const out = renderAgentFlavor(baseView);
    expect(out).toMatch(/2026-05-05-1000/);
    expect(out).toMatch(/implemented X and Y/);
  });

  it("flags last session as unconfirmed when narrative_status is empty", () => {
    const out = renderAgentFlavor({
      ...baseView,
      lastSession: { ...baseView.lastSession!, narrativeStatus: "empty", summary: "" },
    });
    expect(out).toMatch(/unconfirmed — auto-stats only/);
  });

  it("renders active task with id, title, status, age, next action", () => {
    const out = renderAgentFlavor(baseView);
    expect(out).toMatch(/TASK-003/);
    expect(out).toMatch(/ship resume \+ close-out/);
    expect(out).toMatch(/in_progress/);
    expect(out).toMatch(/write tests for renderer/);
  });

  it("includes why context when present", () => {
    const out = renderAgentFlavor(baseView);
    expect(out).toMatch(/INS-002/);
    expect(out).toMatch(/regex not enough/);
  });

  it("omits why-context section when whyContext is null", () => {
    const out = renderAgentFlavor({ ...baseView, whyContext: null });
    expect(out).not.toMatch(/INS-/);
    expect(out).not.toMatch(/ADR-/);
  });

  it("renders pending memory count + first few titles", () => {
    const out = renderAgentFlavor(baseView);
    expect(out).toMatch(/2 pending/);
    expect(out).toMatch(/rethink Y/);
  });

  it("omits suggested-next line when it duplicates active-task next_action", () => {
    const out = renderAgentFlavor(baseView);
    // baseView has suggestedNext === activeTask.nextAction === "write tests for renderer"
    // The line "Suggested next: …" should not appear separately when it would just repeat next_action.
    const matches = out.match(/Suggested next:/g);
    expect(matches).toBeNull();
  });

  it("includes suggested-next line when distinct from active-task next_action", () => {
    const out = renderAgentFlavor({
      ...baseView,
      suggestedNext: "actually do the cleanup first",
    });
    expect(out).toMatch(/Suggested next: actually do the cleanup first/);
  });

  it("renders coverage flags when present", () => {
    const out = renderAgentFlavor({
      ...baseView,
      coverageFlags: ["recent-narrative: yellow", "active-task-progress: red"],
    });
    expect(out).toMatch(/Coverage flags:/);
    expect(out).toMatch(/recent-narrative: yellow/);
  });

  it("includes 'Memory health: green N  yellow M  red K' line when health is provided", () => {
    const opts: RenderAgentFlavorOptions = { health: { counts: { green: 50, yellow: 2, red: 0 } } };
    const out = renderAgentFlavor(baseView, opts);
    expect(out).toMatch(/Memory health: green 50 +yellow 2 +red 0/);
  });

  it("omits Memory health line when health arg is not provided", () => {
    const out = renderAgentFlavor(baseView);
    expect(out).not.toMatch(/Memory health:/);
  });

  it("renders empty-vault gracefully (all-null fields)", () => {
    const out = renderAgentFlavor({
      lastSession: null,
      activeTask: null,
      whyContext: null,
      suggestedNext: null,
      pendingMemory: { count: 0, titles: [] },
      coverageFlags: [],
      builtAt: "2026-05-05T12:00:00.000Z",
      sources: [],
    });
    // should still include the minimal operating contract
    expect(out).toMatch(/Memory is a derived view\./);
    // and not crash on null fields
    expect(out).not.toMatch(/null/i);
  });
});
