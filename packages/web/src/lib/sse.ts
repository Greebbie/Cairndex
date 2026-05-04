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
        if (
          typeof payload.path === "string" &&
          /state[\\/]last-turn-summary\.json$/.test(payload.path)
        ) {
          qc.invalidateQueries({ queryKey: ["last-turn-summary", alias] });
        }
      } catch {
        // ignore malformed payloads — heartbeats and other events still flow.
      }
      onAny();
    };
    es.addEventListener("file-changed", onFileChanged);
    es.addEventListener("archived", onAny);
    es.onerror = () => {
      /* browser will retry */
    };
    return () => {
      es.removeEventListener("file-changed", onFileChanged);
      es.removeEventListener("archived", onAny);
      es.close();
    };
  }, [alias, qc]);
}
