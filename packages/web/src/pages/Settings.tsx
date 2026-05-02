import { useConfig, useUpdateConfig } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useParams } from "react-router-dom";
import { ClaudeCodeIntegrationPanel } from "@/components/ClaudeCodeIntegrationPanel";
import SettingsCustomTypes from "./SettingsCustomTypes";
import SettingsRules from "./SettingsRules";
import SettingsUserPreferences from "./SettingsUserPreferences";

type Tab = "config" | "rules" | "user";

interface CommonFields {
  freshness_warn_days: number;
  verification_required: string;
  folder_specs: string;
  folder_decisions: string;
  folder_plans: string;
  folder_tasks: string;
  id_spec: string;
  id_decision: string;
  id_plan: string;
  id_task: string;
}

interface ConfigShape {
  schemaVersion?: number;
  freshness_warn_days?: number;
  verification_required_for_status?: string[];
  folders?: Record<string, string>;
  ids?: Record<string, string>;
  [k: string]: unknown;
}

function defaultsFromConfig(cfg: ConfigShape): CommonFields {
  return {
    freshness_warn_days: cfg.freshness_warn_days ?? 30,
    verification_required: (cfg.verification_required_for_status ?? ["done", "accepted"]).join(
      ", ",
    ),
    folder_specs: cfg.folders?.spec ?? "specs",
    folder_decisions: cfg.folders?.decision ?? "decisions",
    folder_plans: cfg.folders?.plan ?? "plans",
    folder_tasks: cfg.folders?.task ?? "tasks",
    id_spec: cfg.ids?.spec ?? "SPEC",
    id_decision: cfg.ids?.decision ?? "ADR",
    id_plan: cfg.ids?.plan ?? "PLAN",
    id_task: cfg.ids?.task ?? "TASK",
  };
}

function mergeFormIntoConfig(cfg: ConfigShape, fields: CommonFields): ConfigShape {
  const folders: Record<string, string> = { ...(cfg.folders ?? {}) };
  folders.spec = fields.folder_specs.trim() || "specs";
  folders.decision = fields.folder_decisions.trim() || "decisions";
  folders.plan = fields.folder_plans.trim() || "plans";
  folders.task = fields.folder_tasks.trim() || "tasks";

  const ids: Record<string, string> = { ...(cfg.ids ?? {}) };
  ids.spec = fields.id_spec.trim() || "SPEC";
  ids.decision = fields.id_decision.trim() || "ADR";
  ids.plan = fields.id_plan.trim() || "PLAN";
  ids.task = fields.id_task.trim() || "TASK";

  const verification = fields.verification_required
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return {
    ...cfg,
    folders,
    ids,
    freshness_warn_days: Number.isFinite(fields.freshness_warn_days)
      ? fields.freshness_warn_days
      : 30,
    verification_required_for_status: verification,
  };
}

export default function Settings() {
  const { alias } = useParams<{ alias: string }>();
  const [tab, setTab] = useState<Tab>("config");
  const [scope, setScope] = useState<"project" | "global">("project");
  const cfg = useConfig(alias, scope);
  const update = useUpdateConfig();

  const data = (cfg.data ?? {}) as ConfigShape;
  const initialFields = useMemo(() => defaultsFromConfig(data), [data]);
  const { register, reset, handleSubmit, formState } = useForm<CommonFields>({
    values: initialFields,
  });

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  useEffect(() => {
    if (cfg.data) setRawText(JSON.stringify(cfg.data, null, 2));
  }, [cfg.data]);

  const onSubmit = handleSubmit((fields) => {
    if (!alias) return;
    const next = mergeFormIntoConfig(data, fields);
    update.mutate({ alias, scope, data: next });
  });

  const onSaveRaw = () => {
    if (!alias) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      alert(`Invalid JSON: ${(e as Error).message}`);
      return;
    }
    update.mutate({ alias, scope, data: parsed });
  };

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <h2 className="text-xl font-semibold">Settings</h2>

      {/* Claude Code wiring is project-scoped and the most common reason a user
          opens Settings, so surface it above the tabs rather than hiding it inside
          one. The panel is self-contained — it shows current wiring status and
          offers a one-click refresh that runs the same applyClaudeHooks logic
          `cairndex init` does from the terminal. */}
      {alias && <ClaudeCodeIntegrationPanel alias={alias} />}

      <div className="flex gap-2 border-b border-border">
        {(["config", "rules", "user"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === t
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "config" ? "Config" : t === "rules" ? "Rules" : "User Prefs"}
          </button>
        ))}
      </div>

      {tab === "rules" && <SettingsRules />}
      {tab === "user" && <SettingsUserPreferences />}

      {tab === "config" && (
      <>
      <div className="flex gap-2">
        {(["project", "global"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`px-3 py-1 rounded text-sm ${scope === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Validation</h3>
          <label className="block">
            <span className="text-xs text-muted-foreground">freshness_warn_days</span>
            <input
              type="number"
              min={1}
              {...register("freshness_warn_days", { valueAsNumber: true })}
              className="mt-1 w-32 px-2 py-1 text-sm border border-border rounded bg-background"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">
              verification_required_for_status (comma-separated)
            </span>
            <input
              type="text"
              {...register("verification_required")}
              className="mt-1 w-full px-2 py-1 text-sm border border-border rounded bg-background"
              placeholder="done, accepted"
            />
          </label>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Folders</h3>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["folder_specs", "specs"],
                ["folder_decisions", "decisions"],
                ["folder_plans", "plans"],
                ["folder_tasks", "tasks"],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="block">
                <span className="text-xs text-muted-foreground">{label}/</span>
                <input
                  type="text"
                  {...register(name)}
                  className="mt-1 w-full px-2 py-1 text-sm border border-border rounded bg-background"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">ID prefixes</h3>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["id_spec", "spec"],
                ["id_decision", "decision"],
                ["id_plan", "plan"],
                ["id_task", "task"],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="block">
                <span className="text-xs text-muted-foreground">{label}</span>
                <input
                  type="text"
                  {...register(name)}
                  className="mt-1 w-full px-2 py-1 text-sm border border-border rounded bg-background uppercase"
                />
              </label>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={update.isPending || !formState.isDirty}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {update.isPending ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => reset(initialFields)}
            className="px-3 py-2 rounded bg-muted text-muted-foreground text-sm"
          >
            Reset
          </button>
          {update.isSuccess && <span className="text-sm text-green-600">Saved</span>}
          {update.isError && (
            <span className="text-sm text-destructive">Error: {String(update.error)}</span>
          )}
        </div>
      </form>

      {scope === "project" && <SettingsCustomTypes />}

      <details
        className="rounded border border-border bg-muted/10"
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">
          Advanced (raw JSON)
        </summary>
        <div className="p-3 space-y-2">
          <textarea
            className="w-full h-72 font-mono text-xs p-3 border border-border rounded bg-background"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
          <button
            type="button"
            onClick={onSaveRaw}
            disabled={update.isPending}
            className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            Save raw JSON
          </button>
        </div>
      </details>
      </>
      )}
    </div>
  );
}
