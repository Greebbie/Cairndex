import { describe, it, expect, afterEach, vi } from "vitest";
import { rmSync, promises as fs } from "node:fs";
import { join } from "node:path";
import { runCloseOut } from "../src/commands/closeout.js";
import { seedFixture } from "../../core/tests/_utils/fixture.js";

describe("cairndex closeout", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("--json prints the prefilled draft and exits without writing", async () => {
    root = seedFixture({
      sessions: [
        {
          id: "2026-05-05-1200",
          summary: "",
          narrative_status: "empty",
          body: "## Tool calls\n\nEdit×2 Write×0 Bash×1 Read×3\n",
        },
      ],
    });
    let out = "";
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(((chunk: unknown) => {
        out += chunk;
        return true;
      }) as typeof process.stdout.write);
    await runCloseOut({ cwd: root, session: "2026-05-05-1200", json: true });
    writeSpy.mockRestore();
    const obj = JSON.parse(out) as { sessionId: string; draft: { didFinish: string } };
    expect(obj.sessionId).toBe("2026-05-05-1200");
    expect(obj.draft).toBeTruthy();
    expect(obj.draft.didFinish).toMatch(/edit/i);
  });

  it("non-interactive (--did --learn --next --confirm) writes session + creates proposal when learn is non-empty", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1200", summary: "", narrative_status: "empty" }],
    });
    let out = "";
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(((chunk: unknown) => {
        out += chunk;
        return true;
      }) as typeof process.stdout.write);
    await runCloseOut({
      cwd: root,
      session: "2026-05-05-1200",
      did: "shipped X",
      learn: "decided to use Y",
      next: "test it",
      confirm: true,
    });
    writeSpy.mockRestore();
    expect(out).toMatch(/Confirmed/);
    expect(out).toMatch(/proposal=PROP-/);
    const sessionRaw = await fs.readFile(
      join(root, ".cairndex", "sessions", "2026-05-05-1200.md"),
      "utf8",
    );
    expect(sessionRaw).toMatch(/^narrative_status: confirmed$/m);
    expect(sessionRaw).toMatch(/^summary: shipped X$/m);
  });

  it("non-interactive without learn does not create proposal", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1200", summary: "", narrative_status: "empty" }],
    });
    let out = "";
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(((chunk: unknown) => {
        out += chunk;
        return true;
      }) as typeof process.stdout.write);
    await runCloseOut({
      cwd: root,
      session: "2026-05-05-1200",
      did: "x",
      learn: "",
      next: "y",
      confirm: true,
    });
    writeSpy.mockRestore();
    expect(out).not.toMatch(/proposal=/);
    const inboxFiles = await fs.readdir(
      join(root, ".cairndex", "inbox", "proposed-memory-updates"),
    );
    expect(inboxFiles.filter((f) => f.endsWith(".md"))).toHaveLength(0);
  });

  it("auto-resolves the latest session when --session is omitted", async () => {
    root = seedFixture({
      sessions: [
        { id: "2026-05-04-1000", summary: "", narrative_status: "empty" },
        { id: "2026-05-05-1200", summary: "", narrative_status: "empty" },
      ],
    });
    let out = "";
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(((chunk: unknown) => {
        out += chunk;
        return true;
      }) as typeof process.stdout.write);
    await runCloseOut({ cwd: root, json: true });
    writeSpy.mockRestore();
    const obj = JSON.parse(out) as { sessionId: string };
    expect(obj.sessionId).toBe("2026-05-05-1200"); // most recent
  });

  it("exits with error when no sessions exist", async () => {
    root = seedFixture({});
    let err = "";
    const errSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(((chunk: unknown) => {
        err += chunk;
        return true;
      }) as typeof process.stderr.write);
    await runCloseOut({ cwd: root, json: true });
    errSpy.mockRestore();
    expect(err).toMatch(/no session found/i);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0; // reset for subsequent tests
  });
});
