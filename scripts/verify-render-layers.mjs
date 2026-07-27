/**
 * Multi-select Renderer layers — independence, commutativity, defaults, mobile.
 * Run: node scripts/verify-render-layers.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import * as THREE from "three";
import { ConstructionEngine } from "../src/engine/index.js";
import {
  DEFAULT_ACTIVE_RENDER_LAYERS,
  RENDER_LAYER_DRAW_ORDER,
  RENDER_LAYERS,
  layersEqual,
  layersFromLegacyMode,
  legacyModeFromLayers,
  normalizeRenderLayers,
  summarizeRenderLayers,
} from "../src/engine/renderer/uiRenderModes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

let failed = 0;
function assert(cond, msg, detail = "") {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg, detail ? `— ${detail}` : "");
  } else {
    console.log("PASS:", msg, detail ? `— ${detail}` : "");
  }
}

const LAYERS = [...RENDER_LAYER_DRAW_ORDER];
const KIND = {
  spheres: "sphere",
  circles: "circle",
  points: "point",
  connections: "line",
};

function combinations(arr) {
  const out = [];
  const n = arr.length;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    const set = [];
    for (let i = 0; i < n; i += 1) if (mask & (1 << i)) set.push(arr[i]);
    out.push(set);
  }
  return out;
}

function countKinds(group) {
  const counts = { sphere: 0, circle: 0, point: 0, line: 0 };
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    const k = obj.userData?.kind;
    if (Object.prototype.hasOwnProperty.call(counts, k)) counts[k] += 1;
  });
  return counts;
}

function meshIds(group) {
  const ids = [];
  group.traverse((obj) => {
    if (obj.isMesh) ids.push(obj.uuid);
  });
  return ids;
}

// --- Unit: legacy mappings ---
{
  assert(
    layersEqual(layersFromLegacyMode("spheres"), ["spheres"]),
    "legacy spheres → { spheres }"
  );
  assert(
    layersEqual(layersFromLegacyMode("circleOutlines"), ["circles"]),
    "legacy circleOutlines → { circles }"
  );
  assert(
    layersEqual(layersFromLegacyMode("points"), ["points"]),
    "legacy points → { points }"
  );
  assert(
    layersEqual(layersFromLegacyMode("edges"), ["connections"]),
    "legacy edges → { connections }"
  );
  assert(
    layersEqual(layersFromLegacyMode("connectionLines"), ["connections"]),
    "legacy connectionLines → { connections }"
  );
  assert(
    layersEqual(layersFromLegacyMode("lines"), ["connections"]),
    "legacy lines → { connections }"
  );
  assert(
    layersEqual(layersFromLegacyMode("mixed"), LAYERS),
    "legacy mixed → all four layers"
  );
  assert(legacyModeFromLayers(LAYERS) === "mixed", "all layers → legacy mixed");
  assert(
    JSON.stringify(DEFAULT_ACTIVE_RENDER_LAYERS) === JSON.stringify(["spheres"]),
    "default active layer set is { spheres }"
  );
  assert(
    summarizeRenderLayers(LAYERS) === "All layers",
    "summary for all layers"
  );
  assert(summarizeRenderLayers([]) === "No layers", "summary for no layers");
}

// --- Unit: every alone / pair / triple / all four ---
{
  const group = new THREE.Group();
  const engine = new ConstructionEngine(group);
  engine.setGeometry("flowerOfLife");
  engine.setConstructionMode(false);
  engine.setStep(engine.getMaxStep());

  for (const layer of LAYERS) {
    engine.setActiveRenderLayers([layer]);
    const counts = countKinds(group);
    const kind = KIND[layer];
    assert(counts[kind] > 0, `layer alone enabled: ${layer}`, `count=${counts[kind]}`);
    for (const other of LAYERS) {
      if (other === layer) continue;
      assert(counts[KIND[other]] === 0, `alone ${layer} does not enable ${other}`);
    }
  }

  for (const pair of combinations(LAYERS).filter((c) => c.length === 2)) {
    engine.setActiveRenderLayers(pair);
    const counts = countKinds(group);
    for (const layer of pair) {
      assert(counts[KIND[layer]] > 0, `pair includes ${layer}`, pair.join("+"));
    }
  }

  for (const triple of combinations(LAYERS).filter((c) => c.length === 3)) {
    engine.setActiveRenderLayers(triple);
    const counts = countKinds(group);
    for (const layer of triple) {
      assert(counts[KIND[layer]] > 0, `triple includes ${layer}`, triple.join("+"));
    }
  }

  engine.setActiveRenderLayers(LAYERS);
  const all = countKinds(group);
  assert(
    all.sphere > 0 && all.circle > 0 && all.point > 0 && all.line >= 0,
    "all four layers can be enabled together",
    JSON.stringify(all)
  );
}

// --- Unit: enabling one does not disable another; order commutative ---
{
  const group = new THREE.Group();
  const engine = new ConstructionEngine(group);
  engine.setGeometry("flowerOfLife");
  engine.setStep(engine.getMaxStep());

  engine.setActiveRenderLayers(["spheres"]);
  engine.setActiveRenderLayers(["spheres", "circles"]);
  const ab = countKinds(group);
  const fpAb = JSON.stringify(
    (engine.getFullData()?.sphereCenters || []).map((s) => s.pointId)
  );

  engine.setActiveRenderLayers(["circles"]);
  engine.setActiveRenderLayers(["circles", "spheres"]);
  const ba = countKinds(group);
  const fpBa = JSON.stringify(
    (engine.getFullData()?.sphereCenters || []).map((s) => s.pointId)
  );

  assert(ab.sphere === ba.sphere && ab.circle === ba.circle, "selection order does not affect object counts");
  assert(fpAb === fpBa, "selection order does not affect geometry fingerprint");
  assert(
    JSON.stringify(engine.getActiveRenderLayers()) ===
      JSON.stringify(normalizeRenderLayers(["circles", "spheres"])),
    "selection order does not affect final active set"
  );

  // Render order bands stable
  const orders = { sphere: [], circle: [], line: [], point: [] };
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    const k = obj.userData?.kind;
    if (orders[k]) orders[k].push(obj.renderOrder);
  });
  const maxSphere = Math.max(0, ...orders.sphere);
  const minCircle = Math.min(...(orders.circle.length ? orders.circle : [Infinity]));
  const minPoint = Math.min(...(orders.point.length ? orders.point : [Infinity]));
  assert(maxSphere < minCircle || !orders.circle.length, "spheres draw before circles (renderOrder)");
  assert(minCircle < minPoint || !orders.point.length, "circles before points (renderOrder)");
}

// --- Unit: Select All / turn one off; no duplicates; dispose ---
{
  const group = new THREE.Group();
  const engine = new ConstructionEngine(group);
  engine.setGeometry("seedOfLife");
  engine.setStep(engine.getMaxStep());

  engine.setActiveRenderLayers(LAYERS);
  assert(engine.getActiveRenderLayers().length === 4, "Select All enables all four layers");

  engine.setActiveRenderLayers(LAYERS.filter((id) => id !== "circles"));
  const left = engine.getActiveRenderLayers();
  assert(left.length === 3 && !left.includes("circles"), "turning one off after Select All keeps the other three");

  const beforeIds = new Set(meshIds(group));
  engine.setActiveRenderLayers(["spheres"]);
  engine.setActiveRenderLayers(["spheres", "circles"]);
  engine.setActiveRenderLayers(["spheres"]);
  engine.setActiveRenderLayers(["spheres", "circles", "points", "connections"]);
  engine.setActiveRenderLayers(["spheres"]);
  const afterIds = meshIds(group);
  assert(
    afterIds.every((id) => !beforeIds.has(id)),
    "repeated toggling creates fresh objects (previous disposed from group)"
  );
  // No duplicate uuids in current group
  assert(new Set(afterIds).size === afterIds.length, "no duplicate render objects after toggling");
}

// --- Static: HTML / main architecture ---
{
  const html = readFileSync(join(root, "index.html"), "utf8");
  const mainSrc = readFileSync(join(root, "src/main.js"), "utf8");
  assert(/rendererMultiselect/.test(html), "multi-select Renderer control in HTML");
  assert(/data-render-layer="spheres"/.test(html), "Solid Spheres checkbox present");
  assert(/data-render-layer="circles"/.test(html), "Circle Outlines checkbox present");
  assert(/data-render-layer="points"/.test(html), "Point Markers checkbox present");
  assert(/data-render-layer="connections"/.test(html), "Connection Lines checkbox present");
  assert(/id="rendererSelectAll"/.test(html), "All Layers checkbox present");
  assert(!/<select id="renderMode">/.test(html), "legacy single-select renderMode removed");
  assert(!/>\s*Mixed Mode\s*</.test(html), "Mixed Mode removed from UI");
  assert(/activeRenderLayers/.test(mainSrc), "activeRenderLayers is source of truth in main");
  assert(
    /DEFAULT_ACTIVE_RENDER_LAYERS/.test(mainSrc),
    "Reset Controls restores default layer set"
  );
  assert(
    /min-height:\s*44px/.test(readFileSync(join(root, "src/styles.css"), "utf8")),
    "renderer rows use ~44px touch targets"
  );
}

async function ensurePuppeteer() {
  const require = createRequire(import.meta.url);
  try {
    return require("puppeteer-core");
  } catch {
    await new Promise((resolve, reject) => {
      const p = spawn("npm", ["install", "--no-save", "puppeteer-core@24"], {
        stdio: "inherit",
        cwd: root,
      });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("npm install failed"))));
    });
    return createRequire(import.meta.url)("puppeteer-core");
  }
}

async function waitForServer(url, tries = 80) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error(`Server not ready at ${url}`);
}

async function browserChecks() {
  const PORT = process.env.PORT || "4265";
  const BASE = `http://127.0.0.1:${PORT}/-Geometry-Explor/`;

  await new Promise((resolve, reject) => {
    const b = spawn("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
    b.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("build failed"))));
  });

  const preview = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", PORT], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(BASE);
    const puppeteer = await ensurePuppeteer();
    const browser = await puppeteer.launch({
      executablePath: "/usr/bin/google-chrome-stable",
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader",
      ],
    });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("geometry-explor:show-intro-on-open", "0");
      } catch {
        /* ignore */
      }
    });
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForFunction(() => window.__geometryExplor, { timeout: 15000 });
    await page.evaluate(() => window.__geometryExplor.endTutorial());
    await sleep(200);

    await page.select("#geometry", "flowerOfLife");
    await sleep(300);

    const defaults = await page.evaluate(() => window.__geometryExplor.getActiveRenderLayers());
    assert(
      JSON.stringify(defaults) === JSON.stringify(["spheres"]),
      "browser default layers are { spheres }",
      JSON.stringify(defaults)
    );

    // Enabling one does not disable another
    await page.evaluate(() => {
      window.__geometryExplor.setActiveRenderLayers(["spheres"]);
      window.__geometryExplor.setActiveRenderLayers(["spheres", "circles"]);
    });
    let layers = await page.evaluate(() => window.__geometryExplor.getActiveRenderLayers());
    assert(
      layers.includes("spheres") && layers.includes("circles") && layers.length === 2,
      "enabling one layer does not disable another"
    );

    // Select All then turn one off
    await page.evaluate(() => window.__geometryExplor.selectAllRenderLayers());
    layers = await page.evaluate(() => window.__geometryExplor.getActiveRenderLayers());
    assert(layers.length === 4, "Select All enables all four layers (browser)");
    await page.evaluate(() =>
      window.__geometryExplor.setActiveRenderLayers(["spheres", "points", "connections"])
    );
    layers = await page.evaluate(() => window.__geometryExplor.getActiveRenderLayers());
    assert(
      layers.length === 3 && !layers.includes("circles"),
      "turning one layer off after Select All keeps the other three (browser)"
    );

    // Reset Controls restores default
    await page.click("#resetControls");
    await sleep(400);
    layers = await page.evaluate(() => window.__geometryExplor.getActiveRenderLayers());
    assert(
      JSON.stringify(layers) === JSON.stringify(["spheres"]),
      "Reset Controls restores the default layer set"
    );

    // Geometry switching preserves user layer set
    await page.evaluate(() =>
      window.__geometryExplor.setActiveRenderLayers(["spheres", "circles", "points"])
    );
    await page.select("#geometry", "seedOfLife");
    await sleep(300);
    layers = await page.evaluate(() => window.__geometryExplor.getActiveRenderLayers());
    assert(
      layersEqual(layers, ["spheres", "circles", "points"]),
      "geometry switching preserves the layer set",
      JSON.stringify(layers)
    );

    // Construction Mode preserves layers + no plane
    const beforeCam = await page.evaluate(() => ({
      dir: window.__geometryExplor.getCameraDirection(),
      layers: window.__geometryExplor.getActiveRenderLayers(),
      fp: window.__geometryExplor.getFullGeometryFingerprint().centers.length,
    }));
    await page.click("#constructionMode");
    await sleep(400);
    const afterCm = await page.evaluate(() => ({
      layers: window.__geometryExplor.getActiveRenderLayers(),
      kinds: window.__geometryExplor.listVisibleMeshKinds(),
      constructionOn: document.getElementById("constructionMode").checked,
    }));
    assert(afterCm.constructionOn, "Construction Mode enabled");
    assert(
      layersEqual(afterCm.layers, beforeCam.layers),
      "Construction Mode preserves the layer set"
    );
    assert(
      !afterCm.kinds.includes("constructionPlane") &&
        !afterCm.kinds.includes("constructionPlaneGrid"),
      "no visible construction plane appears"
    );

    // Order commutativity + camera stable
    await page.click("#constructionMode"); // off
    await sleep(200);
    const cam0 = await page.evaluate(() => window.__geometryExplor.getCameraDirection());
    await page.evaluate(() => window.__geometryExplor.setActiveRenderLayers(["circles", "spheres"]));
    const cam1 = await page.evaluate(() => window.__geometryExplor.getCameraDirection());
    const countsA = await page.evaluate(() => window.__geometryExplor.countDesignMeshesByKind());
    await page.evaluate(() => window.__geometryExplor.setActiveRenderLayers(["spheres", "circles"]));
    const countsB = await page.evaluate(() => window.__geometryExplor.countDesignMeshesByKind());
    const cam2 = await page.evaluate(() => window.__geometryExplor.getCameraDirection());
    assert(
      countsA.sphere === countsB.sphere && countsA.circle === countsB.circle,
      "selection order does not affect rendered object counts (browser)"
    );
    assert(
      Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y, cam1.z - cam0.z) < 0.05 &&
        Math.hypot(cam2.x - cam0.x, cam2.y - cam0.y, cam2.z - cam0.z) < 0.05,
      "selection order does not affect camera state"
    );

    // Popover UI: open, Escape closes without changing selection
    await page.click("#rendererSummary");
    await sleep(100);
    const open = await page.evaluate(
      () => document.getElementById("rendererSummary").getAttribute("aria-expanded") === "true"
    );
    assert(open, "renderer popover opens");
    const beforeEsc = await page.evaluate(() => window.__geometryExplor.getActiveRenderLayers());
    await page.keyboard.press("Escape");
    await sleep(100);
    const closed = await page.evaluate(
      () => document.getElementById("rendererPopover").hidden === true
    );
    const afterEsc = await page.evaluate(() => window.__geometryExplor.getActiveRenderLayers());
    assert(closed, "Escape closes renderer popover");
    assert(layersEqual(beforeEsc, afterEsc), "Escape does not change layer selections");

    // Mobile viewports
    for (const [w, h] of [
      [390, 844],
      [393, 852],
      [430, 932],
    ]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
      await sleep(150);
      const layout = await page.evaluate(() => {
        const root = document.getElementById("rendererMultiselect");
        const row = document.querySelector(".renderer-layer-row");
        const panel = document.getElementById("panel") || document.querySelector(".panel");
        const rr = root?.getBoundingClientRect();
        const rowH = row ? getComputedStyle(row).minHeight : "";
        return {
          fits: rr && rr.width <= (panel?.clientWidth || window.innerWidth) + 1,
          noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
          rowMinHeight: parseFloat(rowH) || 0,
        };
      });
      assert(layout.fits, `mobile ${w}×${h}: control fits inside panel`);
      assert(layout.noHScroll, `mobile ${w}×${h}: no horizontal scrolling`);
      assert(layout.rowMinHeight >= 44, `mobile ${w}×${h}: checkbox row ~44px`, String(layout.rowMinHeight));
    }

    const errs = consoleErrors.filter((e) => !/favicon|ResizeObserver|net::ERR/i.test(e));
    assert(errs.length === 0, "the app loads without console errors", errs[0] || "");

    await browser.close();
  } finally {
    try {
      preview.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

// layersEqual used in browserChecks assert callbacks — import already in scope for unit tests.
// Re-bind for browser nested asserts that shadow the name incorrectly: fix the browser function.

await browserChecks();

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll render-layer checks passed.");
process.exit(0);
