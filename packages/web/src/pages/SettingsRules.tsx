import { useDeleteRule, useRule, useRules, useSaveRule } from "@/lib/api";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const NEW_RULE_TEMPLATE = `# <Rule name>

Describe the rule the agent should follow when working on this project.

Examples:
- Always include a "Risk assessment" section in every spec.
- Before changing a public API, propose an ADR first.
- Performance work needs benchmark numbers in the verification block.

This file is automatically included in every context pack the agent reads.
`;

export default function SettingsRules() {
  const { alias } = useParams<{ alias: string }>();
  const list = useRules(alias);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const ruleQ = useRule(alias, isNew ? undefined : (selected ?? undefined));
  const save = useSaveRule();
  const del = useDeleteRule();

  // Sync draft with the loaded rule body when an existing rule is selected.
  useEffect(() => {
    if (!isNew && ruleQ.data) setDraft(ruleQ.data.content);
  }, [ruleQ.data, isNew]);

  // Auto-select the first rule when the list loads, if nothing is selected yet.
  useEffect(() => {
    if (!selected && !isNew && list.data && list.data.rules.length > 0) {
      const first = list.data.rules[0];
      if (first) setSelected(first.name);
    }
  }, [list.data, selected, isNew]);

  if (!alias) return null;

  const beginNew = (): void => {
    setIsNew(true);
    setSelected(null);
    setNewName("");
    setDraft(NEW_RULE_TEMPLATE);
  };

  const cancelNew = (): void => {
    setIsNew(false);
    setNewName("");
    setDraft("");
  };

  const onSave = (): void => {
    const name = isNew ? newName.trim() : (selected ?? "");
    if (!name) {
      alert("Pick or type a rule name first.");
      return;
    }
    save.mutate(
      { alias, name, content: draft },
      {
        onSuccess: () => {
          setIsNew(false);
          setSelected(name);
          setNewName("");
        },
        onError: (err) => {
          alert(`Save failed: ${(err as Error).message}`);
        },
      },
    );
  };

  const onDelete = (): void => {
    if (!selected || isNew) return;
    if (!confirm(`Delete rule "${selected}"?`)) return;
    del.mutate(
      { alias, name: selected },
      {
        onSuccess: () => {
          setSelected(null);
          setDraft("");
        },
      },
    );
  };

  const rules = list.data?.rules ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-1">Operating rules</h3>
        <p className="text-xs text-muted-foreground">
          Markdown rules the agent reads in every context pack. Author your own to enforce
          conventions, schemas, or behaviors specific to this project. Files live under{" "}
          {list.data ? (
            <code className="font-mono text-xs">{list.data.dir}</code>
          ) : (
            "the rules folder"
          )}
          .
        </p>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-4 min-h-[400px]">
        {/* Left: list of rules */}
        <aside className="space-y-1 border-r border-border pr-3">
          <button
            type="button"
            onClick={beginNew}
            className="w-full text-left px-2 py-1 rounded text-sm bg-primary text-primary-foreground hover:opacity-90"
          >
            + New rule
          </button>
          {list.isLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : rules.length === 0 ? (
            <div className="text-xs text-muted-foreground italic mt-2">
              No rules yet. Create one to start.
            </div>
          ) : (
            <ul className="space-y-0.5 mt-2">
              {rules.map((r) => (
                <li key={r.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNew(false);
                      setSelected(r.name);
                    }}
                    className={`w-full text-left px-2 py-1 rounded text-sm font-mono truncate ${
                      selected === r.name && !isNew
                        ? "bg-muted text-foreground"
                        : "hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Right: editor */}
        <section className="space-y-2">
          {isNew && (
            <label className="block">
              <span className="text-xs text-muted-foreground">
                Rule name (letters, digits, dot, dash, underscore — no spaces, .md is added
                automatically)
              </span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="my-team-conventions"
                className="mt-1 w-full px-2 py-1 text-sm font-mono border border-border rounded bg-background"
              />
            </label>
          )}
          {!isNew && selected && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">{selected}.md</span>
              <button
                type="button"
                onClick={onDelete}
                disabled={del.isPending}
                className="text-xs text-destructive hover:underline disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}
          {(isNew || selected) && (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full h-96 font-mono text-xs p-3 border border-border rounded bg-background"
                placeholder="# Rule body in Markdown"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onSave}
                  disabled={save.isPending || (isNew && !newName.trim())}
                  className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  {save.isPending ? "Saving…" : "Save"}
                </button>
                {isNew && (
                  <button
                    type="button"
                    onClick={cancelNew}
                    className="px-3 py-2 rounded bg-muted text-muted-foreground text-sm"
                  >
                    Cancel
                  </button>
                )}
                {save.isSuccess && (
                  <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
                )}
                {ruleQ.isLoading && !isNew && (
                  <span className="text-xs text-muted-foreground">Loading rule…</span>
                )}
              </div>
            </>
          )}
          {!isNew && !selected && rules.length > 0 && (
            <div className="text-sm text-muted-foreground italic">
              Pick a rule on the left to edit, or click "+ New rule".
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
