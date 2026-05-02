import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultConfig,
  folderForType,
  listAllTypes,
  loadProjectConfig,
  mergeConfig,
} from "../src/config.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("config", () => {
  it("returns default config when no file present", () => {
    const cfg = defaultConfig();
    expect(cfg.folders.specs).toBe("specs");
    expect(cfg.ids.spec).toBe("SPEC");
    expect(cfg.freshness_warn_days).toBe(30);
  });

  it("loads project config and merges over defaults", () => {
    mkdirSync(join(tmp, ".cairndex"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex", "config.yaml"),
      "schemaVersion: 1\nfolders:\n  specs: requirements\nids:\n  spec: REQ\n",
      "utf8",
    );
    const cfg = loadProjectConfig(tmp);
    expect(cfg.folders.specs).toBe("requirements");
    expect(cfg.ids.spec).toBe("REQ");
    expect(cfg.folders.decisions).toBe("decisions"); // default kept
  });

  it("merges arrays of required_frontmatter by replacement", () => {
    const merged = mergeConfig(defaultConfig(), {
      required_frontmatter: { spec: ["id", "title"] },
    });
    expect(merged.required_frontmatter.spec).toEqual(["id", "title"]);
    expect(merged.required_frontmatter.decision).toEqual(["id", "title", "status", "created"]);
  });

  it("listAllTypes returns 10 built-ins for default config, in stable order", () => {
    const types = listAllTypes(defaultConfig());
    expect(types).toHaveLength(10);
    expect(types.every((t) => t.builtIn)).toBe(true);
    expect(types[0]?.name).toBe("goal");
    expect(types.find((t) => t.name === "spec")?.folder).toBe("specs");
    expect(types.find((t) => t.name === "spec")?.idPrefix).toBe("SPEC");
  });

  it("listAllTypes appends user-defined types after built-ins, alphabetical", () => {
    const cfg = mergeConfig(defaultConfig(), {
      node_types: {
        risk: { folder: "risks", id_prefix: "RISK" },
        experiment: { folder: "experiments", id_prefix: "EXP" },
      },
    });
    const types = listAllTypes(cfg);
    expect(types).toHaveLength(12);
    const customs = types.filter((t) => !t.builtIn);
    expect(customs.map((t) => t.name)).toEqual(["experiment", "risk"]);
    expect(customs[0]?.folder).toBe("experiments");
    expect(customs[0]?.idPrefix).toBe("EXP");
  });

  it("folderForType resolves built-ins and custom types, returns null for unknown", () => {
    const cfg = mergeConfig(defaultConfig(), {
      node_types: { experiment: { folder: "experiments", id_prefix: "EXP" } },
    });
    expect(folderForType(cfg, "spec")).toBe("specs");
    expect(folderForType(cfg, "experiment")).toBe("experiments");
    expect(folderForType(cfg, "nonexistent-bogus")).toBe(null);
  });

  it("rejects config with wrong schemaVersion", () => {
    mkdirSync(join(tmp, ".cairndex"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex", "config.yaml"), "schemaVersion: 99\n", "utf8");
    expect(() => loadProjectConfig(tmp)).toThrow(/schemaVersion/);
  });
});
