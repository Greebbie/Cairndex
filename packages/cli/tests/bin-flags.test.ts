import { describe, expect, it } from "vitest";

describe("bin.ts CLI flag declarations", () => {
  async function loadProgram() {
    process.env.CAIRNDEX_SKIP_PARSE = "1";
    const mod = await import("../src/bin.js");
    return mod.program;
  }

  it("emit claude-md declares --project exactly once", async () => {
    const program = await loadProgram();
    const emit = program.commands.find((c) => c.name() === "emit");
    expect(emit).toBeDefined();
    const claudeMd = emit?.commands.find((c) => c.name() === "claude-md");
    expect(claudeMd).toBeDefined();
    const projectFlags = claudeMd!.options.filter((o) => o.long === "--project");
    expect(projectFlags).toHaveLength(1);
  });

  it("consolidate accepts --project so it can target a central project", async () => {
    const program = await loadProgram();
    const consolidate = program.commands.find((c) => c.name() === "consolidate");
    expect(consolidate).toBeDefined();
    const projectFlags = consolidate!.options.filter((o) => o.long === "--project");
    expect(projectFlags).toHaveLength(1);
  });
});
