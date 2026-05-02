import type { PatchOp } from "@/lib/types";

interface Props {
  patch: PatchOp[];
}

const KIND_LABEL: Record<PatchOp["kind"], string> = {
  "append-section": "Append to",
  "replace-section": "Replace",
};

export function ProposalPatchView({ patch }: Props) {
  return (
    <div className="space-y-3">
      {patch.map((op, idx) => (
        <div key={`${idx}-${op.kind}-${op.section}`} className="rounded border bg-muted/30 p-2">
          <div className="text-xs font-mono text-muted-foreground mb-1">
            <span className="font-semibold text-foreground">{KIND_LABEL[op.kind]}</span>{" "}
            <span className="text-primary">{op.section}</span>
          </div>
          <pre className="text-xs whitespace-pre-wrap break-words text-foreground">
            {op.content}
          </pre>
        </div>
      ))}
    </div>
  );
}
