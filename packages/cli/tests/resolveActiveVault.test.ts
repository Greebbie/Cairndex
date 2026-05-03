import { describe, expect, it } from "vitest";
import { resolveActiveVault } from "../src/utils/resolveActiveVault.js";

describe("resolveActiveVault", () => {
  it("explicit --vault wins, returns absolute path with source=opt", () => {
    const r = resolveActiveVault({
      optVaultRoot: "C:\\some\\vault",
      prefVaultRoot: "C:\\other\\remembered",
      vaultExists: () => true,
    });
    expect(r.source).toBe("opt");
    expect(r.vaultRoot).toMatch(/some.vault$/);
  });

  it("no opt, valid pref → source=pref", () => {
    const r = resolveActiveVault({
      prefVaultRoot: "C:\\remembered\\vault",
      vaultExists: () => true,
    });
    expect(r.source).toBe("pref");
    expect(r.vaultRoot).toMatch(/remembered.vault$/);
  });

  it("no opt, stale pref (vault no longer exists) → source=pref-stale, vaultRoot=null", () => {
    const r = resolveActiveVault({
      prefVaultRoot: "C:\\gone",
      vaultExists: () => false,
    });
    expect(r.source).toBe("pref-stale");
    expect(r.vaultRoot).toBeNull();
  });

  it("no opt, no pref → source=none, vaultRoot=null", () => {
    const r = resolveActiveVault({
      prefVaultRoot: null,
    });
    expect(r.source).toBe("none");
    expect(r.vaultRoot).toBeNull();
  });

  it("explicit opt wins even if pref points elsewhere and pref check would fail", () => {
    // Sanity: the function should NOT call vaultExists on the pref when opt is set,
    // so an "everything is missing" world still resolves opt. We verify by passing
    // a vaultExists that throws — opt path should never invoke it.
    const r = resolveActiveVault({
      optVaultRoot: "C:\\ok",
      prefVaultRoot: "C:\\stale",
      vaultExists: () => {
        throw new Error("should not be called");
      },
    });
    expect(r.source).toBe("opt");
  });
});
