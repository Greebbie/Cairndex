import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI_BIN = join(__dirname, "..", "dist", "bin.cjs");

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-mcp-cli-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"), { recursive: true });
  writeFileSync(
    join(tmp, ".cairndex/index.md"),
    "---\nphase: implementing\nphase_since: 2026-04-30\nnext_action: 'do thing'\n---\n# Index\n",
  );
  writeFileSync(
    join(tmp, ".cairndex/specs/SPEC-001.md"),
    "---\nid: SPEC-001\ntitle: Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-02\n---\nspec body\n",
  );
  writeFileSync(join(tmp, ".cairndex/config.yaml"), "schemaVersion: 1\n");
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

async function exchange(
  vaultRoot: string,
  requests: Array<Record<string, unknown>>,
): Promise<JsonRpcResponse[]> {
  return await new Promise<JsonRpcResponse[]>((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_BIN, "mcp", "--vault", vaultRoot], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    let stdout = "";
    let stderr = "";
    const responses: JsonRpcResponse[] = [];
    let timer: NodeJS.Timeout | undefined;

    const finish = (err?: Error) => {
      if (timer) clearTimeout(timer);
      try {
        child.stdin.end();
      } catch {
        // ignore
      }
      child.kill();
      if (err) reject(err);
      else resolve(responses);
    };

    child.on("error", finish);
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });

    child.stdout.on("data", (d) => {
      stdout += String(d);
      const lines = stdout.split("\n");
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          responses.push(JSON.parse(line) as JsonRpcResponse);
          if (responses.length >= requests.length) {
            finish();
            return;
          }
        } catch (e) {
          finish(new Error(`bad JSON-RPC line: ${line}\nstderr: ${stderr}\n${(e as Error).message}`));
          return;
        }
      }
    });

    timer = setTimeout(
      () => finish(new Error(`MCP exchange timed out\nstderr: ${stderr}\nstdout: ${stdout}`)),
      10_000,
    );

    for (const req of requests) {
      child.stdin.write(`${JSON.stringify(req)}\n`);
    }
  });
}

const initialize = {
  jsonrpc: "2.0" as const,
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "vitest", version: "0.0.0" },
  },
};

describe("cairndex mcp (stdio)", () => {
  it("initializes and lists resources for a real vault", async () => {
    const responses = await exchange(tmp, [
      initialize,
      { jsonrpc: "2.0", id: 2, method: "resources/list" },
    ]);
    const init = responses.find((r) => r.id === 1);
    expect(init?.result).toBeDefined();
    const list = responses.find((r) => r.id === 2);
    expect(list?.result).toBeDefined();
    const result = list?.result as { resources: Array<{ uri: string }> };
    const uris = result.resources.map((r) => r.uri);
    expect(uris).toContain("cairndex://vault/index");
    expect(uris).toContain("cairndex://vault/specs/SPEC-001");
  }, 15_000);

  it("calls the context_pack tool and returns the rendered pack", async () => {
    const responses = await exchange(tmp, [
      initialize,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "context_pack", arguments: { task: "smoke" } },
      },
    ]);
    const call = responses.find((r) => r.id === 2);
    expect(call?.result).toBeDefined();
    const result = call?.result as { content: Array<{ type: string; text: string }> };
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("Context Pack: smoke");
  }, 15_000);

  it("advertises resources.listChanged in the initialize capabilities", async () => {
    const responses = await exchange(tmp, [initialize]);
    const init = responses.find((r) => r.id === 1);
    const result = init?.result as { capabilities: { resources?: { listChanged?: boolean } } };
    expect(result.capabilities.resources?.listChanged).toBe(true);
  }, 15_000);
});
