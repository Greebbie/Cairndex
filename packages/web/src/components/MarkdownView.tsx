import { remarkWikilinks } from "@/lib/remarkWikilinks";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

interface MarkdownViewProps {
  content: string;
  /** Alias for resolving [[ID]] wikilinks to /p/<alias>/browse/<type>/<ID>. */
  alias?: string;
}

export function MarkdownView({ content, alias }: MarkdownViewProps) {
  return (
    <div className="text-[15px] leading-7 text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkWikilinks, { alias }]]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ node, ...p }) => <h1 className="mt-6 mb-3 text-2xl font-semibold" {...p} />,
          h2: ({ node, ...p }) => (
            <h2 className="mt-6 mb-2 text-lg font-semibold border-b border-border pb-1" {...p} />
          ),
          h3: ({ node, ...p }) => <h3 className="mt-4 mb-2 text-base font-semibold" {...p} />,
          p: ({ node, ...p }) => <p className="my-3" {...p} />,
          ul: ({ node, ...p }) => <ul className="my-3 ml-5 list-disc space-y-1" {...p} />,
          ol: ({ node, ...p }) => <ol className="my-3 ml-5 list-decimal space-y-1" {...p} />,
          li: ({ node, ...p }) => <li className="" {...p} />,
          a: ({ node, ...p }) => <a className="text-primary underline hover:no-underline" {...p} />,
          code: ({ node, ...p }) => (
            <code className="bg-muted/50 px-1 py-0.5 rounded text-[13px] font-mono" {...p} />
          ),
          pre: ({ node, ...p }) => (
            <pre className="my-3 p-3 rounded bg-muted/40 overflow-x-auto text-[13px]" {...p} />
          ),
          blockquote: ({ node, ...p }) => (
            <blockquote
              className="my-3 border-l-2 border-border pl-3 text-muted-foreground"
              {...p}
            />
          ),
          hr: () => <hr className="my-6 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
