import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInsightPromote, runInsightPull } from "../src/commands/insight.js";

let tmp: string;
let home: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-ins-"));
  home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  process.env.CAIRNDEX_HOME = home;
  mkdirSync(join(home, "shared/insights"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/insights"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/changes"), { recursive: true });
});
afterEach(() => {
  Reflect.deleteProperty(process.env, "CAIRNDEX_HOME");
  rmSync(tmp, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("insight commands", () => {
  it("promote copies file to global and marks promoted_to_global", async () => {
    writeFileSync(
      join(tmp, ".cairndex/insights/INS-001-x.md"),
      "---\nid: INS-001\ntitle: X\nstatus: stable\ncreated: 2026-04-30\n---\n## Pattern\nfoo\n",
    );
    const r = await runInsightPromote({ cwd: tmp, id: "INS-001" });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(home, "shared/insights/INS-001-x.md"))).toBe(true);
    const projectAfter = readFileSync(join(tmp, ".cairndex/insights/INS-001-x.md"), "utf8");
    expect(projectAfter).toContain("promoted_to_global: true");
  });

  it("pull copies global insight into the current project", async () => {
    writeFileSync(
      join(home, "shared/insights/INS-007-y.md"),
      "---\nid: INS-007\ntitle: Y\nstatus: stable\ncreated: 2026-04-30\n---\n## Pattern\nbar\n",
    );
    const r = await runInsightPull({ cwd: tmp, id: "INS-007" });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(tmp, ".cairndex/insights/INS-007-y.md"))).toBe(true);
  });

  it("promote fails if insight not found", async () => {
    const r = await runInsightPromote({ cwd: tmp, id: "INS-999" });
    expect(r.exitCode).toBe(1);
  });
});
