import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ChangesSchema,
  ComposePackResponseSchema,
  DashboardSchema,
  InboxListSchema,
  IssueSchema,
  NodeListItemSchema,
  NodeResponseSchema,
  PackListSchema,
  PackResponseSchema,
  type Project,
  ProjectSchema,
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

export function useSync() {
  return useMutation({
    mutationFn: async (alias: string) => {
      const r = await fetch(`${API_BASE}/api/sync/${alias}`, { method: "POST" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
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
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["inbox", vars.alias] });
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
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["inbox", vars.alias] }),
  });
}

export type { Project };
