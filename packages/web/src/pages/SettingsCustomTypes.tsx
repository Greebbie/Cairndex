import { useConfig, useTypes, useUpdateConfig } from "@/lib/api";
import { useState } from "react";
import { useParams } from "react-router-dom";

interface ConfigShape {
  schemaVersion?: number;
  node_types?: Record<string, { folder: string; id_prefix: string }>;
  [k: string]: unknown;
}

const NAME_RE = /^[a-z][a-z0-9-]*$/;
const FOLDER_RE = /^[a-z0-9][a-z0-9-]*$/i;
const PREFIX_RE = /^[A-Z][A-Z0-9_]*$/;

function deriveDefaults(name: string): { folder: string; prefix: string } {
  if (!name) return { folder: "", prefix: "" };
  const folder = `${name}s`.replace(/-+/g, "-");
  const prefix = name.toUpperCase().replace(/-/g, "_").slice(0, 8);
  return { folder, prefix };
}

export default function SettingsCustomTypes() {
  const { alias } = useParams<{ alias: string }>();
  const cfgQ = useConfig(alias, "project");
  const typesQ = useTypes(alias);
  const update = useUpdateConfig();

  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [prefix, setPrefix] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!alias) return null;

  const cfg = (cfgQ.data ?? {}) as ConfigShape;
  const customTypes = (typesQ.data?.types ?? []).filter((t) => !t.builtIn);

  const onNameChange = (v: string): void => {
    setName(v);
    if (!folder || folder === deriveDefaults(name).folder) {
      setFolder(deriveDefaults(v).folder);
    }
    if (!prefix || prefix === deriveDefaults(name).prefix) {
      setPrefix(deriveDefaults(v).prefix);
    }
  };

  const onAdd = (): void => {
    setError(null);
    const trimmedName = name.trim();
    const trimmedFolder = folder.trim();
    const trimmedPrefix = prefix.trim();
    if (!NAME_RE.test(trimmedName)) {
      setError("Name must be lowercase letters/digits/dashes (e.g. experiment, risk-log).");
      return;
    }
    if (!FOLDER_RE.test(trimmedFolder)) {
      setError("Folder must be a kebab-case directory name (e.g. experiments).");
      return;
    }
    if (!PREFIX_RE.test(trimmedPrefix)) {
      setError("ID prefix must be UPPER_SNAKE (e.g. EXP, RISK).");
      return;
    }
    // Don't let users overwrite a built-in by accident
    const builtIn = (typesQ.data?.types ?? []).find((t) => t.builtIn && t.name === trimmedName);
    if (builtIn) {
      setError(`"${trimmedName}" is a built-in type — pick a different name.`);
      return;
    }
    const nextNodeTypes = {
      ...(cfg.node_types ?? {}),
      [trimmedName]: { folder: trimmedFolder, id_prefix: trimmedPrefix },
    };
    update.mutate(
      { alias, scope: "project", data: { ...cfg, node_types: nextNodeTypes } },
      {
        onSuccess: () => {
          setName("");
          setFolder("");
          setPrefix("");
          typesQ.refetch();
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  };

  const onDelete = (typeName: string): void => {
    if (
      !confirm(
        `Remove custom type "${typeName}"?\n\nThis only removes the configuration entry — files in the folder are NOT deleted.`,
      )
    ) {
      return;
    }
    const nextNodeTypes: Record<string, { folder: string; id_prefix: string }> = {
      ...(cfg.node_types ?? {}),
    };
    delete nextNodeTypes[typeName];
    update.mutate(
      { alias, scope: "project", data: { ...cfg, node_types: nextNodeTypes } },
      { onSuccess: () => typesQ.refetch() },
    );
  };

  return (
    <section className="space-y-3 mt-6 pt-6 border-t border-border">
      <div>
        <h3 className="text-sm font-semibold">Custom node types</h3>
        <p className="text-xs text-muted-foreground">
          Add your own first-class types beyond the built-ins (spec, decision, plan, task, …).
          Examples: <code>experiment</code>, <code>risk</code>, <code>hypothesis</code>. They show
          up in Browse and don't trigger doctor warnings. Pair with a Rules entry to tell the agent
          how to write them.
        </p>
      </div>

      {customTypes.length > 0 ? (
        <table className="w-full text-sm border border-border rounded">
          <thead className="text-xs text-muted-foreground bg-muted/30">
            <tr>
              <th className="text-left px-3 py-1.5 font-normal">name</th>
              <th className="text-left px-3 py-1.5 font-normal">folder/</th>
              <th className="text-left px-3 py-1.5 font-normal">id prefix</th>
              <th className="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {customTypes.map((t) => (
              <tr key={t.name} className="border-t border-border">
                <td className="px-3 py-1.5 font-mono text-xs">{t.name}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{t.folder}/</td>
                <td className="px-3 py-1.5 font-mono text-xs">{t.idPrefix}</td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(t.name)}
                    disabled={update.isPending}
                    className="text-xs text-destructive hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-xs text-muted-foreground italic">No custom types yet.</div>
      )}

      <div className="space-y-2 rounded border border-dashed border-border p-3">
        <div className="text-xs font-semibold text-muted-foreground">+ Add a custom type</div>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="text-[11px] text-muted-foreground">name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="experiment"
              className="mt-1 w-full px-2 py-1 text-sm font-mono border border-border rounded bg-background"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-muted-foreground">folder</span>
            <input
              type="text"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="experiments"
              className="mt-1 w-full px-2 py-1 text-sm font-mono border border-border rounded bg-background"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-muted-foreground">id prefix</span>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              placeholder="EXP"
              className="mt-1 w-full px-2 py-1 text-sm font-mono uppercase border border-border rounded bg-background"
            />
          </label>
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div>
          <button
            type="button"
            onClick={onAdd}
            disabled={update.isPending || !name.trim()}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {update.isPending ? "Adding…" : "Add type"}
          </button>
        </div>
      </div>
    </section>
  );
}
