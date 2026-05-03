import { TextWithResolvedIds } from "@/components/InlineNodeRef";
import { nodeLink } from "@/lib/nodeLink";
import type { ProjectState } from "@/lib/types";
import { Link } from "react-router-dom";
import { WorkflowActions } from "./WorkflowActions";

interface Props {
  alias: string;
  state: ProjectState;
}

/**
 * "What's happening with my project?" — the narrative form of `ProjectState` for a
 * vibe coder watching their AI agent. Renders titles as the headline (italicized
 * link text) and demotes the typed IDs to the link `href` + `title` tooltip. The
 * rule across the dashboard is: human surfaces lead with summaries; IDs are agent
 * surface and live in tooltips/link targets only.
 */
export function ProjectStatePanel({ alias, state }: Props) {
  const hasNarrative =
    state.activeGoal !== null ||
    state.activeSpec !== null ||
    state.activePlan !== null ||
    state.currentTask !== null ||
    state.nextAction !== null;

  return (
    <section className="rounded border bg-card text-card-foreground p-4 space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Project State
      </h3>

      <div className="text-sm space-y-1.5 leading-relaxed">
        <div>
          <span className="text-muted-foreground">Phase:</span>{" "}
          <span className="font-medium">{state.phase}</span>
          {state.phaseSince ? (
            <span className="text-xs text-muted-foreground ml-2">since {state.phaseSince}</span>
          ) : null}
        </div>

        {state.activeSpec ? (
          <div>
            <span className="text-muted-foreground">Building</span>{" "}
            <Link
              to={nodeLink(alias, "spec", state.activeSpec.id)}
              title={`${state.activeSpec.id} (${state.activeSpec.status})`}
              className="italic text-foreground hover:underline"
            >
              {state.activeSpec.title}
            </Link>
            {state.activeGoal ? (
              <>
                {" "}
                <span className="text-muted-foreground">toward</span>{" "}
                <Link
                  to={nodeLink(alias, "goal", state.activeGoal.id)}
                  title={state.activeGoal.id}
                  className="italic text-foreground hover:underline"
                >
                  {state.activeGoal.title}
                </Link>
              </>
            ) : null}
            <span>.</span>
          </div>
        ) : state.activeGoal ? (
          <div>
            <span className="text-muted-foreground">Working toward</span>{" "}
            <Link
              to={nodeLink(alias, "goal", state.activeGoal.id)}
              title={state.activeGoal.id}
              className="italic text-foreground hover:underline"
            >
              {state.activeGoal.title}
            </Link>
            <span>.</span>
          </div>
        ) : null}

        {state.activePlan ? (
          <div>
            <span className="text-muted-foreground">Plan:</span>{" "}
            <Link
              to={nodeLink(alias, "plan", state.activePlan.id)}
              title={`${state.activePlan.id} (${state.activePlan.status})`}
              className="italic text-foreground hover:underline"
            >
              {state.activePlan.title}
            </Link>
            <span>.</span>
          </div>
        ) : null}

        {state.currentTask ? (
          <div>
            <span className="text-muted-foreground">On now:</span>{" "}
            <Link
              to={nodeLink(alias, "task", state.currentTask.id)}
              title={state.currentTask.id}
              className="italic text-foreground hover:underline"
            >
              {state.currentTask.title}
            </Link>{" "}
            <span className="text-xs text-muted-foreground">({state.currentTask.status})</span>
            <span>.</span>
          </div>
        ) : null}

        {state.nextAction ? (
          <div>
            <span className="text-muted-foreground">Next:</span>{" "}
            <TextWithResolvedIds alias={alias} text={state.nextAction} />
          </div>
        ) : null}

        {!hasNarrative ? (
          <div className="text-muted-foreground italic">
            No active spec or task yet — pick one with the Switch action below or via{" "}
            <code className="font-mono text-xs">cairndex task switch</code>.
          </div>
        ) : null}
      </div>

      {state.warnings.length > 0 ? (
        <div className="mt-2 text-xs text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40 rounded p-2 space-y-1">
          {state.warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      ) : null}

      <WorkflowActions alias={alias} state={state} />
    </section>
  );
}
