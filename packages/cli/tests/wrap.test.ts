import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWrap } from "../src/commands/wrap.js";

// We capture stdout without actually running the interactive close-out flow.
// runCloseOut is mocked to avoid readline / stdin interaction in tests.
vi.mock("../src/commands/closeout.js", () => ({
  runCloseOut: vi.fn().mockResolvedValue(undefined),
}));

import { runCloseOut } from "../src/commands/closeout.js";

describe("runWrap", () => {
  const dirs: string[] = [];
  let stdoutChunks: string[] = [];
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    stdoutChunks = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown): boolean => {
      stdoutChunks.push(String(chunk));
      return true;
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function capturedOutput(): string {
    return stdoutChunks.join("");
  }

  function seedRepo(): { repo: string; vault: string } {
    const repo = mkdtempSync(join(tmpdir(), "cairn-wrap-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "sessions"), { recursive: true });
    writeFileSync(join(vault, "index.md"), "# Index\n", "utf8");
    return { repo, vault };
  }

  function writeSession(
    vault: string,
    name: string,
    narrativeStatus: "empty" | "confirmed",
  ): void {
    writeFileSync(
      join(vault, "sessions", name),
      `---\nid: ${name.replace(/\.md$/, "")}\nnarrative_status: ${narrativeStatus}\n---\n`,
      "utf8",
    );
  }

  // ── JSON mode ────────────────────────────────────────────────────────────────

  it("--json returns openCloseOut action when latest session is unconfirmed", async () => {
    const { repo, vault } = seedRepo();
    writeSession(vault, "2026-05-05-2200.md", "empty");

    await runWrap({ cwd: repo, json: true });

    const parsed = JSON.parse(capturedOutput());
    expect(parsed.action).toBe("openCloseOut");
    expect(parsed.sessionId).toBe("2026-05-05-2200");
  });

  it("--json returns nothingToClose when latest session is confirmed", async () => {
    const { repo, vault } = seedRepo();
    writeSession(vault, "2026-05-05-2200.md", "confirmed");

    await runWrap({ cwd: repo, json: true });

    const parsed = JSON.parse(capturedOutput());
    expect(parsed.action).toBe("nothingToClose");
  });

  it("--json returns nothingToClose when no sessions exist", async () => {
    const { repo } = seedRepo();

    await runWrap({ cwd: repo, json: true });

    const parsed = JSON.parse(capturedOutput());
    expect(parsed.action).toBe("nothingToClose");
  });

  it("--json picks the latest session when multiple exist", async () => {
    const { repo, vault } = seedRepo();
    // Older session confirmed, newer session empty — should detect newer as unconfirmed.
    writeSession(vault, "2026-05-04-1000.md", "confirmed");
    writeSession(vault, "2026-05-05-2300.md", "empty");

    await runWrap({ cwd: repo, json: true });

    const parsed = JSON.parse(capturedOutput());
    expect(parsed.action).toBe("openCloseOut");
    expect(parsed.sessionId).toBe("2026-05-05-2300");
  });

  // ── TTY / interactive mode ───────────────────────────────────────────────────

  it("non-JSON mode prints 'Nothing to close out' when latest session is confirmed", async () => {
    const { repo, vault } = seedRepo();
    writeSession(vault, "2026-05-05-2200.md", "confirmed");

    await runWrap({ cwd: repo });

    expect(capturedOutput()).toMatch(/Nothing to close out/i);
    expect(runCloseOut).not.toHaveBeenCalled();
  });

  it("non-JSON mode prints 'Nothing to close out' when no sessions exist", async () => {
    const { repo } = seedRepo();

    await runWrap({ cwd: repo });

    expect(capturedOutput()).toMatch(/Nothing to close out/i);
    expect(runCloseOut).not.toHaveBeenCalled();
  });

  it("non-JSON mode delegates to runCloseOut when latest session is unconfirmed", async () => {
    const { repo, vault } = seedRepo();
    writeSession(vault, "2026-05-05-2200.md", "empty");

    await runWrap({ cwd: repo });

    expect(runCloseOut).toHaveBeenCalledOnce();
    const callArg = (runCloseOut as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.session).toBe("2026-05-05-2200");
    expect(callArg.cwd).toBe(repo);
  });

  it("non-JSON mode passes vaultRoot through to runCloseOut", async () => {
    const { repo, vault } = seedRepo();
    writeSession(vault, "2026-05-05-2200.md", "empty");

    // vaultRoot points at the repo itself (which contains .cairndex/) so that
    // resolveMemoryRoot resolves to `repo` and findLatestUnconfirmedSession can
    // locate the session we seeded.
    await runWrap({ cwd: repo, vaultRoot: repo });

    expect(runCloseOut).toHaveBeenCalledOnce();
    const callArg = (runCloseOut as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.vaultRoot).toBe(repo);
    expect(callArg.cwd).toBe(repo);
  });
});
