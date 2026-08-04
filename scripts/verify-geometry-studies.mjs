/**
 * Geometry study / poster engine verification.
 * Run: node scripts/verify-geometry-studies.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import * as THREE from "three";
import { STUDY_REGISTRY, getStudyById } from "../src/studies/registry.js";
import { stellatedOctahedron, vesicaPiscisConstruction } from "../src/geometry/solids/catalog.js";
import { StudyController } from "../src/studies/StudyController.js";
import { MERKABA_STUDY } from "../src/studies/definitions/merkabaStudy.js";

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

assert(STUDY_REGISTRY.length === 2, "study registry has two studies");
assert(getStudyById("merkaba-stellated-octahedron"), "merkaba study registered");
assert(getStudyById("dimensional-relationships"), "dimensional study registered");

const merkabaSrc = readFileSync(join(root, "src/studies/definitions/merkabaStudy.js"), "utf8");
assert(!/export const DIMENSIONAL_STUDY/.test(merkabaSrc), "merkaba study file has no duplicate DIMENSIONAL_STUDY export");

const polySrc = readFileSync(join(root, "src/geometry/primitives/polyhedron.js"), "utf8");
assert(!/completeEdges/.test(polySrc), "dead completeEdges helper removed");
assert(!/cubeEdges/.test(polySrc), "broken cubeEdges helper removed");

const merkaba = stellatedOctahedron(1);
assert(merkaba.vertices.length === 8, "stellated octahedron has 8 vertices");
assert(merkaba.edges.length === 12, "stellated octahedron has 12 edges");
assert(merkaba.triFaces.length === 8, "stellated octahedron has 8 triangular faces");

const vesica = vesicaPiscisConstruction(1);
assert(vesica.squareVerts.length === 4, "vesica construction includes inscribed square");
assert(Math.abs(vesica.width - 1) < 1e-9, "vesica width matches radius");

const html = readFileSync(join(root, "index.html"), "utf8");
assert(/Geometry Studies/.test(html), "study UI section present");
assert(/studyModeEnabled/.test(html), "study mode toggle present");
assert(/studyExportPoster/.test(html), "poster export button present");
assert(/studyLineWidth/.test(html), "line thickness slider present");
assert(!/<div id="studyPosterRoot"[^>]*aria-hidden="true"/.test(html), "poster root has no permanent aria-hidden");

const main = readFileSync(join(root, "src/main.js"), "utf8");
assert(/StudyController/.test(main), "StudyController wired in main.js");
assert(/studyGroup/.test(main), "study group added to scene");

const posterExportSrc = readFileSync(join(root, "src/export/posterExport.js"), "utf8");
assert(/finally\s*\{/.test(posterExportSrc), "poster export uses finally cleanup");
assert(/URL\.revokeObjectURL/.test(posterExportSrc), "poster export revokes object URLs");

// --- Node: transparent/null background restore on study exit ---
{
  const windowStub = { addEventListener() {}, removeEventListener() {} };
  const prevWindow = globalThis.window;
  globalThis.window = windowStub;

  const scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.FogExp2(0x0e1a24, 0.035);

  const posterRoot = {
    hidden: true,
    innerHTML: "",
    querySelectorAll: () => [],
    contains: () => false,
    setAttribute() {},
    addEventListener() {},
  };

  const controller = new StudyController({
    renderer: { domElement: { width: 800, height: 600 } },
    scene,
    cameraController: {
      getActiveCamera: () => ({ aspect: 1, updateProjectionMatrix() {} }),
      frameBox() {},
    },
    posterRoot,
    appRoot: { classList: { add() {}, remove() {}, toggle() {} }, getBoundingClientRect: () => ({ width: 800, height: 600 }) },
    panel: {},
    studyGroup: new THREE.Group(),
  });

  controller.enter(MERKABA_STUDY.id);
  assert(scene.background instanceof THREE.Color, "study enter applies poster background");
  assert(scene.fog === null, "study enter clears fog");

  controller.exit();
  assert(scene.background === null, "study exit restores null scene background");
  assert(scene.fog instanceof THREE.FogExp2, "study exit restores previous fog");

  globalThis.window = prevWindow;
}

await run("npm", ["run", "build"]);

const port = "4311";
const base = `http://127.0.0.1:${port}/`;
const preview = spawn(
  process.execPath,
  [join(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", port],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
);

try {
  await waitForServer(base);
  const puppeteer = await ensurePuppeteer();
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem("geometry-explor:show-intro-on-open", "0");
  });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__studyTestHooks, { timeout: 15000 });

  await page.click("#studyModeEnabled");
  await sleep(800);
  const merkabaActive = await page.evaluate(() => ({
    studyOn: document.getElementById("studyModeEnabled").checked,
    posterVisible: !document.getElementById("studyPosterRoot").hidden,
    ariaHidden: document.getElementById("studyPosterRoot").getAttribute("aria-hidden"),
    title: document.querySelector(".study-title")?.textContent ?? "",
  }));
  assert(merkabaActive.studyOn, "study mode enables");
  assert(merkabaActive.posterVisible, "poster overlay visible");
  assert(merkabaActive.ariaHidden === "false", "poster root aria-hidden toggled off when active", merkabaActive.ariaHidden);
  assert(/Merkaba|Stellated/i.test(merkabaActive.title), "merkaba study title shown", merkabaActive.title);

  await page.select("#studySelect", "dimensional-relationships");
  await sleep(600);
  const dimensional = await page.$eval(".study-title", (el) => el.textContent);
  assert(/Dimensional Relationships/i.test(dimensional), "dimensional study loads");

  await page.click("#studyPosterMode");
  await sleep(300);
  assert(await page.evaluate(() => document.getElementById("app").classList.contains("study-poster-mode")), "poster mode class applied");

  // --- Repeated resize + single blueprint click (no duplicate handlers) ---
  await page.select("#studySelect", "merkaba-stellated-octahedron");
  await sleep(400);
  await page.evaluate(() => {
    for (let i = 0; i < 6; i += 1) window.dispatchEvent(new Event("resize"));
  });
  await sleep(200);
  const beforeClick = await page.evaluate(() => window.__studyTestHooks.getStudyController().sequenceStep);
  await page.click('.study-blueprint-step[data-seq="1"]');
  await sleep(300);
  const afterOneClick = await page.evaluate(() => window.__studyTestHooks.getStudyController().sequenceStep);
  assert(afterOneClick === beforeClick + 1, "blueprint click advances one step after repeated resize", `${beforeClick} -> ${afterOneClick}`);

  // --- Transparent background exit in browser ---
  await page.evaluate(() => {
    const hooks = window.__studyTestHooks;
    const ctrl = hooks.getStudyController();
    ctrl.exit();
    hooks.setSceneBackground(null);
    ctrl.enter("merkaba-stellated-octahedron");
    ctrl.exit();
  });
  const bgRestore = await page.evaluate(() => window.__studyTestHooks.getSceneBackgroundState());
  assert(bgRestore === "null", "browser study exit restores transparent/null background", bgRestore);

  await page.evaluate(() => {
    window.__studyTestHooks.getStudyController().enter("merkaba-stellated-octahedron");
  });
  await sleep(300);

  // --- High-DPI export restoration ---
  const exportRestore = await page.evaluate(async () => {
    const hooks = window.__studyTestHooks;
    const before = hooks.getRendererState();
    const blob = await hooks.exportPosterBlob({ scale: 2 });
    const after = hooks.getRendererState();
    return {
      before,
      after,
      blobSize: blob?.size ?? 0,
      wraps: hooks.countExportWraps(),
    };
  });
  assert(exportRestore.before.width === exportRestore.after.width, "export restores renderer width", `${exportRestore.before.width} vs ${exportRestore.after.width}`);
  assert(exportRestore.before.height === exportRestore.after.height, "export restores renderer height", `${exportRestore.before.height} vs ${exportRestore.after.height}`);
  assert(Math.abs(exportRestore.before.pixelRatio - exportRestore.after.pixelRatio) < 1e-6, "export restores pixel ratio");
  assert(Math.abs(exportRestore.before.aspect - exportRestore.after.aspect) < 1e-6, "export restores camera aspect");
  assert(exportRestore.wraps === 0, "export removes temporary wrapper elements", String(exportRestore.wraps));
  assert(exportRestore.blobSize > 5000, "exported PNG blob has substantial content", String(exportRestore.blobSize));

  // --- Failed-export cleanup ---
  const failedExport = await page.evaluate(async () => {
    const hooks = window.__studyTestHooks;
    const before = hooks.getRendererState();
    let threw = false;
    try {
      await hooks.exportPosterBlob({ scale: 2, forceHtmlCompositeFailure: true });
    } catch {
      threw = true;
    }
    const after = hooks.getRendererState();
    return {
      threw,
      before,
      after,
      wraps: hooks.countExportWraps(),
    };
  });
  assert(!failedExport.threw, "forced HTML composite failure still returns WebGL-only export");
  assert(failedExport.before.width === failedExport.after.width, "failed export restores renderer width");
  assert(failedExport.before.height === failedExport.after.height, "failed export restores renderer height");
  assert(failedExport.wraps === 0, "failed export removes temporary wrapper elements", String(failedExport.wraps));

  // --- Line thickness slider wired through StudySceneRenderer ---
  await page.evaluate(() => {
    const slider = document.getElementById("studyLineWidth");
    slider.value = "2.5";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const lineWidth = await page.evaluate(() => window.__studyTestHooks.getStudyController().options.lineWidth);
  assert(Math.abs(lineWidth - 2.5) < 1e-6, "line thickness slider updates study render options", String(lineWidth));

  // --- Exported PNG includes WebGL geometry (poster HTML is best-effort composited when not tainted) ---
  const posterContent = await page.evaluate(async () => {
    const hooks = window.__studyTestHooks;
    const blob = await hooks.exportPosterBlob({ scale: 2 });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const full = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let geometryPixels = 0;
    for (let i = 0; i < full.data.length; i += 4) {
      const r = full.data[i];
      const g = full.data[i + 1];
      const b = full.data[i + 2];
      if (r > 12 || g > 12 || b > 12) geometryPixels += 1;
    }
    const titleVisible = Boolean(document.querySelector(".study-title")?.textContent?.length);
    bitmap.close();
    return { geometryPixels, titleVisible, blobSize: blob.size };
  });
  assert(posterContent.titleVisible, "poster title text present in DOM during export");
  assert(posterContent.geometryPixels > 10, "exported PNG includes WebGL geometry pixels", String(posterContent.geometryPixels));
  assert(posterContent.blobSize > 5000, "exported PNG blob is non-trivial", String(posterContent.blobSize));

  await page.click("#studyPosterMode");
  await sleep(200);
  await page.click("#studyModeEnabled");
  await sleep(500);
  const restored = await page.evaluate(() => ({
    studyOff: !document.getElementById("studyModeEnabled").checked,
    ariaHidden: document.getElementById("studyPosterRoot").getAttribute("aria-hidden"),
  }));
  assert(restored.studyOff, "study mode can be disabled");
  assert(restored.ariaHidden === "true", "poster root aria-hidden restored on exit", restored.ariaHidden);

  assert(errors.length === 0, "browser study test has no runtime errors", errors[0]);
  await browser.close();
} finally {
  preview.kill("SIGTERM");
}

if (failed > 0) {
  console.error(`\n${failed} geometry-study assertion(s) failed`);
  process.exit(1);
}

console.log("\nAll geometry study checks passed.");

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
