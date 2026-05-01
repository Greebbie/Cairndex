import { Link, useParams } from "react-router-dom";

interface Backlink {
  from: string;
  fromType: string;
  type: string;
}

export function BacklinksPanel({ backlinks }: { backlinks: Backlink[] }) {
  const { alias } = useParams<{ alias: string }>();
  if (backlinks.length === 0)
    return <div className="text-xs text-muted-foreground">(no backlinks)</div>;
  return (
    <ul className="space-y-1 text-sm">
      {backlinks.map((b, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: server-stable order
        <li key={i} className="flex gap-2">
          <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded">{b.type}</span>
          <Link to={`/p/${alias}/browse/${b.fromType}/${b.from}`} className="hover:underline">
            {b.from}
          </Link>
        </li>
      ))}
    </ul>
  );
}
