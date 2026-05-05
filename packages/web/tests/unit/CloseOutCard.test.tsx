import { CloseOutCard } from "@/components/cockpit/CloseOutCard";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloseOutAnswers } from "@/lib/types";

afterEach(() => cleanup());

const sampleDraft: CloseOutAnswers = {
  didFinish: "Session activity: 3 file edits, 1 new file.",
  decisionOrLearning: "",
  nextStep: "write tests for renderer",
};

describe("CloseOutCard", () => {
  it("renders three labeled textareas pre-filled from draft", () => {
    render(
      <CloseOutCard
        sessionId="2026-05-05-1200"
        draft={sampleDraft}
        onSubmit={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    const finished = screen.getByLabelText(/finish|did|done/i) as HTMLTextAreaElement;
    const decision = screen.getByLabelText(/decision|learning|insight/i) as HTMLTextAreaElement;
    const next = screen.getByLabelText(/next/i) as HTMLTextAreaElement;
    expect(finished.value).toBe("Session activity: 3 file edits, 1 new file.");
    expect(decision.value).toBe("");
    expect(next.value).toBe("write tests for renderer");
  });

  it("Confirm calls onSubmit with the current values (after edits)", () => {
    const onSubmit = vi.fn();
    render(
      <CloseOutCard
        sessionId="2026-05-05-1200"
        draft={sampleDraft}
        onSubmit={onSubmit}
        onSkip={vi.fn()}
      />,
    );
    const finished = screen.getByLabelText(/finish|did|done/i) as HTMLTextAreaElement;
    fireEvent.change(finished, { target: { value: "actually shipped Y" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      didFinish: "actually shipped Y",
      decisionOrLearning: "",
      nextStep: "write tests for renderer",
    });
  });

  it("Skip calls onSkip without invoking onSubmit", () => {
    const onSubmit = vi.fn();
    const onSkip = vi.fn();
    render(
      <CloseOutCard
        sessionId="2026-05-05-1200"
        draft={sampleDraft}
        onSubmit={onSubmit}
        onSkip={onSkip}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("displays the sessionId for context (so the user knows what they are closing out)", () => {
    render(
      <CloseOutCard
        sessionId="2026-05-05-1200"
        draft={sampleDraft}
        onSubmit={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText(/2026-05-05-1200/)).toBeDefined();
  });

  it("disables Confirm + Skip while submitting=true", () => {
    render(
      <CloseOutCard
        sessionId="2026-05-05-1200"
        draft={sampleDraft}
        onSubmit={vi.fn()}
        onSkip={vi.fn()}
        submitting={true}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: /confirm/i }) as HTMLButtonElement;
    const skipBtn = screen.getByRole("button", { name: /skip/i }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    expect(skipBtn.disabled).toBe(true);
  });

  it("shows a hint that Q2 is optional and creates a memory proposal when filled", () => {
    render(
      <CloseOutCard
        sessionId="2026-05-05-1200"
        draft={sampleDraft}
        onSubmit={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    // The label itself says "optional" and the hint says "will create a pending inbox proposal"
    const text = document.body.textContent ?? "";
    expect(text.toLowerCase()).toMatch(/optional|leave blank|will create|propose/);
  });
});
