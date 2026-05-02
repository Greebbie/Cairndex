// Build a portable Cairndex.exe (or ./Cairndex on macOS/Linux) using Node SEA.
//
// Output layout (dist-sea/):
//   Cairndex.exe        ← node binary + injected SEA blob
//   web/                ← Vite build (packages/web/dist)
//   templates/          ← bundled templates (templates/)
//
// Prereqs: `pnpm -r build` has run (so packages/cli/dist/sea-entry.cjs and
// packages/web/dist/ both exist). Run via `pnpm -F cairndex package:sea`.

import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Sentinel published by Node's SEA spec; postject must inject the blob with a
// matching fuse so the runtime recognizes the embedded payload.
// https://nodejs.org/api/single-executable-applications.html
const NODE_SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, "..");
const repoRoot = resolve(cliRoot, "..", "..");
const out = join(cliRoot, "dist-sea");
const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const exeName = isWin ? "Cairndex.exe" : "Cairndex";
const finalExe = join(out, exeName);

const seaEntry = join(cliRoot, "dist-sea-entry", "sea-entry.cjs");
const webDist = join(repoRoot, "packages", "web", "dist");
const templatesSrc = join(repoRoot, "templates");

function fail(msg) {
  console.error(`[sea] ${msg}`);
  process.exit(1);
}

if (!existsSync(seaEntry)) {
  fail(
    `missing ${seaEntry}. Run: pnpm -F cairndex build:sea-entry (or use the package:sea script which chains both).`,
  );
}
if (!existsSync(join(webDist, "index.html"))) {
  fail(`missing ${webDist}/index.html. Run: pnpm -F @cairndex/web build`);
}
if (!existsSync(templatesSrc)) fail(`missing ${templatesSrc}`);

console.log(`[sea] platform=${process.platform} arch=${process.arch}`);
console.log(`[sea] node=${process.execPath}`);

// 0. Clean output dir
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. Write SEA config
const blobPath = join(out, "sea-prep.blob");
const seaConfigPath = join(out, "sea-config.json");
const seaConfig = {
  main: seaEntry,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  // useSnapshot: false (default). useCodeCache could speed startup but adds size.
};
writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));

// 2. Generate the blob
console.log(`[sea] generating blob -> ${blobPath}`);
execFileSync(process.execPath, ["--experimental-sea-config", seaConfigPath], {
  stdio: "inherit",
});

// 3. Copy node executable to the target name
console.log(`[sea] copying node binary -> ${finalExe}`);
copyFileSync(process.execPath, finalExe);

// 4. Strip Authenticode signature on Windows (best-effort; postject also warns)
if (isWin) {
  try {
    execFileSync("signtool.exe", ["remove", "/s", finalExe], { stdio: "ignore" });
    console.log("[sea] removed signature with signtool");
  } catch {
    console.log("[sea] no signtool available; continuing (exe will be unsigned)");
  }
}

// 5. Inject the blob with postject
console.log("[sea] injecting blob with postject");
const postjectCli = join(repoRoot, "node_modules", "postject", "dist", "cli.js");
if (!existsSync(postjectCli)) {
  // pnpm sometimes hoists differently — fall back to the package-local copy.
  const fallback = join(cliRoot, "node_modules", "postject", "dist", "cli.js");
  if (!existsSync(fallback)) fail(`cannot find postject at ${postjectCli} or ${fallback}`);
}
const postjectCliResolved = existsSync(postjectCli)
  ? postjectCli
  : join(cliRoot, "node_modules", "postject", "dist", "cli.js");

const postjectArgs = [
  postjectCliResolved,
  finalExe,
  "NODE_SEA_BLOB",
  blobPath,
  "--sentinel-fuse",
  NODE_SEA_FUSE,
];
if (isMac) postjectArgs.push("--macho-segment-name", "NODE_SEA");
execFileSync(process.execPath, postjectArgs, { stdio: "inherit" });

// 6. Stage portable folder layout: copy web/ and templates/ next to the exe
console.log(`[sea] staging web/ and templates/ alongside exe`);
cpSync(webDist, join(out, "web"), { recursive: true });
cpSync(templatesSrc, join(out, "templates"), { recursive: true });

// 7. Cleanup intermediates
rmSync(blobPath);
rmSync(seaConfigPath);

console.log(`[sea] ✓ done. Portable folder: ${out}`);
console.log(`[sea]   ${exeName} — double-click to launch (server on http://localhost:7777)`);
console.log(`[sea]   web/ + templates/ are loaded relative to the exe`);
