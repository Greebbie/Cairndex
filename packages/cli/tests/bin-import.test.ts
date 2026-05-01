import { afterAll, beforeAll, describe, expect, it } from "vitest";

let originalEnv: string | undefined;

beforeAll(() => {
  originalEnv = process.env.CAIRNDEX_SKIP_PARSE;
  process.env.CAIRNDEX_SKIP_PARSE = "1";
});

afterAll(() => {
  if (originalEnv === undefined) Reflect.deleteProperty(process.env, "CAIRNDEX_SKIP_PARSE");
  else process.env.CAIRNDEX_SKIP_PARSE = originalEnv;
});

describe("bin module", () => {
  it("imports without invoking parseAsync, exposes a Command program", async () => {
    const mod = await import("../src/bin.js");
    expect(mod.program).toBeDefined();
    const program = mod.program;
    // Commander Command instance has a name() accessor
    expect(typeof program.name).toBe("function");
    expect(program.name()).toBe("cairndex");
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("init");
    expect(commandNames).toContain("doctor");
    expect(commandNames).toContain("sync");
    expect(commandNames).toContain("ui");
    expect(commandNames).toContain("insight");
  });
});
