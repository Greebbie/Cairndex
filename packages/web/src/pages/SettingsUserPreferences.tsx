import { useUpdateUserPreferences, useUserPreferences } from "@/lib/api";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface FormState {
  theme: Theme;
  defaultFreshnessWarnDays: string; // empty = inherit default
  autoAcceptConfidenceThreshold: string;
  personalRulesPath: string;
}

function emptyForm(): FormState {
  return {
    theme: "system",
    defaultFreshnessWarnDays: "",
    autoAcceptConfidenceThreshold: "",
    personalRulesPath: "",
  };
}

/**
 * Machine-scoped user preferences editor. Persists under the user's machine cairndex home
 * via PUT /api/user/preferences. Vault config wins where keys overlap — that
 * precedence is documented inline so users understand why a project might appear
 * to ignore their personal default.
 */
export default function SettingsUserPreferences() {
  const prefs = useUserPreferences();
  const update = useUpdateUserPreferences();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!prefs.data) return;
    setForm({
      theme: prefs.data.theme ?? "system",
      defaultFreshnessWarnDays:
        prefs.data.defaultFreshnessWarnDays == null
          ? ""
          : String(prefs.data.defaultFreshnessWarnDays),
      autoAcceptConfidenceThreshold:
        prefs.data.autoAcceptConfidenceThreshold == null
          ? ""
          : String(prefs.data.autoAcceptConfidenceThreshold),
      personalRulesPath: prefs.data.personalRulesPath ?? "",
    });
  }, [prefs.data]);

  if (prefs.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefs.data) return;
    const payload: Record<string, unknown> = { theme: form.theme };
    payload.defaultFreshnessWarnDays =
      form.defaultFreshnessWarnDays.trim() === ""
        ? null
        : Number.parseInt(form.defaultFreshnessWarnDays, 10);
    payload.autoAcceptConfidenceThreshold =
      form.autoAcceptConfidenceThreshold.trim() === ""
        ? null
        : Number.parseFloat(form.autoAcceptConfidenceThreshold);
    payload.personalRulesPath =
      form.personalRulesPath.trim() === "" ? null : form.personalRulesPath.trim();
    try {
      await update.mutateAsync(payload);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch {
      // error surfaces via update.isError below
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        These preferences are <strong>machine-scoped</strong> and live at{" "}
        <code>{`~/${".cairndex"}/preferences.yaml`}</code>. Vault config takes precedence where
        keys overlap — your personal defaults apply only when the active vault hasn't set them.
      </p>
      <form onSubmit={onSubmit} className="space-y-4 max-w-md">
        <label className="block">
          <span className="text-xs text-muted-foreground">UI theme</span>
          <select
            value={form.theme}
            onChange={(e) => setForm({ ...form, theme: e.target.value as Theme })}
            className="mt-1 w-full px-2 py-1 text-sm border border-border rounded bg-background"
          >
            <option value="system">system</option>
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-muted-foreground">
            Default freshness warning (days, blank = inherit)
          </span>
          <input
            type="number"
            min={1}
            value={form.defaultFreshnessWarnDays}
            onChange={(e) =>
              setForm({ ...form, defaultFreshnessWarnDays: e.target.value })
            }
            placeholder="30"
            className="mt-1 w-32 px-2 py-1 text-sm border border-border rounded bg-background"
          />
        </label>

        <label className="block">
          <span className="text-xs text-muted-foreground">
            Auto-accept confidence threshold (0–1, blank = off)
          </span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={form.autoAcceptConfidenceThreshold}
            onChange={(e) =>
              setForm({ ...form, autoAcceptConfidenceThreshold: e.target.value })
            }
            placeholder="0.85"
            className="mt-1 w-32 px-2 py-1 text-sm border border-border rounded bg-background"
          />
          <span className="block text-xs text-muted-foreground mt-1">
            Agent-proposed memory updates whose confidence is{" "}
            <span className="font-mono">≥ this value</span> are auto-applied to canonical memory
            without manual review. Leave blank to require manual review for every proposal
            (default). Recommended starting point if you opt in: 0.85 — only proposals where
            multiple heuristic signals fired (decision phrase + repeated IDs) clear that bar.
          </span>
        </label>

        <label className="block">
          <span className="text-xs text-muted-foreground">
            Personal rules markdown path (optional)
          </span>
          <input
            type="text"
            value={form.personalRulesPath}
            onChange={(e) => setForm({ ...form, personalRulesPath: e.target.value })}
            placeholder="C:/Users/you/personal-rules.md"
            className="mt-1 w-full px-2 py-1 text-sm border border-border rounded bg-background"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={update.isPending}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {update.isPending ? "Saving..." : "Save"}
          </button>
          {savedFlash && <span className="text-sm text-green-600">Saved</span>}
          {update.isError && (
            <span className="text-sm text-destructive">
              Error: {String(update.error)}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
