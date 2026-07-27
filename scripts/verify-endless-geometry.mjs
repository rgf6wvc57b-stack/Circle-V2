/**
 * Endless geometry — expanding Flower-of-Life hex lattice.
 * Run: node scripts/verify-endless-geometry.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import * as THREE from "three";
import {
  generateEndlessGeometry,
  hexLatticeCenterCount,
  ENDLESS_DEFAULT_RINGS,
  ENDLESS_MAX_RINGS,
  ENDLESS_MIN_RINGS,
} from "../src/engine/generators/endless.js";
import {
  generateFlowerOfLife,
  FLOWER_OF_LIFE_CENTER_IDS,
} from "../src/engine/generators/flowerOfLife.js";
import { generateGeometry, listGeometryOptions } from "../src/engine/generators/index.js";
import { ConstructionEngine } from "../src/engine/index.js";
import { RENDER_LAYERS } from "../src/engine/renderer/uiRenderModes.js";

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

const R = 1.2;

// --- Catalog / menu ---
{
  const menu = listGeometryOptions().map((g) => g.id);
  assert(menu.includes("endless"), "Endless appears in the geometry dropdown");
  const idxFol = menu.indexOf("flowerOfLife");
  const idxEnd = menu.indexOf("endless");
  assert(idxEnd === idxFol + 1, "Endless is listed after Flower of Life");
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert(/id="endlessControls"/.test(html), "Endless expansion controls exist in HTML");
  assert(/id="endlessRings"/.test(html), "Expansion Ring Count control present");
  assert(/id="endlessExpansionStep"/.test(html), "Expansion Step control present");
  assert(/id="endlessAutoExpand"/.test(html), "Auto Expand control present");
  assert(/id="endlessReset"/.test(html), "Reset Expansion control present");
}

// --- Counts / formula ---
{
  const expected = { 1: 7, 2: 19, 3: 37, 4: 61, 5: 91, 6: 127, 7: 169, 8: 217 };
  for (const [rings, n] of Object.entries(expected)) {
    assert(
      hexLatticeCenterCount(Number(rings)) === n,
      `hexLatticeCenterCount(${rings}) === ${n}`
    );
    const data = generateEndlessGeometry(R, {
      rings: Number(rings),
      expansionStep: Number(rings),
    });
    assert(
      data.sphereCenters.length === n,
      `ring count ${rings} changes geometry size to ${n}`,
      String(data.sphereCenters.length)
    );
  }
  assert(ENDLESS_MIN_RINGS === 1 && ENDLESS_MAX_RINGS === 8, "safe ring limits 1..8");
  assert(ENDLESS_DEFAULT_RINGS === 4, "default rings is 4 (61 centers)");
}

// --- FoL parity at rings=2 ---
{
  const fol = generateFlowerOfLife(R);
  const endless = generateEndlessGeometry(R, { rings: 2, expansionStep: 2 });
  assert(endless.sphereCenters.length === 19, "Endless R=2 has 19 centers");
  const byE = new Map(endless.points.map((p) => [p.id, p]));
  let coordsOk = true;
  for (const id of FLOWER_OF_LIFE_CENTER_IDS) {
    const a = fol.points.find((p) => p.id === id);
    const b = byE.get(id);
    if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)) > 1e-9) {
      coordsOk = false;
      console.error("mismatch", id, a, b);
    }
  }
  assert(coordsOk, "Endless R=2 matches Flower of Life center coordinates");
  assert(
    FLOWER_OF_LIFE_CENTER_IDS.every((id) => byE.has(id)),
    "Endless R=2 includes every FoL center ID"
  );
}

// --- Equal radius + neighbor spacing ---
{
  const data = generateEndlessGeometry(R, { rings: 4, expansionStep: 4 });
  assert(
    data.sphereCenters.every((s) => Math.abs(s.radius - R) < 1e-12),
    "equal-radius construction is preserved"
  );
  const byId = new Map(data.points.map((p) => [p.id, p]));
  let neighborOk = true;
  for (const e of data.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    const d = Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
    if (Math.abs(d - R) > 1e-6) {
      neighborOk = false;
      console.error("bad edge spacing", e.id, d);
    }
  }
  assert(neighborOk, "generated centers follow canonical spacing (edge length = radius)");
  // Outer rings exist beyond FoL
  const maxRing = Math.max(...data.points.map((p) => p.meta?.endlessRing ?? 0));
  assert(maxRing === 4, "expansion reaches ring depth 4", String(maxRing));
}

// --- Expansion step filters rings ---
{
  const full = generateEndlessGeometry(R, { rings: 5, expansionStep: 5 });
  const mid = generateEndlessGeometry(R, { rings: 5, expansionStep: 3 });
  assert(full.sphereCenters.length === 91, "full R=5 has 91 centers");
  assert(mid.sphereCenters.length === 37, "expansion step 3 shows 37 centers");
  assert(
    mid.points.every((p) => (p.meta?.endlessRing ?? 0) <= 3),
    "expansion step only includes rings ≤ step"
  );
}

// --- Determinism ---
{
  const a = generateEndlessGeometry(R, { rings: 4, expansionStep: 4 });
  const b = generateEndlessGeometry(R, { rings: 4, expansionStep: 4 });
  assert(
    JSON.stringify(a.points) === JSON.stringify(b.points),
    "Endless rebuilds deterministically"
  );
}

// --- Engine / renderer layers ---
{
  const group = new THREE.Group();
  const engine = new ConstructionEngine(group);
  engine.geometryOpts = { rings: 3, expansionStep: 3 };
  engine.setGeometry("endless");
  engine.setConstructionMode(false);
  engine.setStep(engine.getMaxStep());
  engine.redraw();
  assert(engine.getFullData()?.sphereCenters?.length === 37, "engine loads Endless");
  engine.setActiveRenderLayers([
    RENDER_LAYERS.spheres,
    RENDER_LAYERS.circles,
    RENDER_LAYERS.points,
    RENDER_LAYERS.connections,
  ]);
  const kinds = { sphere: 0, circle: 0, point: 0, line: 0 };
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    const k = obj.userData?.kind;
    if (k && Object.prototype.hasOwnProperty.call(kinds, k)) kinds[k] += 1;
  });
  assert(
    kinds.sphere === 37 && kinds.circle === 37 && kinds.point === 37 && kinds.line > 0,
    "renderers still display correctly on Endless",
    JSON.stringify(kinds)
  );

  engine.setGeometry("flowerOfLife");
  engine.setStep(engine.getMaxStep());
  assert(engine.getFullData()?.sphereCenters?.length === 19, "switch to FoL works");
  engine.geometryOpts = { rings: 4, expansionStep: 2 };
  engine.setGeometry("endless");
  engine.setStep(engine.getMaxStep());
  assert(
    engine.getFullData()?.sphereCenters?.length === 19,
    "switch FoL → Endless works (step 2 = FoL size)"
  );
}

// --- generateGeometry opts forwarding ---
{
  const data = generateGeometry("endless", R, { rings: 3, expansionStep: 2 });
  assert(data.sphereCenters.length === 19, "generateGeometry forwards endless opts");
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
  const PORT = process.env.PORT || "4295";
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

    const menu = await page.$$eval("#geometry option", (opts) => opts.map((o) => o.value));
    assert(menu.includes("endless"), "browser: Endless in geometry dropdown");

    await page.select("#geometry", "endless");
    await sleep(400);
    const controlsVisible = await page.evaluate(
      () => !document.getElementById("endlessControls").hidden
    );
    assert(controlsVisible, "Endless controls shown when selected");

    await page.evaluate(() => {
      window.__geometryExplor.setEndlessRings(4);
      window.__geometryExplor.setEndlessExpansionStep(4);
    });
    await sleep(300);
    let state = await page.evaluate(() => window.__geometryExplor.getEndlessState());
    assert(state.centersVisible === 61, "browser: ring 4 shows 61 centers", String(state.centersVisible));

    await page.evaluate(() => window.__geometryExplor.setEndlessExpansionStep(2));
    await sleep(300);
    state = await page.evaluate(() => window.__geometryExplor.getEndlessState());
    assert(state.centersVisible === 19, "browser: expansion step 2 = FoL size");

    await page.select("#geometry", "flowerOfLife");
    await sleep(300);
    await page.$eval("#layers", (el) => {
      el.value = el.max;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(200);
    const folCount = await page.evaluate(
      () => window.__geometryExplor.getFullGeometryFingerprint().centers.length
    );
    assert(folCount === 19, "browser: Flower of Life still 19");

    await page.select("#geometry", "endless");
    await sleep(300);
    await page.evaluate(() => {
      window.__geometryExplor.setEndlessRings(3);
      window.__geometryExplor.setEndlessExpansionStep(3);
      window.__geometryExplor.setActiveRenderLayers([
        "spheres",
        "circles",
        "points",
        "connections",
      ]);
    });
    await sleep(300);
    const kinds = await page.evaluate(() => window.__geometryExplor.countDesignMeshesByKind());
    assert(
      kinds.sphere === 37 && kinds.circle === 37 && kinds.point === 37 && kinds.line > 0,
      "browser: multi-layer renderers work on Endless",
      JSON.stringify(kinds)
    );

    await page.evaluate(() => window.__geometryExplor.resetEndlessExpansion());
    await sleep(200);
    state = await page.evaluate(() => window.__geometryExplor.getEndlessState());
    assert(
      state.rings === 4 && state.expansionStep === 4 && state.centersVisible === 61,
      "Reset Expansion restores default rings"
    );

    for (const [w, h] of [
      [390, 844],
      [393, 852],
      [430, 932],
    ]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
      await sleep(120);
      const layout = await page.evaluate(() => ({
        noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
        controls: !document.getElementById("endlessControls").hidden,
      }));
      assert(layout.noHScroll, `mobile ${w}×${h}: no horizontal scrolling`);
      assert(layout.controls, `mobile ${w}×${h}: Endless controls visible`);
    }

    const errs = consoleErrors.filter((e) => !/favicon|ResizeObserver|net::ERR/i.test(e));
    assert(errs.length === 0, "no console/runtime errors", errs[0] || "");

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
console.log("\nAll Endless geometry checks passed.");
process.exit(0);
