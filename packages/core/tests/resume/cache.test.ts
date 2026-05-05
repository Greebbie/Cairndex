import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync, promises as fs } from "node:fs";
import { writeResumeCache } from "../../src/resume/cache.js";
import { resumeJsonPath, resumeMdPath } from "../../src/paths.js";
import { buildResumeView } from "../../src/resume/buildResumeView.js";
import { seedFixture } from "../_utils/fixture.js";

describe("writeResumeCache", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("writes resume.json with generated/sources/builtAt wrapper", async () => {
    root = seedFixture({
      sessions: [{ id: "2026-05-05-1000", summary: "x", narrative_status: "confirmed" }],
    });
    const view = await buildResumeView({ cwd: root, today: new Date("2026-05-05T12:00:00Z") });
    await writeResumeCache({ cwd: root, view });
    const json = JSON.parse(await fs.readFile(resumeJsonPath(root), "utf8"));
    expect(json.generated).toBe(true);
    expect(Array.isArray(json.sources)).toBe(true);
    expect(json.builtAt).toBe("2026-05-05T12:00:00.000Z");
    expect(json.view).toBeTruthy();
    expect(json.view.lastSession?.id).toBe("2026-05-05-1000");
  });

  it("writes resume.md with generated YAML frontmatter above the body", async () => {
    root = seedFixture({});
    const view = await buildResumeView({ cwd: root, today: new Date("2026-05-05T12:00:00Z") });
    await writeResumeCache({ cwd: root, view });
    const md = await fs.readFile(resumeMdPath(root), "utf8");
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toMatch(/^generated: true$/m);
    expect(md).toMatch(/^builtAt: '?2026-05-05T12:00:00\.000Z'?$/m);
    expect(md).toMatch(/^sources:/m);
    expect(md).toContain("# Resume"); // from the renderCliFlavor stub
  });

  it("creates state/ directory if missing", async () => {
    root = seedFixture({});
    // delete state/ if seedFixture created it
    const stateDir = resumeJsonPath(root).replace(/[\\/]resume\.json$/, "");
    if (existsSync(stateDir)) rmSync(stateDir, { recursive: true, force: true });
    const view = await buildResumeView({ cwd: root });
    await writeResumeCache({ cwd: root, view });
    expect(existsSync(resumeJsonPath(root))).toBe(true);
    expect(existsSync(resumeMdPath(root))).toBe(true);
  });

  it("overwrites existing cache files (idempotent)", async () => {
    root = seedFixture({});
    const view = await buildResumeView({ cwd: root, today: new Date("2026-05-04T00:00:00Z") });
    await writeResumeCache({ cwd: root, view });
    const view2 = await buildResumeView({ cwd: root, today: new Date("2026-05-05T00:00:00Z") });
    await writeResumeCache({ cwd: root, view: view2 });
    const json = JSON.parse(await fs.readFile(resumeJsonPath(root), "utf8"));
    expect(json.builtAt).toBe("2026-05-05T00:00:00.000Z");
  });
});
