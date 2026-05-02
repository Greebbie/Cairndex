import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import yaml from "js-yaml";
import {
  DEFAULT_USER_PREFERENCES,
  readUserPreferences,
  UserPreferencesSchema,
  writeUserPreferences,
} from "../src/userPrefs.js";

describe("UserPreferencesSchema", () => {
  it("provides safe defaults for every key", () => {
    const parsed = UserPreferencesSchema.parse({});
    expect(parsed.theme).toBe("system");
    expect(parsed.defaultFreshnessWarnDays).toBeNull();
    expect(parsed.autoAcceptConfidenceThreshold).toBeNull();
    expect(parsed.personalRulesPath).toBeNull();
  });

  it("rejects unknown keys", () => {
    const result = UserPreferencesSchema.safeParse({ surprise: true });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-range values", () => {
    expect(UserPreferencesSchema.safeParse({ autoAcceptConfidenceThreshold: 1.5 }).success).toBe(
      false,
    );
    expect(UserPreferencesSchema.safeParse({ defaultFreshnessWarnDays: -1 }).success).toBe(false);
  });
});

describe("read/writeUserPreferences", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function tempPath(): string {
    const d = mkdtempSync(join(tmpdir(), "cairn-userprefs-"));
    dirs.push(d);
    return join(d, "preferences.yaml");
  }

  it("readUserPreferences returns DEFAULT_USER_PREFERENCES when file is missing", async () => {
    const path = tempPath();
    const prefs = await readUserPreferences(path);
    expect(prefs).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("readUserPreferences returns defaults on malformed YAML", async () => {
    const path = tempPath();
    // write nonsense
    await writeUserPreferences({ theme: "dark" }, path);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, "not: : valid: yaml: !!", "utf8");
    const prefs = await readUserPreferences(path);
    expect(prefs).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("writeUserPreferences merges with existing values", async () => {
    const path = tempPath();
    await writeUserPreferences({ theme: "dark" }, path);
    const r2 = await writeUserPreferences({ defaultFreshnessWarnDays: 14 }, path);
    expect(r2.theme).toBe("dark");
    expect(r2.defaultFreshnessWarnDays).toBe(14);
  });

  it("writeUserPreferences validates and rejects bad input", async () => {
    const path = tempPath();
    await expect(
      writeUserPreferences({ theme: "neon" as unknown as "light" }, path),
    ).rejects.toThrow();
  });

  it("written file is valid YAML readable by other tools", async () => {
    const path = tempPath();
    await writeUserPreferences({ theme: "light", defaultFreshnessWarnDays: 21 }, path);
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf8");
    const parsed = yaml.load(raw) as Record<string, unknown>;
    expect(parsed.theme).toBe("light");
    expect(parsed.defaultFreshnessWarnDays).toBe(21);
  });
});
