import { useChanges } from "@/lib/api";
import { useWatcherEvents } from "@/lib/sse";
import { useParams } from "react-router-dom";

export default function Timeline() {
  const { alias } = useParams<{ alias: string }>();
  const changes = useChanges(alias);
  useWatcherEvents(alias);

  if (changes.isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (changes.error)
    return (
      <div className="p-8 text-destructive">Error loading timeline: {String(changes.error)}</div>
    );
  if (!changes.data) return null;

  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold mb-4">Timeline</h2>
      <ul className="space-y-2">
        {changes.data.events.map((e, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: server-stable order
          <li key={i} className="flex gap-3 text-sm border-b border-border pb-2">
            <span className="text-xs text-muted-foreground min-w-24">{e.date}</span>
            <span>{e.summary}</span>
          </li>
        ))}
        {changes.data.events.length === 0 && (
          <li className="text-muted-foreground">No events yet.</li>
        )}
      </ul>
    </div>
  );
}
