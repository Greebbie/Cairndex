export interface LastSessionInfo {
  id: string;
  date: string;
  narrativeStatus: "empty" | "auto" | "confirmed";
  summary: string;
}

export interface ActiveTaskInfo {
  id: string;
  title: string;
  status: string;
  nextAction: string | null;
  ageDays: number; // days since the task's `updated` field
}

export interface WhyContextInfo {
  kind: "decision" | "insight";
  id: string;
  title: string;
}

export interface PendingMemoryInfo {
  count: number;
  titles: string[]; // up to 5 most recent
}

export interface ResumeView {
  lastSession: LastSessionInfo | null;
  activeTask: ActiveTaskInfo | null;
  whyContext: WhyContextInfo | null;
  suggestedNext: string | null;
  pendingMemory: PendingMemoryInfo;
  coverageFlags: string[]; // populated in Phase 5; empty for Phase 2
  builtAt: string; // ISO 8601
  sources: string[]; // absolute paths to files actually read
}
