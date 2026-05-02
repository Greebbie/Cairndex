import { useDoctor, useFix, useInitVault, useRegisterProject } from "@/lib/api";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Step = "vault" | "project" | "doctor";

interface RegisteredProject {
  alias: string;
  projectId: string | null;
  projectRoot: string;
  vaultRoot: string;
}

const isWindows =
  typeof navigator !== "undefined" && /Win(dows|32|64)/i.test(navigator.userAgent);
const exampleVaultPath = isWindows ? "C:\\Users\\you\\CairndexVault" : "~/CairndexVault";
const exampleRepoPath = isWindows
  ? "C:\\Users\\you\\Documents\\GitHub\\my-app"
  : "~/code/my-app";

export default function Onboarding() {
  const [step, setStep] = useState<Step>("vault");
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);
  const [registered, setRegistered] = useState<RegisteredProject | null>(null);

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold">Welcome to Cairndex</h1>
        <p className="text-sm text-muted-foreground">
          Persistent project memory for your AI coding work. Specs, decisions, and session
          notes live in one central vault — agents read them before work and propose updates
          you review.
        </p>
      </div>

      <Stepper current={step} />

      {step === "vault" && (
        <VaultStep
          onDone={(vr) => {
            setVaultRoot(vr);
            setStep("project");
          }}
        />
      )}

      {step === "project" && vaultRoot && (
        <ProjectStep
          vaultRoot={vaultRoot}
          onBack={() => setStep("vault")}
          onDone={(r) => {
            setRegistered(r);
            setStep("doctor");
          }}
        />
      )}

      {step === "doctor" && registered && <DoctorStep registered={registered} />}
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: "vault", label: "1. Choose vault" },
    { key: "project", label: "2. Register project" },
    { key: "doctor", label: "3. Verify" },
  ];
  const order: Record<Step, number> = { vault: 0, project: 1, doctor: 2 };
  const currentIdx = order[current];
  return (
    <div className="flex items-center gap-3 mb-6 text-xs">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div
            key={s.key}
            className={
              done
                ? "text-foreground"
                : active
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground"
            }
          >
            {s.label}
            {i < steps.length - 1 && <span className="ml-3 text-muted-foreground">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function VaultStep({ onDone }: { onDone: (vaultRoot: string) => void }) {
  const [path, setPath] = useState("");
  const [title, setTitle] = useState("");
  const initVault = useInitVault();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;
    const payload: { path: string; title?: string } = { path: path.trim() };
    if (title.trim()) payload.title = title.trim();
    initVault.mutate(payload, {
      onSuccess: (data) => onDone(data.vaultRoot),
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded border border-border bg-card p-5">
      <div className="space-y-2">
        <h2 className="text-base font-semibold mb-1">Where should your vault live?</h2>
        <p className="text-sm text-muted-foreground">
          Cairndex will create or open this folder. Every project's memory lives inside it.
        </p>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">What's a vault?</summary>
          <p className="mt-1 pl-3 border-l-2 border-border">
            A folder of typed Markdown files (specs, decisions, plans, sessions, insights) shared
            across all your projects. Versionable, human-readable, and survives your AI agent's
            chat-window resets. One vault holds many projects.
          </p>
        </details>
      </div>

      <label className="block">
        <span className="text-xs text-muted-foreground">Vault folder path</span>
        <input
          type="text"
          autoFocus
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder={`e.g. ${exampleVaultPath}`}
          className="mt-1 w-full px-3 py-2 text-sm font-mono border border-border rounded bg-background"
        />
        <span className="block text-xs text-muted-foreground mt-1">
          Tip: paste from your file explorer's address bar. The folder will be created if it
          doesn't exist.{!isWindows ? " Tilde (~) expands to your home folder." : ""}
        </span>
      </label>

      <label className="block">
        <span className="text-xs text-muted-foreground">Vault title (optional)</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My Cairndex Vault"
          className="mt-1 w-full px-3 py-2 text-sm border border-border rounded bg-background"
        />
      </label>

      {initVault.isError && (
        <div className="text-sm text-destructive">
          Could not create vault: {String((initVault.error as Error).message)}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!path.trim() || initVault.isPending}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
        >
          {initVault.isPending ? "Creating..." : "Create / open vault"}
        </button>
      </div>
    </form>
  );
}

function ProjectStep({
  vaultRoot,
  onBack,
  onDone,
}: {
  vaultRoot: string;
  onBack: () => void;
  onDone: (r: RegisteredProject) => void;
}) {
  const [repo, setRepo] = useState("");
  const [project, setProject] = useState("");
  const [alias, setAlias] = useState("");
  const register = useRegisterProject();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo.trim()) return;
    const payload: {
      vault: string;
      repo: string;
      project?: string;
      alias?: string;
    } = { vault: vaultRoot, repo: repo.trim() };
    if (project.trim()) payload.project = project.trim();
    if (alias.trim()) payload.alias = alias.trim();
    register.mutate(payload, { onSuccess: (data) => onDone(data) });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded border border-border bg-card p-5">
      <div className="space-y-2">
        <h2 className="text-base font-semibold mb-1">Register a project</h2>
        <p className="text-sm text-muted-foreground">
          Point Cairndex at a code repository to track. Memory will be stored under{" "}
          <code className="font-mono text-xs">
            {vaultRoot.replace(/\\/g, "/")}/projects/&lt;id&gt;/
          </code>
          .
        </p>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            What does registering do?
          </summary>
          <p className="mt-1 pl-3 border-l-2 border-border">
            Creates the project folder structure inside the vault (specs/, decisions/, sessions/,
            inbox/…) and writes a one-line <code>.cairndex-project.yaml</code> pointer file inside
            your repo so tooling can find the vault. The pointer file is the only thing added to
            your repo — the vault stays the source of truth.
          </p>
        </details>
      </div>

      <label className="block">
        <span className="text-xs text-muted-foreground">Path to your code repo</span>
        <input
          type="text"
          autoFocus
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder={`e.g. ${exampleRepoPath}`}
          className="mt-1 w-full px-3 py-2 text-sm font-mono border border-border rounded bg-background"
        />
      </label>

      <label className="block">
        <span className="text-xs text-muted-foreground">
          Project ID (optional — defaults to the folder name)
        </span>
        <input
          type="text"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="my-app"
          className="mt-1 w-full px-3 py-2 text-sm border border-border rounded bg-background"
        />
      </label>

      <label className="block">
        <span className="text-xs text-muted-foreground">Alias for the sidebar (optional)</span>
        <input
          type="text"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="my-app"
          className="mt-1 w-full px-3 py-2 text-sm border border-border rounded bg-background"
        />
      </label>

      {register.isError && (
        <div className="text-sm text-destructive">
          Could not register: {String((register.error as Error).message)}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-2 rounded bg-muted text-muted-foreground text-sm"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!repo.trim() || register.isPending}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
        >
          {register.isPending ? "Registering..." : "Register project"}
        </button>
      </div>
    </form>
  );
}

function DoctorStep({ registered }: { registered: RegisteredProject }) {
  const navigate = useNavigate();
  const doctor = useDoctor(registered.alias);
  const fix = useFix();
  const [showAll, setShowAll] = useState(false);

  const issues = doctor.data?.issues ?? [];
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warn").length;
  const fixableCount = issues.filter((i) => i.fixable === true).length;
  const visibleIssues = showAll ? issues : issues.slice(0, 8);

  return (
    <div className="space-y-4 rounded border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold mb-1">Verifying your project</h2>
        <p className="text-sm text-muted-foreground">
          Registered as <code className="font-mono text-xs">{registered.alias}</code>. Running
          doctor checks to make sure the vault is healthy.
        </p>
      </div>

      {doctor.isLoading ? (
        <div className="text-sm text-muted-foreground">Running doctor…</div>
      ) : doctor.isError ? (
        <div className="text-sm text-destructive">
          Failed to run doctor: {String((doctor.error as Error).message)}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Badge tone={errorCount > 0 ? "error" : "ok"}>{errorCount} error</Badge>
            <Badge tone={warningCount > 0 ? "warn" : "ok"}>{warningCount} warning</Badge>
            <span className="text-muted-foreground">{issues.length} total checks reported</span>
          </div>

          {errorCount === 0 && warningCount > 0 && (
            <p className="text-xs text-muted-foreground italic">
              Warnings on a brand-new project are normal — they're prompts to add a goal, spec, or
              decision when you're ready. You can open the dashboard now and fill them in later.
            </p>
          )}

          {issues.length > 0 && (
            <ul className="text-sm divide-y divide-border border border-border rounded">
              {visibleIssues.map((i, idx) => (
                <li key={`${i.rule}-${idx}`} className="px-3 py-2">
                  <span
                    className={
                      i.severity === "error"
                        ? "text-destructive font-mono text-xs mr-2"
                        : "text-muted-foreground font-mono text-xs mr-2"
                    }
                  >
                    {i.severity}
                  </span>
                  {i.message}
                </li>
              ))}
              {issues.length > 8 && (
                <li className="px-3 py-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="text-primary hover:underline"
                  >
                    {showAll
                      ? `Show fewer (collapse to first 8)`
                      : `Show all ${issues.length} issues`}
                  </button>
                </li>
              )}
            </ul>
          )}

          <div className="rounded border border-border bg-muted/40 p-3 text-xs space-y-2">
            <div className="font-semibold text-foreground">Next: wire Claude Code</div>
            <p className="text-muted-foreground">
              Run this once inside your repo to install the Cairndex hooks and MCP server into
              Claude Code's settings (idempotent — safe to re-run):
            </p>
            <pre className="bg-background border border-border rounded p-2 font-mono text-xs overflow-x-auto">
              <code>cairndex init</code>
            </pre>
            <p className="text-muted-foreground">
              After that, any Claude Code session inside that repo automatically reads/writes
              this vault. You can skip this for now and do it later — the GUI works either way.
            </p>
          </div>

          {fixableCount > 0 && (
            <button
              type="button"
              onClick={() => fix.mutate(registered.alias)}
              disabled={fix.isPending}
              className="px-3 py-2 rounded bg-muted text-muted-foreground text-sm disabled:opacity-50"
            >
              {fix.isPending ? "Fixing…" : `Auto-fix ${fixableCount} issue(s)`}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => navigate(`/p/${registered.alias}`)}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm"
        >
          Open dashboard →
        </button>
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "error"
      ? "bg-destructive/10 text-destructive"
      : tone === "warn"
        ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
        : "bg-green-500/10 text-green-700 dark:text-green-400";
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{children}</span>;
}
