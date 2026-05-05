import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useWatcherEvents(alias: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!alias) return;
    const es = new EventSource(`/api/events/${alias}`);
    const onAny = () => {
      qc.invalidateQueries({ queryKey: ["vault", alias] });
      qc.invalidateQueries({ queryKey: ["doctor", alias] });
      qc.invalidateQueries({ queryKey: ["changes", alias] });
    };
    // Refresh the end-of-turn summary when its file changes — gives the dashboard
    // a near-live "what just happened" affordance without polling.
    const onFileChanged = (e: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(e.data) as { path?: string };
        if (typeof payload.path === "string") {
          if (/state[\\/]last-turn-summary\.json$/.test(payload.path)) {
            qc.invalidateQueries({ queryKey: ["last-turn-summary", alias] });
          }
          // Intent file: written by `cairndex intent set` before non-trivial work,
          // removed by the Stop-hook `cairndex intent clear`. Both events should refresh
          // the dashboard's IntentBar within ~1s of the file mutation.
          if (/state[\\/]current-intent\.md$/.test(payload.path)) {
            qc.invalidateQueries({ queryKey: ["intent", alias] });
          }
        }
      } catch {
        // ignore malformed payloads — heartbeats and other events still flow.
      }
      onAny();
    };
    const onArchived = (e: MessageEvent<string>) => {
      // intent file deletion comes through as `archived` (chokidar `unlink` -> archived SSE).
      try {
        const payload = JSON.parse(e.data) as { path?: string };
        if (
          typeof payload.path === "string" &&
          /state[\\/]current-intent\.md$/.test(payload.path)
        ) {
          qc.invalidateQueries({ queryKey: ["intent", alias] });
        }
      } catch {
        // ignore
      }
      onAny();
    };
    es.addEventListener("file-changed", onFileChanged);
    es.addEventListener("archived", onArchived);
    es.onerror = () => {
      /* browser will retry */
    };
    return () => {
      es.removeEventListener("file-changed", onFileChanged);
      es.removeEventListener("archived", onArchived);
      es.close();
    };
  }, [alias, qc]);
}
