// Build packages/cli/assets/icon.ico from packages/cli/assets/icon.svg.
//
// Output: assets/icon.ico (multi-resolution: 16, 32, 48, 64, 128, 256).
// The .ico is consumed by build-sea.mjs to set the Windows PE icon resource on
// Cairndex.exe. On macOS/Linux this script still runs (the .ico is small) but
// build-sea.mjs only applies the icon on win32.
//
// Pure-JS deps: @resvg/resvg-js (WASM SVG raster) + png-to-ico. No native
// toolchain needed — works in CI / on Windows / macOS / Linux.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, "..");
const svgPath = join(cliRoot, "assets", "icon.svg");
const icoPath = join(cliRoot, "assets", "icon.ico");

const SIZES = [16, 32, 48, 64, 128, 256];

function renderPng(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
  });
  return resvg.render().asPng();
}

const svg = readFileSync(svgPath, "utf8");
const pngs = SIZES.map((s) => renderPng(svg, s));
const ico = await pngToIco(pngs);
writeFileSync(icoPath, ico);

console.log(`[icon] wrote ${icoPath} (${SIZES.join(", ")} px, ${ico.length} bytes)`);
