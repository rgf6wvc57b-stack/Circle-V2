/**
 * Independent per-renderer-layer color / opacity / thickness / size.
 * Run: node scripts/verify-render-layer-styles.mjs
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
  DEFAULT_RENDER_LAYER_STYLES,
  createRenderLayerStyles,
  patchRenderLayerStyle,
  resetRenderLayerStyles,
  snapshotRenderLayerStyles,
} from "../src/app/renderLayerStyles.js";
import { DEFAULT_SPHERE_COLOR, DEFAULT_SPHERE_OPACITY } from "../src/app/sphereColorState.js";

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

function hexClose(a, b) {
  return String(a || "").replace("#", "").toUpperCase() === String(b || "").replace("#", "").toUpperCase();
}

// --- Unit: independent state ---
{
  const styles = createRenderLayerStyles();
  assert(
    styles.spheres.color.toUpperCase() === DEFAULT_SPHERE_COLOR.toUpperCase() &&
      styles.spheres.opacity === DEFAULT_SPHERE_OPACITY,
    "default spheres style is soft yellow @ 45%"
  );
  assert(styles.circles.color.toUpperCase() === "#7FD6FF", "default circles color");
  assert(styles.points.color.toUpperCase() === "#FFD166", "default points color");
  assert(styles.connections.color.toUpperCase() === "#7AE7C7", "default connections color");
  assert(styles.circles.opacity === 0.9 && styles.connections.opacity === 0.9, "default outline/line opacity 90%");
  assert(styles.points.opacity === 1, "default points opacity 100%");

  const before = snapshotRenderLayerStyles(styles);
  patchRenderLayerStyle(styles, "spheres", { color: "#112233", opacity: 0.2 });
  assert(styles.spheres.color === "#112233" && styles.spheres.opacity === 0.2, "sphere style mutates");
  assert(styles.circles.color === before.circles.color, "changing sphere color does not change circles");
  assert(styles.points.color === before.points.color, "changing sphere color does not change points");
  assert(styles.connections.color === before.connections.color, "changing sphere color does not change connections");

  patchRenderLayerStyle(styles, "circles", { color: "#AABBCC", opacity: 0.55, thickness: 1.5 });
  assert(styles.circles.color === "#AABBCC", "circle color independent");
  assert(styles.spheres.color === "#112233", "changing circle color does not change spheres");
  assert(styles.points.opacity === before.points.opacity, "circle opacity change does not affect points");
  assert(styles.circles.thickness === 1.5, "circle thickness tied only to circles");

  patchRenderLayerStyle(styles, "points", { color: "#010101", opacity: 0.33, size: 2 });
  assert(styles.points.color === "#010101" && styles.points.size === 2, "point style independent");
  assert(styles.circles.thickness === 1.5, "point size change does not alter circle thickness");

  patchRenderLayerStyle(styles, "connections", { color: "#00FF00", opacity: 0.1, thickness: 2.2 });
  assert(styles.connections.color === "#00FF00", "connection color independent");
  assert(styles.circles.color === "#AABBCC", "connection color change does not affect circles");
  assert(styles.connections.thickness === 2.2, "connection thickness tied only to connections");

  resetRenderLayerStyles(styles);
  const resetSnap = snapshotRenderLayerStyles(styles);
  assert(
    JSON.stringify(resetSnap) === JSON.stringify(snapshotRenderLayerStyles(DEFAULT_RENDER_LAYER_STYLES)),
    "Reset Controls restores all visual defaults (state helper)"
  );
}

// --- Unit: renderer consumes independent styles ---
{
  const group = new THREE.Group();
  const engine = new ConstructionEngine(group);
  engine.setGeometry("flowerOfLife");
  engine.setStep(engine.getMaxStep());
  const styles = createRenderLayerStyles();
  patchRenderLayerStyle(styles, "spheres", { color: "#FF0000", opacity: 0.4 });
  patchRenderLayerStyle(styles, "circles", { color: "#00FF00", opacity: 0.8 });
  patchRenderLayerStyle(styles, "points", { color: "#0000FF", opacity: 1 });
  patchRenderLayerStyle(styles, "connections", { color: "#FFFF00", opacity: 0.7 });
  engine.setActiveRenderLayers(["spheres", "circles", "points", "connections"]);
  engine.setAppearance({ renderLayerStyles: styles, pathThickness: 1 });

  const sampled = { sphere: null, circle: null, point: null, line: null };
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    const k = obj.userData?.kind;
    if (!k || sampled[k]) return;
    sampled[k] = `#${obj.material.color.getHexString().toUpperCase()}`;
  });
  assert(hexClose(sampled.sphere, "#FF0000"), "renderer spheres use sphere style color", sampled.sphere);
  assert(hexClose(sampled.circle, "#00FF00"), "renderer circles use circle style color", sampled.circle);
  assert(hexClose(sampled.point, "#0000FF"), "renderer points use point style color", sampled.point);
  assert(hexClose(sampled.line, "#FFFF00"), "renderer lines use connection style color", sampled.line);

  // Independence after recolor via updateLayerStyles
  patchRenderLayerStyle(styles, "circles", { color: "#ABCDEF" });
  engine.updateLayerStyles({ renderLayerStyles: styles });
  let circleHex = null;
  let sphereHex = null;
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.userData?.kind === "circle" && !circleHex) {
      circleHex = `#${obj.material.color.getHexString().toUpperCase()}`;
    }
    if (obj.userData?.kind === "sphere" && !sphereHex) {
      sphereHex = `#${obj.material.color.getHexString().toUpperCase()}`;
    }
  });
  assert(hexClose(circleHex, "#ABCDEF"), "updateLayerStyles changes circle color");
  assert(hexClose(sphereHex, "#FF0000"), "updateLayerStyles leaves sphere color alone");
}

// --- Static UI ---
{
  const html = readFileSync(join(root, "index.html"), "utf8");
  const mainSrc = readFileSync(join(root, "src/main.js"), "utf8");
  assert(/id="rendererAppearance"/.test(html), "renderer appearance section present");
  for (const id of ["spheres", "circles", "points", "connections"]) {
    assert(html.includes(`data-layer-style="${id}"`), `style controls for ${id}`);
  }
  assert(/renderLayerStyles/.test(mainSrc), "main stores renderLayerStyles");
  assert(/resetRenderLayerStyles/.test(mainSrc), "Reset Controls restores layer styles");
  assert(/applyRenderLayerStylePatch/.test(mainSrc), "style patch helper wired");
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
  const PORT = process.env.PORT || "4275";
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
    await page.$eval("#layers", (el) => {
      el.value = el.max;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.evaluate(() =>
      window.__geometryExplor.setActiveRenderLayers([
        "spheres",
        "circles",
        "points",
        "connections",
      ])
    );
    await sleep(300);

    const baseline = await page.evaluate(() => window.__geometryExplor.getRenderLayerStyles());
    assert(
      baseline.spheres.color === DEFAULT_SPHERE_COLOR.toUpperCase() ||
        baseline.spheres.color === DEFAULT_SPHERE_COLOR,
      "browser default sphere color",
      baseline.spheres.color
    );

    await page.evaluate(() => {
      window.__geometryExplor.setRenderLayerStyle("spheres", {
        color: "#AA1111",
        opacity: 0.3,
      });
    });
    await sleep(150);
    let styles = await page.evaluate(() => window.__geometryExplor.getRenderLayerStyles());
    assert(styles.spheres.color === "#AA1111", "sphere color updated");
    assert(styles.circles.color === baseline.circles.color, "sphere recolor leaves circles");
    assert(styles.points.color === baseline.points.color, "sphere recolor leaves points");
    assert(styles.connections.color === baseline.connections.color, "sphere recolor leaves connections");

    await page.evaluate(() => {
      window.__geometryExplor.setRenderLayerStyle("circles", {
        color: "#11AA11",
        opacity: 0.6,
        thickness: 1.4,
      });
    });
    await sleep(200);
    styles = await page.evaluate(() => window.__geometryExplor.getRenderLayerStyles());
    assert(styles.circles.color === "#11AA11", "circle color updated");
    assert(styles.spheres.color === "#AA1111", "circle recolor leaves spheres");
    assert(styles.circles.thickness === 1.4, "circle thickness independent");

    await page.evaluate(() => {
      window.__geometryExplor.setRenderLayerStyle("points", {
        color: "#1111AA",
        opacity: 0.85,
        size: 1.6,
      });
    });
    await sleep(200);
    styles = await page.evaluate(() => window.__geometryExplor.getRenderLayerStyles());
    assert(styles.points.color === "#1111AA" && styles.points.size === 1.6, "point style independent");
    assert(styles.circles.thickness === 1.4, "point size does not change circle thickness");

    await page.evaluate(() => {
      window.__geometryExplor.setRenderLayerStyle("connections", {
        color: "#AAAA11",
        opacity: 0.5,
        thickness: 1.8,
      });
    });
    await sleep(200);
    styles = await page.evaluate(() => window.__geometryExplor.getRenderLayerStyles());
    assert(styles.connections.color === "#AAAA11", "connection color independent");
    assert(styles.connections.thickness === 1.8, "connection thickness independent");
    assert(styles.points.size === 1.6, "connection thickness does not change point size");

    const sampled = await page.evaluate(() => window.__geometryExplor.sampleLayerMeshStyles());
    assert(hexClose(sampled.sphere?.hex, "#AA1111"), "mesh sphere color matches state", JSON.stringify(sampled.sphere));
    assert(hexClose(sampled.circle?.hex, "#11AA11"), "mesh circle color matches state", JSON.stringify(sampled.circle));
    assert(hexClose(sampled.point?.hex, "#1111AA"), "mesh point color matches state", JSON.stringify(sampled.point));
    assert(
      sampled.line && hexClose(sampled.line.hex, "#AAAA11"),
      "mesh line color matches state",
      JSON.stringify(sampled.line)
    );

    // Geometry switch preserves colors
    await page.select("#geometry", "seedOfLife");
    await page.$eval("#layers", (el) => {
      el.value = el.max;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(300);
    styles = await page.evaluate(() => window.__geometryExplor.getRenderLayerStyles());
    assert(styles.spheres.color === "#AA1111", "geometry switching preserves sphere color");
    assert(styles.circles.color === "#11AA11", "geometry switching preserves circle color");
    assert(styles.points.color === "#1111AA", "geometry switching preserves point color");
    assert(styles.connections.color === "#AAAA11", "geometry switching preserves connection color");

    // Construction Mode preserves colors
    await page.click("#constructionMode");
    await sleep(400);
    styles = await page.evaluate(() => window.__geometryExplor.getRenderLayerStyles());
    assert(styles.spheres.color === "#AA1111", "Construction Mode preserves sphere color");
    assert(styles.circles.color === "#11AA11", "Construction Mode preserves circle color");
    await page.click("#constructionMode");
    await sleep(200);

    // Reset restores defaults
    await page.click("#resetControls");
    await sleep(400);
    styles = await page.evaluate(() => window.__geometryExplor.getRenderLayerStyles());
    assert(
      styles.spheres.opacity === DEFAULT_SPHERE_OPACITY &&
        hexClose(styles.spheres.color, DEFAULT_SPHERE_COLOR),
      "Reset Controls restores sphere defaults"
    );
    assert(hexClose(styles.circles.color, "#7FD6FF"), "Reset restores circle color");
    assert(hexClose(styles.points.color, "#FFD166"), "Reset restores point color");
    assert(hexClose(styles.connections.color, "#7AE7C7"), "Reset restores connection color");

    // No duplicates after toggle + recolor (use FoL which has connection edges)
    await page.select("#geometry", "flowerOfLife");
    await page.$eval("#layers", (el) => {
      el.value = el.max;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(300);
    await page.evaluate(() => {
      window.__geometryExplor.setActiveRenderLayers([
        "spheres",
        "circles",
        "points",
        "connections",
      ]);
      window.__geometryExplor.setRenderLayerStyle("spheres", { color: "#CCCC00", opacity: 0.45 });
      window.__geometryExplor.setActiveRenderLayers(["spheres"]);
      window.__geometryExplor.setActiveRenderLayers([
        "spheres",
        "circles",
        "points",
        "connections",
      ]);
      window.__geometryExplor.setRenderLayerStyle("circles", { color: "#00CCCC" });
    });
    await sleep(300);
    const dupCheck = await page.evaluate(() => {
      const counts = window.__geometryExplor.countDesignMeshesByKind();
      const uuids = [];
      // design meshes are counted; also verify no duplicate edge ids
      return { counts };
    });
    assert(
      dupCheck.counts.sphere > 0 &&
        dupCheck.counts.circle > 0 &&
        dupCheck.counts.point > 0 &&
        dupCheck.counts.line > 0,
      "layers present after toggle+recolor",
      JSON.stringify(dupCheck.counts)
    );
    assert(
      dupCheck.counts.sphere === 19 &&
        dupCheck.counts.circle === 19 &&
        dupCheck.counts.point === 19 &&
        dupCheck.counts.line === 42,
      "no duplicate render objects after repeated toggling and recoloring",
      JSON.stringify(dupCheck.counts)
    );

    // Mobile layout
    for (const [w, h] of [
      [390, 844],
      [393, 852],
      [430, 932],
    ]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
      await page.evaluate(() =>
        window.__geometryExplor.setActiveRenderLayers([
          "spheres",
          "circles",
          "points",
          "connections",
        ])
      );
      await sleep(150);
      const layout = await page.evaluate(() => {
        const appearance = document.getElementById("rendererAppearance");
        const panel = document.getElementById("panel");
        const rr = appearance?.getBoundingClientRect();
        return {
          fits: rr && rr.width <= (panel?.clientWidth || window.innerWidth) + 2,
          noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
          hasColor: Boolean(document.getElementById("layerColor-spheres")),
        };
      });
      assert(layout.fits, `mobile ${w}×${h}: appearance fits panel`);
      assert(layout.noHScroll, `mobile ${w}×${h}: no horizontal scrolling`);
      assert(layout.hasColor, `mobile ${w}×${h}: color controls present`);
    }

    const errs = consoleErrors.filter((e) => !/favicon|ResizeObserver|net::ERR/i.test(e));
    assert(errs.length === 0, "no console errors occur", errs[0] || "");

    await browser.close();
  } finally {
    try {
      preview.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

await browserChecks();

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll render-layer-style checks passed.");
process.exit(0);
