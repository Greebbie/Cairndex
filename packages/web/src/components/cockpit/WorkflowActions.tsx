import { useNodesByType, usePhaseSet, useTaskComplete, useTaskSwitch } from "@/lib/api";
import type { ProjectState } from "@/lib/types";
import { useState } from "react";

interface Props {
  alias: string;
  state: ProjectState;
}

/**
 * Common phases surfaced in the dropdown. Users can also type a custom phase via
 * the inline text input — `phase set <name>` accepts any string. The list mirrors
 * the canonical lifecycle ("discovering → planning → implementing → testing") so
 * the most common transitions are one click.
 */
const COMMON_PHASES = ["discovering", "planning", "implementing", "testing", "done"] as const;

export function WorkflowActions({ alias, state }: Props) {
  const tasks = useNodesByType(alias, "task");
  const switchTask = useTaskSwitch();
  const completeTask = useTaskComplete();
  const setPhase = usePhaseSet();

  // Tasks eligible for "switch to" — anything not currently in_progress, done, or archived.
  // The server enforces the same rule but we filter the dropdown to avoid showing
  // options the user can't pick anyway.
  const eligibleTasks = (tasks.data ?? []).filter((t) => {
    const s = t.status ?? "";
    return s !== "in_progress" && s !== "done" && s !== "archived";
  });

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [phaseInput, setPhaseInput] = useState("");

  const lastError =
    switchTask.error?.message ?? completeTask.error?.message ?? setPhase.error?.message ?? null;

  const onCompleteCurrent = async () => {
    if (!state.currentTask) return;
    await completeTask.mutateAsync({ alias }).catch(() => {
      // Error surfaces below via mutation state.
    });
  };

  const onSwitch = async () => {
    if (!selectedTaskId) return;
    await switchTask.mutateAsync({ alias, taskId: selectedTaskId }).catch(() => {});
    setSelectedTaskId("");
  };

  const onSetPhase = async (phase: string) => {
    const next = phase.trim();
    if (!next || next === state.phase) return;
    await setPhase.mutateAsync({ alias, phase: next }).catch(() => {});
    setPhaseInput("");
  };

  const anyPending = switchTask.isPending || completeTask.isPending || setPhase.isPending;

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-2 text-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Actions</div>

      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={onCompleteCurrent}
          disabled={!state.currentTask || anyPending}
          className="rounded bg-emerald-600 text-white px-2.5 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
          title={
            state.currentTask ? `Mark ${state.currentTask.id} done` : "No current task to complete"
          }
        >
          {completeTask.isPending ? "Completing…" : "Mark current task done"}
        </button>

        <div className="flex min-w-0 items-center gap-1">
          <select
            aria-label="Switch to task"
            value={selectedTaskId}
            onChange={(e) => setSelectedTaskId(e.target.value)}
            disabled={anyPending || eligibleTasks.length === 0}
            className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs disabled:opacity-50 sm:w-44 sm:flex-none"
          >
            <option value="">
              {eligibleTasks.length === 0 ? "No switchable tasks" : "Switch to task…"}
            </option>
            {eligibleTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} — {t.title ?? "(untitled)"}
                {t.status ? ` (${t.status})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onSwitch}
            disabled={!selectedTaskId || anyPending}
            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          >
            {switchTask.isPending ? "Switching…" : "Switch"}
          </button>
        </div>

        <div className="flex min-w-0 items-center gap-1">
          <select
            aria-label="Advance phase"
            value=""
            onChange={(e) => {
              if (e.target.value) onSetPhase(e.target.value);
            }}
            disabled={anyPending}
            className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs disabled:opacity-50 sm:w-32 sm:flex-none"
          >
            <option value="">Set phase…</option>
            {COMMON_PHASES.filter((p) => p !== state.phase).map((p) => (
              <option key={p} value={p}>
                → {p}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="custom"
            value={phaseInput}
            onChange={(e) => setPhaseInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSetPhase(phaseInput);
            }}
            disabled={anyPending}
            className="w-24 rounded border bg-background px-2 py-1 text-xs disabled:opacity-50"
          />
        </div>
      </div>

      {lastError ? (
        <div className="text-xs text-red-700 dark:text-red-300" role="alert">
          {lastError}
        </div>
      ) : null}
    </div>
  );
}
