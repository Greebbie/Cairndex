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
    es.addEventListener("file-changed", onAny);
    es.addEventListener("archived", onAny);
    es.onerror = () => {
      /* browser will retry */
    };
    return () => es.close();
  }, [alias, qc]);
}
