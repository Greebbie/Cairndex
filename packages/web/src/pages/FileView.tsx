import { BacklinksPanel } from "@/components/BacklinksPanel";
import { FrontmatterCard } from "@/components/FrontmatterCard";
import { MarkdownView } from "@/components/MarkdownView";
import { useNode } from "@/lib/api";
import { useWatcherEvents } from "@/lib/sse";
import { useParams } from "react-router-dom";

export default function FileView() {
  const { alias, type, id } = useParams<{ alias: string; type: string; id: string }>();
  const node = useNode(alias, type, id);
  useWatcherEvents(alias);

  if (node.isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (node.error) return <div className="p-8 text-destructive">Error loading {id}</div>;
  if (!node.data) return null;

  return (
    <div className="flex h-full">
      <div className="flex-1 p-8 overflow-auto">
        <h2 className="text-2xl font-semibold mb-4">{String(node.data.frontmatter.title ?? id)}</h2>
        <MarkdownView content={node.data.body} alias={alias} />
      </div>
      <aside className="w-80 border-l border-border p-4 overflow-auto space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Frontmatter
          </div>
          <FrontmatterCard data={node.data.frontmatter} />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Backlinks
          </div>
          <BacklinksPanel backlinks={node.data.backlinks} />
        </div>
      </aside>
    </div>
  );
}
