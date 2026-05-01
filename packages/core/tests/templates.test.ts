import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { centralSharedPath, centralVaultManifestPath, projectManifestPath } from "../src/paths.js";
import { loadTemplate, renderTemplate } from "../src/templates.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-tpl-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("templates", () => {
  it("loads a template file from .cairndex/templates/", async () => {
    mkdirSync(join(tmp, ".cairndex/templates"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex/templates/spec.md"),
      "---\nid: {{id}}\ntitle: {{title}}\nstatus: active\ncreated: {{today}}\nupdated: {{today}}\n---\n\n## Current Statement\n{{statement}}\n",
    );
    const tpl = await loadTemplate(tmp, "spec");
    expect(tpl).toContain("{{id}}");
    expect(tpl).toContain("## Current Statement");
  });

  it("returns null when template missing", async () => {
    mkdirSync(join(tmp, ".cairndex/templates"), { recursive: true });
    const tpl = await loadTemplate(tmp, "spec");
    expect(tpl).toBeNull();
  });

  it("falls back to shared templates for central project roots", async () => {
    const vault = join(tmp, "Vault");
    const projectRoot = join(vault, "projects", "app");
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(join(centralSharedPath(vault), "templates"), { recursive: true });
    writeFileSync(centralVaultManifestPath(vault), "schemaVersion: 1\n", "utf8");
    writeFileSync(projectManifestPath(projectRoot), "id: app\n", "utf8");
    writeFileSync(join(centralSharedPath(vault), "templates", "spec.md"), "shared {{title}}\n");

    expect(await loadTemplate(projectRoot, "spec")).toBe("shared {{title}}\n");
  });

  it("renders {{var}} placeholders from a context map", () => {
    const out = renderTemplate("id: {{id}}\ntoday: {{today}}\nname: {{name}}\n", {
      id: "SPEC-001",
      today: "2026-04-30",
      name: "Login",
    });
    expect(out).toBe("id: SPEC-001\ntoday: 2026-04-30\nname: Login\n");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(renderTemplate("hello {{x}} {{y}}", { x: "world" })).toBe("hello world {{y}}");
  });
});
