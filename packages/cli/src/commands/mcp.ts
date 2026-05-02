import { existsSync } from "node:fs";
import {
  callMcpTool,
  createWatcher,
  defaultConfig,
  listMcpResources,
  listMcpTools,
  loadProjectConfig,
  readMcpResource,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface McpOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
}

export interface McpResult {
  exitCode: 0 | 1;
  message?: string;
}

function buildMcpServer(repoRoot: string): Server {
  const cfg = existsSync(`${vaultPath(repoRoot)}/config.yaml`)
    ? loadProjectConfig(repoRoot)
    : defaultConfig();

  const server = new Server(
    { name: "cairndex", version: "0.1.0" },
    {
      capabilities: {
        // listChanged: vault file changes will fire `notifications/resources/list_changed`
        // so subscribed clients can refetch the resource list.
        resources: { listChanged: true },
        tools: {},
      },
    },
  );

  // The MCP SDK's ServerResult is a discriminated union with several variants (including
  // an experimental `task` variant). Our handlers return shapes that match the standard
  // resource/tool variants exactly. The SDK validates them at runtime, but TypeScript's
  // structural assignability is over-strict against the union; cast through `unknown`.
  type AnyResult = Parameters<typeof server.setRequestHandler>[1];

  server.setRequestHandler(ListResourcesRequestSchema, (async () => {
    return await listMcpResources(repoRoot, cfg);
  }) as unknown as AnyResult);

  server.setRequestHandler(ReadResourceRequestSchema, (async (req: { params: { uri: string } }) => {
    return await readMcpResource(repoRoot, cfg, req.params.uri);
  }) as unknown as AnyResult);

  server.setRequestHandler(ListToolsRequestSchema, (async () => {
    return listMcpTools();
  }) as unknown as AnyResult);

  server.setRequestHandler(CallToolRequestSchema, (async (req: {
    params: { name: string; arguments?: unknown };
  }) => {
    return await callMcpTool(repoRoot, cfg, req.params.name, req.params.arguments ?? {});
  }) as unknown as AnyResult);

  return server;
}

export async function runMcp(opts: McpOptions): Promise<McpResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: missingVaultMessage(root),
    };
  }
  const server = buildMcpServer(root);
  const transport = new StdioServerTransport();
  // Stderr-only logging — stdout belongs to the MCP wire protocol.
  process.stderr.write(`cairndex MCP server starting on vault: ${root}\n`);
  await server.connect(transport);

  // Watch the vault and broadcast resources/list_changed notifications when nodes are
  // added/removed. We debounce by relying on the watcher's own debouncer.
  const cfg = existsSync(`${vaultPath(root)}/config.yaml`)
    ? loadProjectConfig(root)
    : defaultConfig();
  const watcher = createWatcher({
    repoRoot: root,
    cfg,
    onAdd: () => {
      void server.sendResourceListChanged().catch(() => {
        // Connection may have closed mid-write; non-fatal.
      });
    },
    onUnlink: () => {
      void server.sendResourceListChanged().catch(() => {
        // ignore
      });
    },
  });
  try {
    await watcher.start();
  } catch (e) {
    process.stderr.write(`watcher failed to start: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  // Block until the transport closes (client disconnects or stdin EOF). Without this,
  // bin.ts's `process.exit` would terminate the server immediately after connect().
  await new Promise<void>((resolveLoop) => {
    const stop = () => resolveLoop();
    transport.onclose = stop;
    process.stdin.once("end", stop);
    process.stdin.once("close", stop);
  });
  await watcher.stop().catch(() => {
    // ignore
  });
  return { exitCode: 0 };
}
