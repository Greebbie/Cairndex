import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ChangesSchema,
  ClaudeCodeStatusSchema,
  type CloseOutAnswers,
  CloseOutDraftResponseSchema,
  CodexStatusSchema,
  ComposePackResponseSchema,
  DashboardSchema,
  HandoffRepairResultSchema,
  ImplementationLineSchema,
  InboxListSchema,
  IntentResponseSchema,
  IssueSchema,
  LastTurnSummaryResponseSchema,
  NodeListItemSchema,
  NodeResponseSchema,
  PackListSchema,
  PackResponseSchema,
  type Project,
  ProjectSchema,
  ResumeResponseSchema,
  SubmitCloseOutResultSchema,
  UserPreferencesSchema,
  VaultOverviewSchema,
} from "./types.js";

const API_BASE = ""; // proxied by Vite in dev; absolute in prod from same origin

async function jsonFetch<T>(path: string, schema: z.ZodSchema<T>, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init.body !== null;
  const r = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const data = await r.json();
  return schema.parse(data);
}

async function readErrorMessage(r: Response): Promise<string> {
  // Server returns `{ error: "..." }` for known-cause failures (see server inbox routes).
  // Fall back to raw body, then to status line.
  const text = await r.text().catch(() => "");
  if (text) {
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      if (typeof parsed.error === "string") return parsed.error;
    } catch {
      // Body wasn't JSON — surface the raw text.
    }
    return text;
  }
  return `${r.status} ${r.statusText}`;
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => jsonFetch("/api/projects", z.array(ProjectSchema)),
  });
}

export function useVaultOverview(alias: string | undefined) {
  return useQuery({
    queryKey: ["vault", alias],
    queryFn: () => jsonFetch(`/api/vault/${alias}`, VaultOverviewSchema),
    enabled: !!alias,
  });
}

export function useNode(
  alias: string | undefined,
  type: string | undefined,
  id: string | undefined,
) {
  return useQuery({
    queryKey: ["node", alias, type, id],
    queryFn: () => jsonFetch(`/api/vault/${alias}/${type}/${id}`, NodeResponseSchema),
    enabled: !!alias && !!type && !!id,
  });
}

export function useNodesByType(alias: string | undefined, type: string | undefined) {
  return useQuery({
    queryKey: ["nodesByType", alias, type],
    queryFn: () => jsonFetch(`/api/vault/${alias}/${type}`, z.array(NodeListItemSchema)),
    enabled: !!alias && !!type,
  });
}

export function useChanges(alias: string | undefined) {
  return useQuery({
    queryKey: ["changes", alias],
    queryFn: () => jsonFetch(`/api/changes/${alias}`, ChangesSchema),
    enabled: !!alias,
  });
}

export function useDoctor(alias: string | undefined) {
  return useQuery({
    queryKey: ["doctor", alias],
    queryFn: () => jsonFetch(`/api/doctor/${alias}`, z.object({ issues: z.array(IssueSchema) })),
    enabled: !!alias,
  });
}

export function useConfig(alias: string | undefined, scope: "project" | "global") {
  return useQuery({
    queryKey: ["config", alias, scope],
    queryFn: () => jsonFetch(`/api/config/${alias}/${scope}`, z.record(z.unknown())),
    enabled: !!alias,
  });
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      alias: string;
      scope: "project" | "global";
      data: Record<string, unknown>;
    }) => {
      const r = await fetch(`${API_BASE}/api/config/${input.alias}/${input.scope}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["config", vars.alias, vars.scope] }),
  });
}

export function useFix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alias: string) => {
      const r = await fetch(`${API_BASE}/api/doctor/${alias}/fix`, { method: "POST" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    onSuccess: (_, alias) => {
      qc.invalidateQueries({ queryKey: ["doctor", alias] });
      qc.invalidateQueries({ queryKey: ["vault", alias] });
    },
  });
}

export function useDashboard(alias: string | undefined) {
  return useQuery({
    queryKey: ["dashboard", alias],
    queryFn: () => jsonFetch(`/api/vault/${alias}/dashboard`, DashboardSchema),
    enabled: !!alias,
  });
}

export function useRepairHandoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      alias: string;
      taskId?: string;
      createTaskTitle?: string;
      nextAction?: string;
      dryRun?: boolean;
    }) => {
      const payload: Record<string, unknown> = {};
      if (input.taskId !== undefined) payload.taskId = input.taskId;
      if (input.createTaskTitle !== undefined) payload.createTaskTitle = input.createTaskTitle;
      if (input.nextAction !== undefined) payload.nextAction = input.nextAction;
      if (input.dryRun !== undefined) payload.dryRun = input.dryRun;
      const r = await fetch(`${API_BASE}/api/vault/${input.alias}/handoff/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await readErrorMessage(r));
      return HandoffRepairResultSchema.parse(await r.json());
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["dashboard", vars.alias] });
      qc.invalidateQueries({ queryKey: ["resume", vars.alias] });
      qc.invalidateQueries({ queryKey: ["packs", vars.alias] });
      qc.invalidateQueries({ queryKey: ["vault", vars.alias] });
      qc.invalidateQueries({ queryKey: ["nodesByType", vars.alias, "task"] });
    },
  });
}

export function useImplementationLine(alias: string | undefined) {
  return useQuery({
    queryKey: ["implementation", alias],
    queryFn: () => jsonFetch(`/api/vault/${alias}/implementation`, ImplementationLineSchema),
    enabled: !!alias,
  });
}

export function useLastTurnSummary(alias: string | undefined) {
  return useQuery({
    queryKey: ["last-turn-summary", alias],
    queryFn: () =>
      jsonFetch(`/api/vault/${alias}/last-turn-summary`, LastTurnSummaryResponseSchema),
    enabled: !!alias,
  });
}

export function useIntent(alias: string | undefined) {
  return useQuery({
    queryKey: ["intent", alias],
    queryFn: () => jsonFetch(`/api/vault/${alias}/intent`, IntentResponseSchema),
    enabled: !!alias,
    // Intent is short-lived (per-turn); keep responses fresh but rely on SSE for true liveness.
    staleTime: 5_000,
  });
}

export function useResume(alias: string | undefined) {
  return useQuery({
    queryKey: ["resume", alias],
    queryFn: () => jsonFetch(`/api/vault/${alias}/resume`, ResumeResponseSchema),
    enabled: !!alias,
    // Resume is built from disk reads; 30s cache is safe — SSE invalidation
    // handles the truly-live updates if the server pushes them.
    staleTime: 30_000,
  });
}

/**
 * Fetch the close-out draft for a specific session — prefilled heuristics from
 * the server (last-turn summary + any existing session narrative). Always
 * re-fetches when shown (staleTime: 0) so the user sees fresh data even if the
 * card was previously mounted and the session changed.
 */
export function useCloseOutDraft(alias: string, sessionId: string | null) {
  return useQuery({
    queryKey: ["vault", alias, "closeout", "draft", sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error("sessionId required");
      const r = await fetch(
        `/api/vault/${alias}/closeout/draft?sessionId=${encodeURIComponent(sessionId)}`,
      );
      if (!r.ok) {
        if (r.status === 404) throw new Error(`unknown vault: ${alias}`);
        if (r.status === 400) throw new Error("bad request");
        throw new Error(`draft fetch failed: ${r.statusText}`);
      }
      const json = await r.json();
      return CloseOutDraftResponseSchema.parse(json);
    },
    enabled: !!sessionId,
    staleTime: 0, // always re-fetch when shown
  });
}

/**
 * Submit the confirmed close-out answers for a session. On success, invalidates
 * the resume query (dashboard reflects the new confirmed state) and the closeout
 * draft query (re-opening the card sees fresh data).
 */
export function useSubmitCloseOut(alias: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      answers: CloseOutAnswers;
    }) => {
      const r = await fetch(`/api/vault/${alias}/closeout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(`submit failed: ${r.statusText}${text ? ` — ${text}` : ""}`);
      }
      const json = await r.json();
      return SubmitCloseOutResultSchema.parse(json);
    },
    onSuccess: () => {
      // Invalidate resume so the dashboard refetches with the new confirmed state.
      // Key MUST match useResume's queryKey shape: ["resume", alias].
      qc.invalidateQueries({ queryKey: ["resume", alias] });
      // Also invalidate the draft query so re-opening the card sees fresh data.
      qc.invalidateQueries({ queryKey: ["vault", alias, "closeout"] });
    },
  });
}

export function useUserPreferences() {
  return useQuery({
    queryKey: ["user-preferences"],
    queryFn: () => jsonFetch("/api/user/preferences", UserPreferencesSchema),
  });
}

export function useUpdateUserPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const r = await fetch(`${API_BASE}/api/user/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-preferences"] }),
  });
}

export function useClaudeCodeStatus(alias: string | undefined) {
  return useQuery({
    queryKey: ["claude-code-status", alias],
    queryFn: () => jsonFetch(`/api/projects/${alias}/claude-code-status`, ClaudeCodeStatusSchema),
    enabled: !!alias,
  });
}

export function useWireClaudeCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alias: string) => {
      const r = await fetch(`${API_BASE}/api/projects/${alias}/claude-code-wire`, {
        method: "POST",
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    onSuccess: (_, alias) => {
      qc.invalidateQueries({ queryKey: ["claude-code-status", alias] });
    },
  });
}

export function useCodexStatus(alias: string | undefined) {
  return useQuery({
    queryKey: ["codex-status", alias],
    queryFn: () => jsonFetch(`/api/projects/${alias}/codex-status`, CodexStatusSchema),
    enabled: !!alias,
  });
}

export function useWireCodex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alias: string) => {
      const r = await fetch(`${API_BASE}/api/projects/${alias}/codex-wire`, {
        method: "POST",
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return CodexStatusSchema.parse(await r.json());
    },
    onSuccess: (_, alias) => {
      qc.invalidateQueries({ queryKey: ["codex-status", alias] });
    },
  });
}

export function usePack(alias: string | undefined, packId: string | undefined) {
  return useQuery({
    queryKey: ["pack", alias, packId],
    queryFn: () => jsonFetch(`/api/vault/${alias}/pack/${packId}`, PackResponseSchema),
    enabled: !!alias && !!packId,
  });
}

export function usePacks(alias: string | undefined) {
  return useQuery({
    queryKey: ["packs", alias],
    queryFn: () => jsonFetch(`/api/vault/${alias}/packs`, PackListSchema),
    enabled: !!alias,
  });
}

export function useComposePack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { alias: string; task?: string; budget?: number }) => {
      const payload: Record<string, unknown> = {};
      if (input.task !== undefined) payload.task = input.task;
      if (input.budget !== undefined) payload.budget = input.budget;
      const r = await fetch(`${API_BASE}/api/vault/${input.alias}/pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return ComposePackResponseSchema.parse(await r.json());
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["packs", vars.alias] });
      qc.invalidateQueries({ queryKey: ["dashboard", vars.alias] });
    },
  });
}

export function useInbox(alias: string | undefined) {
  return useQuery({
    queryKey: ["inbox", alias],
    queryFn: () => jsonFetch(`/api/vault/${alias}/inbox`, InboxListSchema),
    enabled: !!alias,
  });
}

export function useAcceptProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { alias: string; proposalId: string }) => {
      const r = await fetch(
        `${API_BASE}/api/vault/${input.alias}/inbox/${input.proposalId}/accept`,
        { method: "POST" },
      );
      if (!r.ok) throw new Error(await readErrorMessage(r));
      return r.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["inbox", vars.alias] });
      qc.invalidateQueries({ queryKey: ["dashboard", vars.alias] });
      qc.invalidateQueries({ queryKey: ["vault", vars.alias] });
    },
  });
}

export function useTypes(alias: string | undefined) {
  return useQuery({
    queryKey: ["types", alias],
    queryFn: () =>
      jsonFetch(
        `/api/vault/${alias}/types`,
        z.object({
          types: z.array(
            z.object({
              name: z.string(),
              folder: z.string(),
              idPrefix: z.string(),
              builtIn: z.boolean(),
            }),
          ),
        }),
      ),
    enabled: !!alias,
  });
}

export function useRules(alias: string | undefined) {
  return useQuery({
    queryKey: ["rules", alias],
    queryFn: () =>
      jsonFetch(
        `/api/vault/${alias}/rules`,
        z.object({
          rules: z.array(z.object({ name: z.string(), size: z.number(), updated: z.string() })),
          dir: z.string(),
        }),
      ),
    enabled: !!alias,
  });
}

export function useRule(alias: string | undefined, name: string | undefined) {
  return useQuery({
    queryKey: ["rule", alias, name],
    queryFn: () =>
      jsonFetch(
        `/api/vault/${alias}/rules/${name}`,
        z.object({ name: z.string(), content: z.string() }),
      ),
    enabled: !!alias && !!name,
  });
}

export function useSaveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { alias: string; name: string; content: string }) => {
      const r = await fetch(`${API_BASE}/api/vault/${input.alias}/rules/${input.name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.content }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `${r.status} ${r.statusText}`);
      }
      return r.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["rules", vars.alias] });
      qc.invalidateQueries({ queryKey: ["rule", vars.alias, vars.name] });
    },
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { alias: string; name: string }) => {
      const r = await fetch(`${API_BASE}/api/vault/${input.alias}/rules/${input.name}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `${r.status} ${r.statusText}`);
      }
      return r.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["rules", vars.alias] });
    },
  });
}

export function useInitVault() {
  return useMutation({
    mutationFn: async (input: { path: string; title?: string }) => {
      const r = await fetch(`${API_BASE}/api/vault/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `${r.status} ${r.statusText}`);
      }
      return (await r.json()) as { vaultRoot: string };
    },
  });
}

export function useRegisterProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      vault: string;
      project?: string;
      repo: string;
      alias?: string;
      title?: string;
    }) => {
      const r = await fetch(`${API_BASE}/api/projects/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `${r.status} ${r.statusText}`);
      }
      return (await r.json()) as {
        alias: string;
        projectId: string | null;
        projectRoot: string;
        vaultRoot: string;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

/**
 * Workflow-state mutations: task switch / complete and phase set. These hit the
 * direct-mutation routes in `packages/server/src/routes/workflow.ts` (no inbox
 * round-trip — workflow state advancement is too frequent for propose/accept).
 *
 * On success, invalidate `dashboard` (project state changes) and `vault` (counts
 * by status change) so the UI reflects the new state without a manual refresh.
 */
export function useTaskSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { alias: string; taskId: string }) => {
      const r = await fetch(`${API_BASE}/api/vault/${input.alias}/task/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: input.taskId }),
      });
      if (!r.ok) throw new Error(await readErrorMessage(r));
      return r.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["dashboard", vars.alias] });
      qc.invalidateQueries({ queryKey: ["vault", vars.alias] });
      qc.invalidateQueries({ queryKey: ["nodesByType", vars.alias, "task"] });
    },
  });
}

export function useTaskComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { alias: string; taskId?: string }) => {
      const body = input.taskId ? { taskId: input.taskId } : {};
      const r = await fetch(`${API_BASE}/api/vault/${input.alias}/task/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await readErrorMessage(r));
      return r.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["dashboard", vars.alias] });
      qc.invalidateQueries({ queryKey: ["vault", vars.alias] });
      qc.invalidateQueries({ queryKey: ["nodesByType", vars.alias, "task"] });
    },
  });
}

export function usePhaseSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { alias: string; phase: string }) => {
      const r = await fetch(`${API_BASE}/api/vault/${input.alias}/phase/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: input.phase }),
      });
      if (!r.ok) throw new Error(await readErrorMessage(r));
      return r.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["dashboard", vars.alias] });
      qc.invalidateQueries({ queryKey: ["vault", vars.alias] });
    },
  });
}

export function useRejectProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { alias: string; proposalId: string; reason: string }) => {
      const r = await fetch(
        `${API_BASE}/api/vault/${input.alias}/inbox/${input.proposalId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: input.reason }),
        },
      );
      if (!r.ok) throw new Error(await readErrorMessage(r));
      return r.json();
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["inbox", vars.alias] }),
  });
}

export type { Project };
