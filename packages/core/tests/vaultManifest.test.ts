import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  VaultManifestSchema,
  readVaultManifest,
  writeVaultManifest,
} from "../src/vaultManifest.js";

describe("vault manifest", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("readVaultManifest returns null when vault.yaml is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "cairn-vault-"));
    dirs.push(dir);
    expect(readVaultManifest(dir)).toBeNull();
  });

  it("writeVaultManifest + readVaultManifest round-trips a typed manifest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cairn-vault-"));
    dirs.push(dir);
    await writeVaultManifest(dir, {
      schemaVersion: 1,
      title: "Test Vault",
      created: "2026-05-02",
    });
    const m = readVaultManifest(dir);
    expect(m).not.toBeNull();
    expect(m?.title).toBe("Test Vault");
    expect(m?.schemaVersion).toBe(1);
    expect(VaultManifestSchema.safeParse(m).success).toBe(true);
  });

  it("readVaultManifest returns null on malformed YAML", () => {
    const dir = mkdtempSync(join(tmpdir(), "cairn-vault-"));
    dirs.push(dir);
    writeFileSync(join(dir, "vault.yaml"), "title: [unterminated", "utf8");
    expect(readVaultManifest(dir)).toBeNull();
  });

  it("VaultManifestSchema accepts the shape that runVaultInit writes", () => {
    const ok = VaultManifestSchema.safeParse({
      schemaVersion: 1,
      title: "Cairndex Vault",
      created: "2026-05-02",
    });
    expect(ok.success).toBe(true);
  });
});
