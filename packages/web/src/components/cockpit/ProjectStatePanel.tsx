import type { ProjectState } from "@/lib/types";
import { Link } from "react-router-dom";

interface Props {
  alias: string;
  state: ProjectState;
}

const TYPE_TO_FOLDER: Record<string, string> = {
  goal: "goals",
  spec: "specs",
  plan: "plans",
  task: "tasks",
};

function nodeLink(alias: string, type: keyof typeof TYPE_TO_FOLDER, id: string): string {
  return `/p/${alias}/browse/${TYPE_TO_FOLDER[type] ?? type}/${id}`;
}

export function ProjectStatePanel({ alias, state }: Props) {
  return (
    <section className="rounded border bg-card text-card-foreground p-4 space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Project State
      </h3>
      <dl className="text-sm grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Phase</dt>
        <dd>
          {state.phase}
          {state.phaseSince ? <span className="text-xs text-muted-foreground ml-2">since {state.phaseSince}</span> : null}
        </dd>

        {state.activeGoal ? (
          <>
            <dt className="text-muted-foreground">Active goal</dt>
            <dd>
              <Link to={nodeLink(alias, "goal", state.activeGoal.id)} className="font-mono text-primary hover:underline">
                {state.activeGoal.id}
              </Link>{" "}
              — {state.activeGoal.title}
            </dd>
          </>
        ) : null}

        {state.activeSpec ? (
          <>
            <dt className="text-muted-foreground">Active spec</dt>
            <dd>
              <Link to={nodeLink(alias, "spec", state.activeSpec.id)} className="font-mono text-primary hover:underline">
                {state.activeSpec.id}
              </Link>{" "}
              <span className="text-xs text-muted-foreground">({state.activeSpec.status})</span>{" "}
              — {state.activeSpec.title}
            </dd>
          </>
        ) : null}

        {state.activePlan ? (
          <>
            <dt className="text-muted-foreground">Active plan</dt>
            <dd>
              <Link to={nodeLink(alias, "plan", state.activePlan.id)} className="font-mono text-primary hover:underline">
                {state.activePlan.id}
              </Link>{" "}
              — {state.activePlan.title}
              {state.activePlan.currentTaskId ? (
                <span className="text-xs text-muted-foreground"> → current {state.activePlan.currentTaskId}</span>
              ) : null}
            </dd>
          </>
        ) : null}

        {state.currentTask ? (
          <>
            <dt className="text-muted-foreground">Current task</dt>
            <dd>
              <Link to={nodeLink(alias, "task", state.currentTask.id)} className="font-mono text-primary hover:underline">
                {state.currentTask.id}
              </Link>{" "}
              — {state.currentTask.title}{" "}
              <span className="text-xs text-muted-foreground">({state.currentTask.status})</span>
            </dd>
          </>
        ) : null}

        {state.nextAction ? (
          <>
            <dt className="text-muted-foreground">Next action</dt>
            <dd>{state.nextAction}</dd>
          </>
        ) : null}
      </dl>

      {state.warnings.length > 0 ? (
        <div className="mt-2 text-xs text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40 rounded p-2 space-y-1">
          {state.warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
