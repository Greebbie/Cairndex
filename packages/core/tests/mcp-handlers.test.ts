import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  callMcpTool,
  listMcpResources,
  listMcpTools,
  readMcpResource,
} from "../src/mcp/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-mcp-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"), { recursive: true });
  writeFileSync(
    join(tmp, ".cairndex/index.md"),
    "---\nphase: implementing\nphase_since: 2026-04-30\nnext_action: 'do thing'\n---\n# Index\n",
  );
  writeFileSync(
    join(tmp, ".cairndex/specs/SPEC-001.md"),
    "---\nid: SPEC-001\ntitle: Memory Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-02\n---\nspec body\n",
  );
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("listMcpResources", () => {
  it("includes the singletons (index, active-context, memory-health)", async () => {
    const r = await listMcpResources(tmp, defaultConfig());
    const uris = r.resources.map((res) => res.uri);
    expect(uris).toContain("cairndex://vault/index");
    expect(uris).toContain("cairndex://vault/active-context");
    expect(uris).toContain("cairndex://vault/memory-health");
  });

  it("includes a per-folder list URI and a per-node URI for each existing node", async () => {
    const r = await listMcpResources(tmp, defaultConfig());
    const uris = r.resources.map((res) => res.uri);
    expect(uris).toContain("cairndex://vault/specs");
    expect(uris).toContain("cairndex://vault/specs/SPEC-001");
  });
});

describe("readMcpResource", () => {
  it("returns index.md content for cairndex://vault/index", async () => {
    const r = await readMcpResource(tmp, defaultConfig(), "cairndex://vault/index");
    expect(r.contents[0]?.mimeType).toBe("text/markdown");
    expect(r.contents[0]?.text).toContain("# Index");
  });

  it("returns active-context as JSON", async () => {
    const r = await readMcpResource(tmp, defaultConfig(), "cairndex://vault/active-context");
    expect(r.contents[0]?.mimeType).toBe("application/json");
    const parsed = JSON.parse(r.contents[0]?.text ?? "{}");
    expect(parsed.phase).toBe("implementing");
  });

  it("returns memory-health as JSON", async () => {
    const r = await readMcpResource(tmp, defaultConfig(), "cairndex://vault/memory-health");
    expect(r.contents[0]?.mimeType).toBe("application/json");
    const parsed = JSON.parse(r.contents[0]?.text ?? "{}");
    expect(parsed.counts).toBeDefined();
  });

  it("returns a node folder listing for cairndex://vault/specs", async () => {
    const r = await readMcpResource(tmp, defaultConfig(), "cairndex://vault/specs");
    const parsed = JSON.parse(r.contents[0]?.text ?? "{}") as { nodes: Array<{ id: string }> };
    expect(parsed.nodes.some((n) => n.id === "SPEC-001")).toBe(true);
  });

  it("returns a single-node markdown for cairndex://vault/specs/SPEC-001", async () => {
    const r = await readMcpResource(tmp, defaultConfig(), "cairndex://vault/specs/SPEC-001");
    expect(r.contents[0]?.mimeType).toBe("text/markdown");
    expect(r.contents[0]?.text).toContain("Memory Cockpit");
  });

  it("throws for unknown URI", async () => {
    await expect(
      readMcpResource(tmp, defaultConfig(), "cairndex://vault/specs/SPEC-999"),
    ).rejects.toThrow();
    await expect(readMcpResource(tmp, defaultConfig(), "cairndex://wrong/path")).rejects.toThrow();
  });
});

describe("listMcpTools", () => {
  it("declares context_pack, propose_memory_update, inbox_list", () => {
    const r = listMcpTools();
    const names = r.tools.map((t) => t.name);
    expect(names).toContain("context_pack");
    expect(names).toContain("propose_memory_update");
    expect(names).toContain("inbox_list");
  });

  it("each tool has a JSON Schema input schema", () => {
    const r = listMcpTools();
    for (const t of r.tools) {
      expect(t.inputSchema).toBeDefined();
      expect((t.inputSchema as Record<string, unknown>).type).toBe("object");
    }
  });
});

describe("callMcpTool — context_pack", () => {
  it("returns a markdown text content with the rendered pack", async () => {
    const r = await callMcpTool(tmp, defaultConfig(), "context_pack", {
      task: "fix web e2e",
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.type).toBe("text");
    expect(r.content[0]?.text).toContain("Context Pack: fix web e2e");
  });
});

describe("callMcpTool — propose_memory_update", () => {
  it("creates a proposal and returns the id + duplicateOf", async () => {
    const r = await callMcpTool(tmp, defaultConfig(), "propose_memory_update", {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "shiny new\n",
      summary: "tighten",
      reason: "clarity",
      provenance: { createdBy: "claude", session: "s" },
    });
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toMatch(/PROP-/);
  });
});

describe("callMcpTool — inbox_list", () => {
  it("returns a JSON document with pending/accepted/rejected/duplicate", async () => {
    const r = await callMcpTool(tmp, defaultConfig(), "inbox_list", {});
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0]?.text ?? "{}");
    expect(parsed).toHaveProperty("pending");
    expect(parsed).toHaveProperty("accepted");
    expect(parsed).toHaveProperty("rejected");
  });
});

describe("callMcpTool — task_switch / task_complete / phase_set (workflow state)", () => {
  function writeTask(id: string, status: string): void {
    mkdirSync(join(tmp, ".cairndex", "tasks"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex", "tasks", `${id}.md`),
      `---\nid: ${id}\ntitle: ${id} title\nstatus: ${status}\ncreated: 2026-04-01\nupdated: 2026-04-01\n---\nbody\n`,
    );
  }

  it("task_switch promotes the target and demotes the previous in_progress", async () => {
    writeTask("TASK-001", "in_progress");
    writeTask("TASK-002", "pending");
    const r = await callMcpTool(tmp, defaultConfig(), "task_switch", { taskId: "TASK-002" });
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0]?.text ?? "{}");
    expect(parsed.summary).toMatch(/TASK-002/);
    expect(parsed.changed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "TASK-001", to: "pending" }),
        expect.objectContaining({ id: "TASK-002", to: "in_progress" }),
      ]),
    );
  });

  it("task_complete with no taskId completes the active context current task", async () => {
    writeTask("TASK-007", "in_progress");
    const r = await callMcpTool(tmp, defaultConfig(), "task_complete", {});
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0]?.text ?? "{}");
    expect(parsed.summary).toMatch(/task complete → TASK-007/);
  });

  it("phase_set reports from→to and bumps phase_since", async () => {
    const r = await callMcpTool(tmp, defaultConfig(), "phase_set", { phase: "testing" });
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0]?.text ?? "{}");
    expect(parsed.from).toBe("implementing");
    expect(parsed.to).toBe("testing");
    expect(parsed.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("listMcpTools advertises the workflow tools", () => {
    const tools = listMcpTools().tools.map((t) => t.name);
    expect(tools).toContain("task_switch");
    expect(tools).toContain("task_complete");
    expect(tools).toContain("phase_set");
  });
});

describe("callMcpTool — error handling", () => {
  it("returns isError:true for unknown tool", async () => {
    const r = await callMcpTool(tmp, defaultConfig(), "nope", {});
    expect(r.isError).toBe(true);
  });

  it("returns isError:true for malformed args", async () => {
    const r = await callMcpTool(tmp, defaultConfig(), "propose_memory_update", {
      // missing required fields
      proposalType: "update",
    });
    expect(r.isError).toBe(true);
  });
});
