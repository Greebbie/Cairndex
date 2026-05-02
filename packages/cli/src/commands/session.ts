import { existsSync } from "node:fs";
import {
  type SessionLogKind,
  appendToSession,
  defaultConfig,
  loadProjectConfig,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

interface BaseOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
}

function loadCfg(root: string) {
  return existsSync(`${vaultPath(root)}/config.yaml`) ? loadProjectConfig(root) : defaultConfig();
}

export interface SessionLogOptions extends BaseOptions {
  kind: SessionLogKind;
  text: string;
  agentName?: string;
}

export interface SessionLogResult {
  exitCode: 0 | 1;
  sessionId?: string;
  path?: string;
  section?: string;
  created?: boolean;
  message?: string;
}

export async function runSessionLog(opts: SessionLogOptions): Promise<SessionLogResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return { exitCode: 1, message: missingVaultMessage(root) };
  }
  if (!opts.text.trim()) {
    return { exitCode: 1, message: "session log: text is empty" };
  }
  const cfg = loadCfg(root);
  try {
    const r = await appendToSession({
      repoRoot: root,
      cfg,
      now: new Date(),
      kind: opts.kind,
      text: opts.text,
      ...(opts.agentName ? { agentName: opts.agentName } : {}),
    });
    return {
      exitCode: 0,
      sessionId: r.sessionId,
      path: r.path,
      section: r.section,
      created: r.created,
    };
  } catch (e) {
    return { exitCode: 1, message: e instanceof Error ? e.message : String(e) };
  }
}
