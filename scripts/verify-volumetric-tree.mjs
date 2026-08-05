/**
 * Volumetric 3D Tree of Life verification.
 * Run: node scripts/verify-volumetric-tree.mjs
 */
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { generateTreeOfLife } from "../src/engine/generators/index.js";
import { buildTreeOfLifeConstructionPlan } from "../src/engine/construction/treeOfLifePlan.js";
import {
  buildVolumetricTreeLayout,
  normalizeVolumetricOpts,
  volumetricZStats,
} from "../src/engine/treeOfLife/volumetricLayout.js";
import { TREE_VIEW_MODES } from "../src/engine/treeOfLife/modes.js";
import { SEPHIROT_IDS } from "../src/engine/treeOfLife/graph.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
let failed = 0;

function assert(condition, message, detail = "") {
  if (condition) console.log("PASS:", message, detail ? `— ${detail}` : "");
  else {
    failed += 1;
    console.error("FAIL:", message, detail ? `— ${detail}` : "");
  }
}

const r = 1.2;

// --- Unit: layout produces substantial Z depth and 3+ levels ---
{
  const layout = buildVolumetricTreeLayout(r, {
    zSpacing: 0.42,
    branchSpread: 1.0,
    layers: 5,
  });
  const stats = volumetricZStats(layout.sephirot);
  assert(stats.range > 0.5, "volumetric Z range is substantial", `range=${stats.range.toFixed(3)}`);
  assert(stats.distinctLevels >= 3, "at least three distinct Z levels", String(stats.distinctLevels));
  assert(layout.sephirot.length === 10, "volumetric layout has 10 Sephirot");
  assert(layout.layerGroups.length === 5, "five construction layers");

  const minZRatio = stats.range / (r * 2);
  assert(minZRatio > 0.25, "Z depth is meaningful relative to construction radius", minZRatio.toFixed(3));
}

// --- Generator: volumetric mode differs from planar ---
{
  const planar = generateTreeOfLife(r, { viewMode: "traditional" });
  const volumetric = generateTreeOfLife(r, {
    viewMode: "volumetric",
    volumetric: { zSpacing: 0.42, layers: 5, branchSpread: 1.0 },
  });

  assert(planar.meta.viewMode === "traditional", "planar mode preserved");
  assert(volumetric.meta.viewMode === TREE_VIEW_MODES.VOLUMETRIC, "volumetric mode set");
  assert(volumetric.meta.volumetric?.zStats?.distinctLevels >= 3, "generator meta records Z levels");

  const planarZ = planar.points.filter((p) => p.meta?.role === "sephirah").map((p) => p.z);
  const volZ = volumetric.points.filter((p) => p.meta?.role === "sephirah").map((p) => p.z);
  assert(planarZ.every((z) => Math.abs(z) < 1e-9), "planar Sephirot remain at z=0");
  assert(volZ.some((z) => Math.abs(z) > 0.2), "volumetric Sephirot use non-zero Z");
  assert(
    Math.max(...volZ) - Math.min(...volZ) > 0.5,
    "volumetric Sephirot span substantial Z range",
    (Math.max(...volZ) - Math.min(...volZ)).toFixed(3)
  );

  const volPaths = volumetric.edges.filter((e) => e.meta?.kind === "treePath");
  assert(volPaths.length === 22, "volumetric preserves 22 paths");

  // 3D branch: at least one path connects nodes on different Z levels
  const byId = new Map(volumetric.points.map((p) => [p.id, p]));
  const crossDepth = volPaths.some((path) => {
    const a = byId.get(path.from);
    const b = byId.get(path.to);
    return a && b && Math.abs(a.z - b.z) > 0.05;
  });
  assert(crossDepth, "at least one path spans different Z levels (3D branch)");

  assert(volumetric.circleCenters.length === 0, "volumetric mode omits planar circle overlays");
  assert(volumetric.sphereCenters.length === 10, "volumetric emits 10 sphere centers");
}

// --- Construction plan: layer-by-layer reveal ---
{
  const plan = buildTreeOfLifeConstructionPlan(r, {
    viewMode: "volumetric",
    volumetric: { layers: 5, zSpacing: 0.42 },
  });
  const drawOps = plan.operations.filter((op) => op.type === "drawSphere");
  assert(drawOps.length === 10, "construction plan draws 10 spheres");
  const edgeOps = plan.operations.filter((op) => op.type === "addEdge");
  assert(edgeOps.length === 22, "construction plan adds 22 path edges");

  const firstZ = drawOps[0]?.center?.z ?? 0;
  const lastZ = drawOps[drawOps.length - 1]?.center?.z ?? 0;
  assert(Math.abs(firstZ - lastZ) > 0.2, "construction layers span Z depth", `${firstZ.toFixed(2)} → ${lastZ.toFixed(2)}`);
}

// --- UI wiring present ---
{
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert(/value="volumetric"/.test(html), "volumetric option in tree view select");
  assert(/id="volumetricControls"/.test(html), "volumetric controls section");
  assert(/data-preset="perspective"/.test(html), "perspective camera preset button");
}

// --- UI normalization clamps out-of-range saved values ---
{
  const clamped = normalizeVolumetricOpts({
    zSpacing: 99,
    branchSpread: -1,
    layers: 1,
    sphereRadiusRatio: 0.01,
    connectionThickness: 9,
  });
  assert(clamped.zSpacing === 1.2, "zSpacing clamped to max");
  assert(clamped.branchSpread === 0.45, "branchSpread clamped to min");
  assert(clamped.layers === 3, "layers clamped to minimum of 3");
  assert(clamped.sphereRadiusRatio === 0.06, "sphereRadiusRatio clamped to min");
  assert(clamped.connectionThickness === 2.5, "connectionThickness clamped to max");
}

// --- Non-finite inputs fall back to defaults before clamping ---
{
  const defaults = normalizeVolumetricOpts({});
  const invalid = normalizeVolumetricOpts({
    zSpacing: "invalid",
    branchSpread: NaN,
    layers: Infinity,
    sphereRadiusRatio: -Infinity,
    connectionThickness: "invalid",
  });
  assert(invalid.zSpacing === defaults.zSpacing, "non-finite zSpacing uses default", String(invalid.zSpacing));
  assert(invalid.branchSpread === defaults.branchSpread, "NaN branchSpread uses default");
  assert(invalid.layers === defaults.layers, "Infinity layers uses default", String(invalid.layers));
  assert(invalid.sphereRadiusRatio === defaults.sphereRadiusRatio, "-Infinity sphereRadiusRatio uses default");
  assert(invalid.connectionThickness === defaults.connectionThickness, "invalid connectionThickness uses default");
}

await run("npm", ["run", "build"]);

const port = "4312";
const base = `http://127.0.0.1:${port}/`;
const preview = spawn(
  process.execPath,
  [join(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", port],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
);

const screenshotDir = "/opt/cursor/artifacts/screenshots";
mkdirSync(screenshotDir, { recursive: true });

try {
  await waitForServer(base);
  const puppeteer = await ensurePuppeteer();
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem("geometry-explor:show-intro-on-open", "0");
  });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(800);

  await page.select("#geometry", "treeOfLife");
  await sleep(400);
  await page.select("#treeViewMode", "volumetric");
  await sleep(800);

  const browserStats = await page.evaluate(() => {
    const data = window.__volumetricTestHooks?.getConstructionData?.();
    const seph = data?.points?.filter((p) => p.meta?.role === "sephirah") ?? [];
    const z = seph.map((p) => p.z);
    const distinct = [...new Set(z.map((v) => Math.round(v * 1000) / 1000))];
    return {
      zRange: Math.max(...z) - Math.min(...z),
      distinctLevels: distinct.length,
      axisVisible: window.__volumetricTestHooks?.isAxisHelperVisible?.() ?? false,
      viewMode: document.getElementById("treeViewMode")?.value,
      controlsVisible: !document.getElementById("volumetricControls")?.hidden,
    };
  });

  assert(browserStats.viewMode === "volumetric", "browser volumetric mode active");
  assert(browserStats.controlsVisible, "volumetric controls visible");
  assert(browserStats.zRange > 0.5, "browser Z range substantial", browserStats.zRange.toFixed(3));
  assert(browserStats.distinctLevels >= 3, "browser has 3+ Z levels", String(browserStats.distinctLevels));
  assert(browserStats.axisVisible, "XYZ axis helper visible in volumetric mode");

  const presets = [
    { name: "front", preset: "front" },
    { name: "side", preset: "side" },
    { name: "top", preset: "top" },
    { name: "perspective", preset: "perspective" },
  ];

  for (const { name, preset } of presets) {
    await page.evaluate((p) => {
      document.querySelector(`#viewPresets [data-preset="${p}"]`)?.click();
    }, preset);
    await sleep(700);
    const sideSpan = await page.evaluate(() => window.__volumetricTestHooks?.measureProjectedSpan?.() ?? null);
    if (name === "side") {
      assert(sideSpan && sideSpan.ySpan > 40, "side view shows vertical tree spread", String(sideSpan?.ySpan));
      assert(sideSpan && sideSpan.xSpan > 30, "side view shows depth spread (not a thin line)", String(sideSpan?.xSpan));
    }
    await page.screenshot({
      path: join(screenshotDir, `volumetric-tree-${name}.png`),
      fullPage: false,
    });
    console.log(`NOTE: saved ${join(screenshotDir, `volumetric-tree-${name}.png`)}`);
  }

  await browser.close();
} finally {
  preview.kill("SIGTERM");
}

if (failed > 0) {
  console.error(`\n${failed} volumetric tree assertion(s) failed`);
  process.exit(1);
}

console.log("\nAll volumetric 3D Tree checks passed.");

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd: root, stdio: "inherit" });
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

async function ensurePuppeteer() {
  const require = createRequire(import.meta.url);
  try {
    return require("puppeteer-core");
  } catch {
    await run("npm", ["install", "--no-save", "puppeteer-core@24"]);
    return createRequire(import.meta.url)("puppeteer-core");
  }
}

async function waitForServer(url) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // waiting
    }
    await sleep(250);
  }
  throw new Error(`Server did not start at ${url}`);
}
