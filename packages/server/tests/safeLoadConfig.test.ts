import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "@cairndex/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safeLoadConfig } from "../src/lib/safeLoadConfig.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-slc-"));
  mkdirSync(join(tmp, ".cairndex"), { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("safeLoadConfig", () => {
  it("returns defaultConfig() when no config file exists", () => {
    const cfg = safeLoadConfig(tmp);
    expect(cfg).toEqual(defaultConfig());
  });

  it("returns a valid Config when config.yaml is well-formed", () => {
    writeFileSync(
      join(tmp, ".cairndex/config.yaml"),
      "schemaVersion: 1\nfreshness_warn_days: 60\n",
    );
    const cfg = safeLoadConfig(tmp);
    expect(cfg.freshness_warn_days).toBe(60);
  });

  it("returns defaultConfig() instead of throwing when config.yaml is corrupt", () => {
    writeFileSync(
      join(tmp, ".cairndex/config.yaml"),
      "schemaVersion: 999\ninvalid: !!js/function 'function(){return 1}'\n",
    );
    expect(() => safeLoadConfig(tmp)).not.toThrow();
    const cfg = safeLoadConfig(tmp);
    expect(cfg).toEqual(defaultConfig());
  });
});
