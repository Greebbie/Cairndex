import { nodeLink } from "@/lib/nodeLink";
import { humanizeDateString } from "@/lib/time";
import type { Intent } from "@/lib/types";
import { Link } from "react-router-dom";

interface Props {
  alias: string;
  intent: Intent | null;
}

/**
 * IntentBar — surfaces the agent's pre-flight intent (the steps it declared via
 * `cairndex intent set` before non-trivial work). Live-updates via SSE on intent
 * file mutations.
 *
 * Empty state ("agent in exploratory mode") is intentional: the Stop hook clears
 * intent at end-of-turn, so most of the time between turns the bar shows empty.
 * That's signal, not noise — it tells the user the agent is either between turns
 * or doing light work that didn't warrant a contract.
 *
 * Visually distinct from NowBar: tinted background + numbered steps, so the eye
 * separates "what's the project up to" (NowBar) from "what's the agent about to do
 * right now" (IntentBar).
 */
export function IntentBar({ alias, intent }: Props) {
  if (!intent || intent.steps.length === 0) {
    return (
      <div
        data-testid="intent-bar-empty"
        className="-mx-4 px-4 py-2 mb-3 border-b border-dashed border-border/60 text-xs text-muted-foreground/80 italic md:-mx-8 md:px-8"
      >
        <span className="uppercase tracking-wide not-italic font-medium text-muted-foreground/70">
          Intent
        </span>
        <span className="ml-3">
          no pre-flight intent — agent is between turns or in exploratory mode
        </span>
      </div>
    );
  }

  const setAtRel = humanizeDateString(intent.setAt);

  return (
    <div
      data-testid="intent-bar"
      className="-mx-4 px-4 py-2 mb-3 border-b bg-amber-50/40 dark:bg-amber-950/20 md:-mx-8 md:px-8"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="uppercase tracking-wide text-xs font-medium text-amber-700 dark:text-amber-400">
          Intent
        </span>
        {intent.taskId ? (
          <Link
            to={nodeLink(alias, "task", intent.taskId)}
            className="font-mono text-xs text-primary hover:underline"
          >
            {intent.taskId}
          </Link>
        ) : null}
        <span className="text-xs text-muted-foreground" title={intent.setAt}>
          set {setAtRel}
        </span>
      </div>
      <ol className="mt-1 ml-1 space-y-0.5">
        {intent.steps.map((step, i) => (
          // Steps are positional and short-lived (cleared at end-of-turn) — index is a
          // stable enough key here; a content key would still re-render every set.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional list, ephemeral
          <li key={i} className="text-sm flex gap-2">
            <span className="font-mono text-amber-700 dark:text-amber-400 tabular-nums w-5 shrink-0">
              {i + 1}.
            </span>
            <span className="break-words">{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-xs text-muted-foreground italic">
        If this is wrong, interrupt the agent and tell it to re-set.
      </p>
    </div>
  );
}
