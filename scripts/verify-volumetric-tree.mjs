/**
 * Volumetric 3D Tree of Life verification.
 * Run: node scripts/verify-volumetric-tree.mjs
 */
import { readFileSync, mkdirSync, accessSync, constants } from "node:fs";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { generateTreeOfLife } from "../src/engine/generators/index.js";
import { buildTreeOfLifeConstructionPlan } from "../src/engine/construction/treeOfLifePlan.js";
import { applyConstructionPlan } from "../src/engine/construction/applyPlan.js";
import {
  buildVolumetricTreeLayout,
  countVolumetricConstructionSteps,
  normalizeVolumetricOpts,
  volumetricZStats,
} from "../src/engine/treeOfLife/volumetricLayout.js";
import { TREE_VIEW_MODES } from "../src/engine/treeOfLife/modes.js";
import { SEPHIROT_IDS } from "../src/engine/treeOfLife/graph.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
let failed = 0;

/**
 * Screenshot output directory — configurable for CI and local runs.
 * Priority: GEOMETRY_EXPLOR_SCREENSHOT_DIR env → repo test-output/screenshots.
 */
function resolveScreenshotDir() {
  const configured = process.env.GEOMETRY_EXPLOR_SCREENSHOT_DIR?.trim();
  if (configured) {
    return isAbsolute(configured) ? configured : resolve(root, configured);
  }
  return join(root, "test-output", "screenshots");
}

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
  const volOpts = { layers: 5, zSpacing: 0.42 };
  const layout = buildVolumetricTreeLayout(r, volOpts);
  const expectedSteps = countVolumetricConstructionSteps(layout.layerGroups);
  const plan = buildTreeOfLifeConstructionPlan(r, {
    viewMode: "volumetric",
    volumetric: volOpts,
  });
  const drawOps = plan.operations.filter((op) => op.type === "drawSphere");
  assert(drawOps.length === 10, "construction plan draws 10 spheres");
  assert(plan.sphereCount === expectedSteps, "plan step count matches active layers", `${plan.sphereCount} vs ${expectedSteps}`);
  assert(plan.stepKind === "layer", "volumetric plan uses layer stepping");

  const edgeOps = plan.operations.filter((op) => op.type === "addEdge");
  assert(edgeOps.length === 22, "construction plan adds 22 path edges");

  const firstZ = drawOps[0]?.center?.z ?? 0;
  const lastZ = drawOps[drawOps.length - 1]?.center?.z ?? 0;
  assert(Math.abs(firstZ - lastZ) > 0.2, "construction layers span Z depth", `${firstZ.toFixed(2)} → ${lastZ.toFixed(2)}`);

  for (let step = 1; step <= plan.sphereCount; step += 1) {
    const endIdx = plan.operationIndexForSphereCount(step);
    const prevIdx = step > 1 ? plan.operationIndexForSphereCount(step - 1) : -1;
    const newDraws = plan.operations
      .slice(prevIdx + 1, endIdx + 1)
      .filter((op) => op.type === "drawSphere");
    assert(newDraws.length >= 1, `layer step ${step} reveals at least one sphere`, String(newDraws.length));

    const layerOps = plan.operations.slice(prevIdx + 1, endIdx + 1);
    const lastOp = layerOps[layerOps.length - 1];
    assert(lastOp?.type === "drawSphere", `layer step ${step} ends on drawSphere`, lastOp?.type ?? "none");

    const placedIds = new Set(
      plan.operations
        .slice(0, endIdx + 1)
        .filter((op) => op.type === "placePoint")
        .map((op) => op.pointId)
    );
    const expectedEdges = layout.paths
      .filter((path) => placedIds.has(path.from) && placedIds.has(path.to))
      .map((path) => path.id);
    const applied = applyConstructionPlan(plan, endIdx);
    const visibleEdgeIds = applied.edges
      .filter((edge) => edge.meta?.kind === "treePath")
      .map((edge) => edge.id);
    for (const edgeId of expectedEdges) {
      assert(
        visibleEdgeIds.includes(edgeId),
        `layer step ${step} shows ready path ${edgeId}`,
        `visible=${visibleEdgeIds.length} expected=${expectedEdges.length}`
      );
    }
  }

  const finalIdx = plan.operationIndexForSphereCount(plan.sphereCount);
  const finalApplied = applyConstructionPlan(plan, finalIdx);
  assert(
    finalApplied.edges.filter((edge) => edge.meta?.kind === "treePath").length === 22,
    "final layer step shows all 22 tree paths",
    String(finalApplied.edges.length)
  );

  const objectSteps = [
    ...finalApplied.points.map((p) => p.step),
    ...finalApplied.edges.map((e) => e.step),
    ...finalApplied.sphereCenters.map((s) => s.constructionStep),
    ...finalApplied.circleCenters.map((c) => c.constructionStep),
  ];
  assert(
    objectSteps.every((step) => step >= 0 && step <= finalApplied.maxStep),
    "all layer-plan object steps stay within 0..maxStep",
    `max=${finalApplied.maxStep} observed=${Math.max(...objectSteps)}`
  );

  const multiSphereLayerIdx = layout.layerGroups.findIndex((group) => group.length > 1);
  assert(multiSphereLayerIdx >= 0, "layout has a layer with multiple spheres");
  const expectedLayerStep = multiSphereLayerIdx + 1;
  const multiSphereIds = new Set(layout.layerGroups[multiSphereLayerIdx].map((s) => s.id));
  const multiSpherePointSteps = finalApplied.points
    .filter((p) => multiSphereIds.has(p.id))
    .map((p) => p.step);
  assert(
    multiSpherePointSteps.length === multiSphereIds.size,
    "multi-sphere layer places every Sephirah point",
    `${multiSpherePointSteps.length} vs ${multiSphereIds.size}`
  );
  assert(
    new Set(multiSpherePointSteps).size === 1 &&
      multiSpherePointSteps[0] === expectedLayerStep,
    "multiple spheres in one layer share the same layer step",
    multiSpherePointSteps.join(",")
  );
}

// --- Generator + plan + engine totals stay aligned ---
{
  const volOpts = { layers: 5, zSpacing: 0.42, branchSpread: 1.0 };
  const data = generateTreeOfLife(r, { viewMode: "volumetric", volumetric: volOpts });
  const plan = buildTreeOfLifeConstructionPlan(r, { viewMode: "volumetric", volumetric: volOpts });
  assert(data.maxStep === plan.sphereCount, "generator maxStep matches plan sphereCount", `${data.maxStep} vs ${plan.sphereCount}`);

  const layout = buildVolumetricTreeLayout(r, volOpts);
  assert(
    data.maxStep === countVolumetricConstructionSteps(layout.layerGroups),
    "maxStep equals non-empty layer count"
  );

  let prevCount = 0;
  for (let step = 1; step <= data.maxStep; step += 1) {
    const visible = data.points.filter((p) => p.meta?.role === "sephirah" && p.step <= step);
    assert(visible.length > prevCount, `static step ${step} reveals new Sephirot`, `${prevCount} → ${visible.length}`);
    prevCount = visible.length;
  }
}

// --- Higher layer count skips empty Z slots ---
{
  const layout = buildVolumetricTreeLayout(r, { layers: 8, zSpacing: 0.42 });
  const steps = countVolumetricConstructionSteps(layout.layerGroups);
  assert(steps < 8, "eight nominal layers can collapse to fewer active steps", String(steps));
  const plan = buildTreeOfLifeConstructionPlan(r, { viewMode: "volumetric", volumetric: { layers: 8 } });
  assert(plan.sphereCount === steps, "plan uses active layer count with layers=8");
}

// --- UI wiring present ---
{
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert(/value="volumetric"/.test(html), "volumetric option in tree view select");
  assert(/id="volumetricControls"/.test(html), "volumetric controls section");
  assert(/data-preset="perspective"/.test(html), "perspective camera preset button");
  assert(
    /id="volumetricSphereRadiusValue">0\.14</.test(html),
    "sphere radius label default matches ratio slider"
  );
  assert(
    /id="volumetricSphereRadius"[^>]*value="0\.14"/.test(html),
    "sphere radius slider default is 0.14 ratio"
  );
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

// --- Screenshot output directory is portable (not Cursor-specific) ---
{
  const screenshotDir = resolveScreenshotDir();
  assert(!screenshotDir.startsWith("/opt/cursor/"), "screenshot dir is not Cursor-specific", screenshotDir);
  assert(screenshotDir.includes("screenshots"), "screenshot dir name includes screenshots", screenshotDir);
  mkdirSync(screenshotDir, { recursive: true });
  accessSync(screenshotDir, constants.W_OK);
  assert(true, "screenshot dir is writable", screenshotDir);
}

await run("npm", ["run", "build"]);

const port = "4312";
const base = `http://127.0.0.1:${port}/`;
const preview = spawn(
  process.execPath,
  [join(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", port],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
);

const screenshotDir = resolveScreenshotDir();
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

  const sphereRadiusUi = await page.evaluate(() => {
    const slider = document.getElementById("volumetricSphereRadius");
    const label = document.getElementById("volumetricSphereRadiusValue");
    return {
      slider: slider?.value ?? "",
      label: label?.textContent ?? "",
      ratio: window.__volumetricTestHooks?.getSphereRadiusRatio?.() ?? null,
      generatorRadius: window.__volumetricTestHooks?.getGeneratorSphereRadius?.() ?? null,
      constructionRadius: window.__volumetricTestHooks?.getConstructionRadius?.() ?? null,
    };
  });
  assert(sphereRadiusUi.slider === "0.14", "browser sphere radius slider is ratio 0.14", sphereRadiusUi.slider);
  assert(sphereRadiusUi.label === "0.14", "browser sphere radius label matches slider", sphereRadiusUi.label);
  assert(sphereRadiusUi.ratio === 0.14, "ui state sphere radius ratio is 0.14", String(sphereRadiusUi.ratio));
  assert(
    Math.abs(sphereRadiusUi.generatorRadius - 1.2 * 0.14) < 0.001,
    "generator sphere radius uses ratio * construction radius",
    String(sphereRadiusUi.generatorRadius)
  );
  assert(
    Math.abs(sphereRadiusUi.constructionRadius - sphereRadiusUi.generatorRadius) < 0.001,
    "rendered construction radius matches generator",
    `${sphereRadiusUi.constructionRadius} vs ${sphereRadiusUi.generatorRadius}`
  );

  const stepTotals = await page.evaluate(() => {
    const max = window.__volumetricTestHooks?.getMaxStep?.() ?? 0;
    const label = document.getElementById("layersValue")?.textContent ?? "";
    const playerTotal = window.__volumetricTestHooks?.getPlayerTotalSteps?.() ?? 0;
    return { max, label, playerTotal };
  });
  assert(stepTotals.max === 5, "browser max step is 5 layers", String(stepTotals.max));
  assert(stepTotals.label === "1 / 5" || stepTotals.label.endsWith("/ 5"), "layers label uses layer total", stepTotals.label);
  assert(stepTotals.playerTotal === 5, "construction player total matches layers", String(stepTotals.playerTotal));

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
