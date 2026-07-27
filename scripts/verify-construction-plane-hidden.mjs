/**
 * Construction Mode must not render a slicing filled construction plane.
 * Run: node scripts/verify-construction-plane-hidden.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import * as THREE from "three";
import { ConstructionEngine } from "../src/engine/index.js";
import { RENDER_MODES } from "../src/engine/renderer/GeometryRenderer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const mainSrc = readFileSync(join(root, "src/main.js"), "utf8");
const rendererSrc = readFileSync(join(root, "src/engine/renderer/GeometryRenderer.js"), "utf8");

let failed = 0;
function assert(cond, msg, detail = "") {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg, detail ? `— ${detail}` : "");
  } else {
    console.log("PASS:", msg, detail ? `— ${detail}` : "");
  }
}

// --- Static: Construction Mode no longer forces constructionPlane renderer ---
{
  const enter = mainSrc.match(/function enterConstructionMode\(\)[\s\S]*?\n\}/)?.[0] || "";
  assert(enter.length > 0, "enterConstructionMode found");
  assert(
    !/setRenderMode\(\s*["']constructionPlane["']\s*\)/.test(enter),
    "enterConstructionMode does not switch to constructionPlane renderer"
  );
  assert(
    !/ui\.renderMode\s*=\s*["']constructionPlane["']/.test(enter),
    "enterConstructionMode does not assign constructionPlane renderMode"
  );
  assert(
    /Do not reframe|preserve camera/i.test(enter),
    "enterConstructionMode documents that camera is preserved"
  );
  assert(
    !/frameActiveConstruction\s*\(/.test(enter),
    "enterConstructionMode does not reframe the camera"
  );
}

// --- Static: filled plane mesh removed from constructionPlane renderer path ---
{
  // Match the method definition, not the redraw() call site.
  const modeFn =
    rendererSrc.match(
      /#renderConstructionPlaneMode\(\) \{\n[\s\S]*?\n  \}/
    )?.[0] || "";
  assert(modeFn.length > 0, "renderConstructionPlaneMode found");
  assert(
    !/new THREE\.Mesh\(\s*createConstructionPlaneXY/.test(modeFn),
    "constructionPlane mode does not create a filled plane mesh"
  );
  assert(
    !/new THREE\.GridHelper/.test(modeFn),
    "constructionPlane mode does not create a GridHelper sheet"
  );
  assert(
    /Do NOT render a filled/i.test(modeFn) || /conceptual/i.test(modeFn),
    "constructionPlane mode documents invisible mathematical plane"
  );
  // Helper still exists for optional Display overlay
  assert(
    /createConstructionPlaneXY/.test(
      readFileSync(join(root, "src/exploration/DisplayOverlays.js"), "utf8")
    ),
    "plane geometry helper remains available for optional Display overlay"
  );
}

// --- Unit: constructionPlane mode meshes have no plane kind ---
{
  const group = new THREE.Group();
  const engine = new ConstructionEngine(group);
  engine.setGeometry("flowerOfLife");
  engine.setRenderMode(RENDER_MODES.constructionPlane);
  engine.setConstructionMode(true);
  engine.setStep(engine.getMaxStep());
  engine.redraw();

  const kinds = [];
  group.traverse((obj) => {
    if (obj.userData?.kind) kinds.push(obj.userData.kind);
    if (obj.type === "GridHelper") kinds.push("GridHelper");
  });
  assert(
    !kinds.includes("constructionPlane"),
    "no mesh with kind=constructionPlane after constructionPlane redraw"
  );
  assert(!kinds.includes("constructionPlaneGrid"), "no constructionPlaneGrid mesh");
  assert(!kinds.includes("GridHelper"), "no GridHelper in constructionPlane redraw");
  assert(kinds.includes("sphere") || kinds.includes("compassCircle"), "still renders spheres/circles");

  // Coordinates unchanged vs mixed/spheres full data
  const full = engine.getFullData();
  engine.setRenderMode("spheres");
  engine.setConstructionMode(false);
  engine.setStep(engine.getMaxStep());
  const normal = engine.getFullData();
  assert(
    full.sphereCenters.length === normal.sphereCenters.length,
    "construction plane mode uses same sphere count as normal FoL"
  );
  const sameCoords = full.sphereCenters.every((s, i) => {
    const a = full.points.find((p) => p.id === s.pointId);
    const b = normal.points.find((p) => p.id === normal.sphereCenters[i].pointId);
    return a && b && a.x === b.x && a.y === b.y && a.z === b.z && s.radius === normal.sphereCenters[i].radius;
  });
  assert(sameCoords, "Flower of Life coordinates unchanged by constructionPlane renderer");
}

async function ensurePuppeteer() {
  const require = createRequire(import.meta.url);
  try {
    return require("puppeteer-core");
  } catch {
    await new Promise((resolve, reject) => {
      const p = spawn("npm", ["install", "--no-save", "puppeteer-core@24"], {
        stdio: "inherit",
        cwd: "/workspace",
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
  const PORT = process.env.PORT || "4255";
  const BASE = `http://127.0.0.1:${PORT}/-Geometry-Explor/`;

  await new Promise((resolve, reject) => {
    const b = spawn("npm", ["run", "build"], { cwd: "/workspace", stdio: "inherit" });
    b.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("build failed"))));
  });

  const preview = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", PORT], {
    cwd: "/workspace",
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
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
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
    await page.evaluate(() => window.__geometryExplor.setActiveRenderLayers(["spheres"]));
    await sleep(400);
    // Baseline must be the completed Flower of Life (max layer), not step 1.
    await page.$eval("#layers", (el) => {
      el.value = el.max;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(200);
    await page.evaluate(() => {
      window.__geometryExplor.frameTutorialGeometry({ animate: false, duration: 0 });
    });
    await sleep(100);

    const before = await page.evaluate(() => ({
      dir: window.__geometryExplor.getCameraDirection(),
      dist: window.__geometryExplor.getCameraDistance(),
      rot: window.__geometryExplor.getDesignRotation(),
      fp: window.__geometryExplor.getGeometryFingerprint(),
      kinds: window.__geometryExplor.listVisibleMeshKinds(),
      renderer: window.__geometryExplor.getActiveRenderLayers().join(","),
    }));
    assert(
      before.fp.centers.length >= 19,
      "normal viewing baseline is completed Flower of Life",
      `centers=${before.fp.centers.length}`
    );

    // Enable Construction Mode
    await page.click("#constructionMode");
    await sleep(600);

    const after = await page.evaluate(() => ({
      dir: window.__geometryExplor.getCameraDirection(),
      dist: window.__geometryExplor.getCameraDistance(),
      rot: window.__geometryExplor.getDesignRotation(),
      fp: window.__geometryExplor.getGeometryFingerprint(),
      kinds: window.__geometryExplor.listVisibleMeshKinds(),
      renderer: window.__geometryExplor.getActiveRenderLayers().join(","),
      constructionOn: document.getElementById("constructionMode").checked,
      step: window.__geometryExplor.getPlayerState()?.displayStep,
      total: window.__geometryExplor.getPlayerState()?.totalSteps,
    }));

    assert(after.constructionOn, "Construction Mode is enabled");
    assert(
      after.renderer === before.renderer,
      "turning Construction Mode on does not change renderer selection",
      `${before.renderer} → ${after.renderer}`
    );
    assert(
      !after.kinds.includes("constructionPlane") &&
        !after.kinds.includes("constructionPlaneGrid") &&
        !after.kinds.includes("GridHelper"),
      "no visible filled construction plane exists in Construction Mode",
      JSON.stringify(after.kinds.filter((k) => /plane|Grid/i.test(k)))
    );
    assert(
      after.kinds.some((k) => k === "sphere" || k === "compassCircle"),
      "Construction Mode still shows spheres/circles"
    );

    const dirDelta = Math.hypot(
      after.dir.x - before.dir.x,
      after.dir.y - before.dir.y,
      after.dir.z - before.dir.z
    );
    assert(dirDelta < 0.05, "turning Construction Mode on does not change camera orientation", `Δ=${dirDelta.toFixed(4)}`);
    assert(
      Math.abs(after.dist - before.dist) < 0.05,
      "turning Construction Mode on does not change camera distance",
      `${before.dist.toFixed(3)} → ${after.dist.toFixed(3)}`
    );
    assert(
      Math.hypot(
        after.rot.x - before.rot.x,
        after.rot.y - before.rot.y,
        after.rot.z - before.rot.z
      ) < 1e-6,
      "turning Construction Mode on does not change object rotation"
    );

    // Geometry fingerprint centers match (same FoL coordinates)
    const beforeIds = before.fp.centers.map((c) => c.pointId).sort().join(",");
    // After construction restart, step 1 may show fewer spheres — jump to final
    await page.$eval("#constructionStepSlider", (el) => {
      el.value = el.max;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(500);

    const final = await page.evaluate(() => ({
      visible: window.__geometryExplor.getGeometryFingerprint(),
      full: window.__geometryExplor.getFullGeometryFingerprint(),
      kinds: window.__geometryExplor.listVisibleMeshKinds(),
    }));
    assert(
      final.visible.centers.length === before.fp.centers.length,
      "completed Construction Mode geometry matches normal Flower of Life sphere count",
      `${final.visible.centers.length} vs ${before.fp.centers.length}`
    );
    const coordsMatch = final.visible.centers.every((c) => {
      const b = before.fp.centers.find((x) => x.pointId === c.pointId || x.id === c.id);
      return (
        b &&
        Math.abs(b.x - c.x) < 1e-9 &&
        Math.abs(b.y - c.y) < 1e-9 &&
        Math.abs(b.z - c.z) < 1e-9 &&
        Math.abs(b.r - c.r) < 1e-9
      );
    });
    assert(coordsMatch, "turning Construction Mode on does not change geometry coordinates");
    assert(
      final.full.centers.length === before.fp.centers.length &&
        final.full.centers.every((c) => {
          const b = before.fp.centers.find((x) => x.pointId === c.pointId);
          return b && b.x === c.x && b.y === c.y && b.z === c.z && b.r === c.r;
        }),
      "canonical Flower of Life full-data fingerprint unchanged by Construction Mode"
    );
    assert(
      !final.kinds.includes("constructionPlane") &&
        !final.kinds.includes("constructionPlaneGrid"),
      "final construction step still has no slicing plane"
    );

    // Face-on: after tutorial-style frame, direction mostly +Z
    await page.evaluate(() => {
      window.__geometryExplor.frameTutorialGeometry({ animate: false, duration: 0 });
    });
    await sleep(100);
    const face = await page.evaluate(() => window.__geometryExplor.getCameraDirection());
    assert(
      Math.abs(face.z) > 0.85 && Math.abs(face.x) < 0.35 && Math.abs(face.y) < 0.35,
      "Flower of Life remains face-on (camera along +Z)",
      JSON.stringify(face)
    );

    // Canonical step reveal: step 1 has fewer spheres than final
    await page.$eval("#constructionStepSlider", (el) => {
      el.value = "1";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(300);
    const step1 = await page.evaluate(() => window.__geometryExplor.getGeometryFingerprint());
    assert(
      step1.centers.length < final.visible.centers.length && step1.centers.length >= 1,
      "construction steps still reveal the correct canonical elements",
      `step1=${step1.centers.length} final=${final.visible.centers.length}`
    );

    // Toggle Display overlay plane ON then OFF — default path must remain off
    const overlayDefault = await page.evaluate(() => {
      const tog = document.getElementById("togPlane");
      return { exists: Boolean(tog), checked: Boolean(tog?.checked) };
    });
    assert(
      !overlayDefault.checked,
      "Display Construction Plane overlay is off by default"
    );

    const kindsOff = await page.evaluate(() => window.__geometryExplor.listVisibleMeshKinds());
    assert(
      !kindsOff.includes("constructionPlane"),
      "no large rectangular sheet intersects the Flower of Life by default"
    );

    const errs = consoleErrors.filter((e) => !/favicon|ResizeObserver|net::ERR/i.test(e));
    assert(errs.length === 0, "browser regression has no console errors", errs[0] || "");

    void beforeIds;
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
console.log("\nAll construction-plane-hidden checks passed.");
process.exit(0);
