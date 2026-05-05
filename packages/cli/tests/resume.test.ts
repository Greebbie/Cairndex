import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runResume } from "../src/commands/resume.js";

describe("runResume", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function seedRepo(opts: { withSession?: boolean } = {}): string {
    const repo = mkdtempSync(join(tmpdir(), "cairn-resume-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "sessions"), { recursive: true });
    mkdirSync(join(vault, "tasks"), { recursive: true });
    mkdirSync(join(vault, "inbox", "proposed-memory-updates"), { recursive: true });
    mkdirSync(join(vault, "signals"), { recursive: true });
    mkdirSync(join(vault, "decisions"), { recursive: true });
    mkdirSync(join(vault, "insights"), { recursive: true });
    mkdirSync(join(vault, "state"), { recursive: true });
    writeFileSync(join(vault, "index.md"), "# Index\n", "utf8");

    if (opts.withSession) {
      const sessionId = "2026-05-05-1000";
      writeFileSync(
        join(vault, "sessions", `${sessionId}.md`),
        `---\nid: ${sessionId}\ndate: 2026-05-05\nsummary: 'implemented X'\nnarrative_status: confirmed\n---\n`,
        "utf8",
      );
    }

    return repo;
  }

  it("writes Markdown to stdout (no --json)", async () => {
    const repo = seedRepo({ withSession: true });
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    const spy = (chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    };
    process.stdout.write = spy as typeof process.stdout.write;
    try {
      await runResume({ cwd: repo });
    } finally {
      process.stdout.write = original;
    }
    const out = chunks.join("");
    expect(out).toMatch(/^# Resume$/m);
    expect(out).toMatch(/2026-05-05-1000/);
  });

  it("with json: true emits the wrapper structure", async () => {
    const repo = seedRepo({ withSession: true });
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    const spy = (chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    };
    process.stdout.write = spy as typeof process.stdout.write;
    try {
      await runResume({ cwd: repo, json: true });
    } finally {
      process.stdout.write = original;
    }
    const out = chunks.join("");
    const parsed = JSON.parse(out) as {
      generated: boolean;
      builtAt: string;
      view: { lastSession?: { id: string } | null };
    };
    expect(parsed.generated).toBe(true);
    expect(parsed.builtAt).toBeTruthy();
    expect(parsed.view).toBeTruthy();
    expect(parsed.view.lastSession?.id).toBe("2026-05-05-1000");
  });

  it("writes state/resume.json and state/resume.md as a side effect", async () => {
    const repo = seedRepo();
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await runResume({ cwd: repo });
    } finally {
      process.stdout.write = original;
    }
    expect(existsSync(join(repo, ".cairndex", "state", "resume.json"))).toBe(true);
    expect(existsSync(join(repo, ".cairndex", "state", "resume.md"))).toBe(true);
  });

  it("renders # Resume heading and section headers in output", async () => {
    const repo = seedRepo();
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    const spy = (chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    };
    process.stdout.write = spy as typeof process.stdout.write;
    try {
      await runResume({ cwd: repo });
    } finally {
      process.stdout.write = original;
    }
    const out = chunks.join("");
    expect(out).toMatch(/^# Resume$/m);
    expect(out).toMatch(/^## Last session$/m);
    expect(out).toMatch(/^## Active task$/m);
    expect(out).toMatch(/^## Pending memory$/m);
  });
});
