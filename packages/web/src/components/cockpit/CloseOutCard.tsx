import { useState } from "react";
import type { CloseOutAnswers } from "@/lib/types";

export interface CloseOutCardProps {
  /** The session being closed out — shown as context so the user knows what they're confirming. */
  sessionId: string;
  /** Pre-filled answers from the server's draft heuristics. May be empty strings; the user can type from scratch. */
  draft: CloseOutAnswers;
  /** Called with the final edited answers when the user clicks Confirm. */
  onSubmit: (answers: CloseOutAnswers) => void;
  /** Called when the user clicks Skip — does not invoke onSubmit. */
  onSkip: () => void;
  /** When true, both buttons are disabled and Confirm shows "Submitting…". */
  submitting?: boolean;
}

/**
 * CloseOutCard — prompts the user to confirm what the session actually accomplished
 * before closing it out. Three questions mirror the core CloseOutAnswers schema:
 *   1. What did the session finish?  (prefilled from last-turn summary)
 *   2. Any decision or learning worth keeping?  (optional; creates an inbox proposal)
 *   3. Where should the next session pick up?  (prefilled from active task next-action)
 *
 * The component is purely presentational: prefill comes in via `draft`, submit goes
 * out via `onSubmit`. Query/mutation wiring lives in the parent (Dashboard Task 4.5).
 */
export function CloseOutCard({
  sessionId,
  draft,
  onSubmit,
  onSkip,
  submitting = false,
}: CloseOutCardProps) {
  const [didFinish, setDidFinish] = useState(draft.didFinish);
  const [decisionOrLearning, setDecisionOrLearning] = useState(
    draft.decisionOrLearning,
  );
  const [nextStep, setNextStep] = useState(draft.nextStep);

  const handleConfirm = () => {
    onSubmit({ didFinish, decisionOrLearning, nextStep });
  };

  return (
    <section
      aria-label="Close out last session"
      className="rounded border bg-card text-card-foreground p-4 space-y-4"
    >
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Close out last session
        </h2>
        <div className="font-mono text-xs text-muted-foreground">{sessionId}</div>
      </header>

      <div className="space-y-3">
        <Field
          label="What did this session actually finish?"
          id="closeout-did-finish"
          value={didFinish}
          onChange={setDidFinish}
        />

        <Field
          label="Any decision or learning worth keeping? (optional — leaving blank is fine)"
          id="closeout-decision"
          value={decisionOrLearning}
          onChange={setDecisionOrLearning}
          hint="If you fill this in, it will create a pending inbox proposal you can review later."
        />

        <Field
          label="Where should the next session pick up?"
          id="closeout-next"
          value={nextStep}
          onChange={setNextStep}
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="rounded border px-3 py-1 text-sm"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          aria-label="Confirm"
          className="rounded bg-primary text-primary-foreground px-3 py-1 text-sm font-medium"
        >
          {submitting ? "Submitting..." : "Confirm"}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Internal subcomponent
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}

function Field({ label, id, value, onChange, hint }: FieldProps) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="text-xs font-medium text-muted-foreground uppercase tracking-wide block"
      >
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded border bg-background p-2 text-sm font-mono"
      />
      {hint ? (
        <div className="text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}
