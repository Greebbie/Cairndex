import { nodeLink } from "@/lib/nodeLink";
import type { ProjectState } from "@/lib/types";
import { Link } from "react-router-dom";

interface Props {
  alias: string;
  state: ProjectState;
}

/**
 * Sticky one-line summary at the top of the dashboard. Mirrors the first three lines of
 * `cairndex status` so a human always sees phase + active task + next action without
 * scrolling, even after the page grows.
 */
export function NowBar({ alias, state }: Props) {
  const taskFragment = state.currentTask ? (
    <>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">Task</span>
      <Link
        to={nodeLink(alias, "task", state.currentTask.id)}
        className="font-mono text-primary hover:underline"
      >
        {state.currentTask.id}
      </Link>
      <span className="text-muted-foreground/80 truncate max-w-[28ch]">
        {state.currentTask.title}
      </span>
    </>
  ) : (
    <>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">No active task</span>
    </>
  );

  return (
    <div
      data-testid="now-bar"
      className="sticky top-0 z-30 -mx-8 px-8 py-2 mb-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 flex flex-wrap gap-x-3 gap-y-1 items-center text-sm"
    >
      <span className="text-muted-foreground uppercase text-xs tracking-wide">Now</span>
      <span className="font-medium">{state.phase}</span>
      {state.phaseSince ? (
        <span className="text-xs text-muted-foreground">since {state.phaseSince}</span>
      ) : null}
      {taskFragment}
      {state.nextAction ? (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Next</span>
          <span className="truncate max-w-[40ch]" title={state.nextAction}>
            {state.nextAction}
          </span>
        </>
      ) : null}
    </div>
  );
}
