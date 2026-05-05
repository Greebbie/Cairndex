import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { SIGNALS_DIR, signalsPath } from "../src/paths.js";

describe("signalsPath", () => {
  it("returns vaultPath(root)/signals for a legacy repo (no central pointer)", () => {
    // For a legacy layout (no .cairndex-project.yaml pointer), vaultPath returns
    // join(root, ".cairndex"), so signalsPath should return join(root, ".cairndex", "signals").
    expect(signalsPath("/x/repo")).toBe(join("/x/repo", ".cairndex", SIGNALS_DIR));
  });

  it("exports SIGNALS_DIR as 'signals'", () => {
    expect(SIGNALS_DIR).toBe("signals");
  });
});
