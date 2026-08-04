/**
 * Geometry study / poster engine verification.
 * Run: node scripts/verify-geometry-studies.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
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
import { computeStudyViewLayout } from "../src/studies/studyLayout.js";

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
assert(/renderer\.getSize\(/.test(posterExportSrc), "poster export saves CSS dimensions via renderer.getSize()");
assert(/includeExportMarker/.test(posterExportSrc), "poster export supports verification-only marker injection");
assert(!/data-export-marker/.test(readFileSync(join(root, "src/studies/StudyController.js"), "utf8")), "live poster HTML does not include export marker");

const registrySrc = readFileSync(join(root, "src/studies/registry.js"), "utf8");
assert(!/^export \{ MERKABA_STUDY \} from/m.test(registrySrc), "registry.js does not duplicate re-export-before-import");
assert(/import \{ MERKABA_STUDY \} from "\.\/definitions\/merkabaStudy\.js";/.test(registrySrc), "registry.js uses single import block");
assert(/export \{ MERKABA_STUDY, DIMENSIONAL_STUDY \};/.test(registrySrc), "registry.js re-exports studies explicitly");

const studyRendererSrc = readFileSync(join(root, "src/rendering/StudySceneRenderer.js"), "utf8");
assert(/#getSharedMaterials\(\)/.test(studyRendererSrc), "study renderer tracks shared materials during clear()");
assert(!/node\.isLine2 !== true/.test(studyRendererSrc), "clear() no longer skips shared LineMaterial disposal by isLine2 alone");
assert(/Line2/.test(studyRendererSrc), "study renderer uses Line2 for thick lines");
assert(/LineMaterial/.test(studyRendererSrc), "study renderer uses LineMaterial");
assert(/Partial<typeof DEFAULT_STUDY_RENDER_OPTIONS>/.test(studyRendererSrc), "study renderer options JSDoc is valid");
assert(/showGuides/.test(studyRendererSrc), "study renderer honors showGuides for lines and circles");

const posterCss = readFileSync(join(root, "src/styles/poster.css"), "utf8");
assert(/--study-panel-inset-right/.test(posterCss), "poster CSS reserves panel inset via custom property");
assert(/--study-panel-inset-top/.test(posterCss) || /var\(--sat/.test(posterCss), "poster CSS aligns top with safe-area inset");
assert(/study-full-frame .study-poster-root[\s\S]*top:\s*0/.test(posterCss), "full-frame poster root resets top to 0");
assert(/min-height:\s*42vh/.test(posterCss), "dimensional center slot has vh fallback before dvh");
assert(/study-poster-dimensional .study-info/.test(posterCss), "dimensional study-info has explicit grid placement");
assert(/study-poster-exporting/.test(posterCss), "poster export hides control panel");
assert(/\.study-blueprint-step\.active/.test(posterCss), "blueprint active step styling present");

{
  const layout = computeStudyViewLayout({
    fullWidth: 2048,
    fullHeight: 1536,
    panelEl: {
      getBoundingClientRect: () => ({
        left: 1712,
        right: 2048,
        top: 16,
        bottom: 1500,
        width: 336,
        height: 1484,
      }),
    },
    panelOpen: true,
    posterMode: false,
    exporting: false,
  });
  assert(layout.insets.insetRight > 200, "iPad landscape reserves right inset for panel", String(layout.insets.insetRight));
  assert(layout.rect.layout === "right", "iPad landscape uses right-panel layout");
  assert(layout.rect.width === layout.insets.availableWidth, "camera rect width matches poster available width");
  const exportLayout = computeStudyViewLayout({
    fullWidth: 2048,
    fullHeight: 1536,
    exporting: true,
  });
  assert(exportLayout.fullFrame, "export layout is full frame");
  assert(exportLayout.insets.insetRight === 0 && exportLayout.insets.insetBottom === 0, "export uses zero panel inset");
  assert(exportLayout.rect.width === 2048, "export camera uses full viewport width");
  const safeAreaExport = computeStudyViewLayout({
    fullWidth: 1179,
    fullHeight: 2556,
    exporting: true,
    safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
  });
  assert(safeAreaExport.rect.width === 1179 && safeAreaExport.rect.height === 2556, "full-frame export ignores safe-area clipping");
  assert(safeAreaExport.rect.x === 0 && safeAreaExport.rect.y === 0, "full-frame export rect starts at origin");
  const safeAreaNormal = computeStudyViewLayout({
    fullWidth: 1179,
    fullHeight: 2556,
    panelOpen: false,
    posterMode: false,
    exporting: false,
    safeArea: { top: 59, right: 0, bottom: 34, left: 21 },
  });
  assert(safeAreaNormal.insets.insetTop === 59, "normal study reserves top safe-area inset", String(safeAreaNormal.insets.insetTop));
  assert(safeAreaNormal.insets.insetLeft === 21, "normal study reserves left safe-area inset", String(safeAreaNormal.insets.insetLeft));
  assert(safeAreaNormal.rect.x === 21 && safeAreaNormal.rect.y === 59, "camera rect starts at safe-area origin");
}

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
  await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem("geometry-explor:show-intro-on-open", "0");
  });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__studyTestHooks, { timeout: 15000 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await sleep(400);

  const initialRenderer = await page.evaluate(() => window.__studyTestHooks.getRendererState());
  assert(initialRenderer.pixelRatio === 2, "high-DPI page uses deviceScaleFactor 2", String(initialRenderer.pixelRatio));
  assert(
    initialRenderer.bufferWidth === Math.round(initialRenderer.cssWidth * initialRenderer.pixelRatio),
    "drawing buffer width matches CSS width × pixel ratio",
    `${initialRenderer.bufferWidth} vs ${initialRenderer.cssWidth}×${initialRenderer.pixelRatio}`
  );
  assert(
    initialRenderer.bufferHeight === Math.round(initialRenderer.cssHeight * initialRenderer.pixelRatio),
    "drawing buffer height matches CSS height × pixel ratio",
    `${initialRenderer.bufferHeight} vs ${initialRenderer.cssHeight}×${initialRenderer.pixelRatio}`
  );

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
  assert(!(await page.evaluate(() => Boolean(document.querySelector("[data-export-marker]")))), "live study poster has no export verification marker");

  await page.select("#studySelect", "dimensional-relationships");
  await sleep(600);
  const dimensional = await page.$eval(".study-title", (el) => el.textContent);
  assert(/Dimensional Relationships/i.test(dimensional), "dimensional study loads");

  // --- Repeated study switches/rebuilds keep shared materials intact ---
  const materialRegression = await page.evaluate(async () => {
    const hooks = window.__studyTestHooks;
    const ctrl = hooks.getStudyController();
    const edgeUuidBefore = hooks.getSharedMaterialState().edgeUuid;
    for (let i = 0; i < 10; i += 1) {
      ctrl.setStudy(i % 2 === 0 ? "merkaba-stellated-octahedron" : "dimensional-relationships");
      ctrl.sequenceStep = i % 4;
      ctrl.rebuild();
      ctrl.syncPosterDOM();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const state = hooks.getSharedMaterialState();
    return {
      ...state,
      edgeUuidBefore,
      lineCount: hooks.countStudyLines(),
      goldPixels: hooks.sampleStudyLineThickness().goldPixels,
    };
  });
  assert(materialRegression.intact, "shared study materials remain intact after repeated rebuilds");
  assert(!materialRegression.edgeDisposed, "shared edge LineMaterial not disposed");
  assert(!materialRegression.faceADisposed, "shared face material not disposed");
  assert(!materialRegression.vertexDisposed, "shared vertex material not disposed");
  assert(materialRegression.edgeUuid === materialRegression.edgeUuidBefore, "shared edge material instance preserved");
  assert(materialRegression.lineCount > 0, "repeated rebuilds still render Line2 geometry", String(materialRegression.lineCount));
  assert(materialRegression.goldPixels > 0, "shared materials still render after repeated rebuilds", String(materialRegression.goldPixels));

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

  // --- High-DPI export restoration (CSS size + drawing buffer) ---
  const exportRestore = await page.evaluate(async () => {
    const hooks = window.__studyTestHooks;
    const before = hooks.getRendererState();
    const blob = await hooks.exportPosterBlob({ scale: 2 });
    const after = hooks.getRendererState();
    const layout = hooks.getStudyLayoutState();
    return {
      before,
      after,
      layout,
      blobSize: blob?.size ?? 0,
      wraps: hooks.countExportWraps(),
    };
  });
  assert(exportRestore.before.cssWidth === exportRestore.after.cssWidth, "export restores CSS width", `${exportRestore.before.cssWidth} vs ${exportRestore.after.cssWidth}`);
  assert(exportRestore.before.cssHeight === exportRestore.after.cssHeight, "export restores CSS height", `${exportRestore.before.cssHeight} vs ${exportRestore.after.cssHeight}`);
  assert(exportRestore.before.bufferWidth === exportRestore.after.bufferWidth, "export restores drawing-buffer width", `${exportRestore.before.bufferWidth} vs ${exportRestore.after.bufferWidth}`);
  assert(exportRestore.before.bufferHeight === exportRestore.after.bufferHeight, "export restores drawing-buffer height", `${exportRestore.before.bufferHeight} vs ${exportRestore.after.bufferHeight}`);
  assert(Math.abs(exportRestore.before.pixelRatio - exportRestore.after.pixelRatio) < 1e-6, "export restores pixel ratio", `${exportRestore.before.pixelRatio} vs ${exportRestore.after.pixelRatio}`);
  const expectedAspect =
    exportRestore.layout.camera.width / Math.max(1, exportRestore.layout.camera.height);
  assert(
    Math.abs(exportRestore.after.aspect - expectedAspect) < 1e-3,
    "export restores panel-aware camera aspect after study layout sync",
    `${exportRestore.after.aspect} vs ${expectedAspect}`
  );
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
  assert(failedExport.before.cssWidth === failedExport.after.cssWidth, "failed export restores CSS width");
  assert(failedExport.before.cssHeight === failedExport.after.cssHeight, "failed export restores CSS height");
  assert(failedExport.before.bufferWidth === failedExport.after.bufferWidth, "failed export restores drawing-buffer width");
  assert(failedExport.before.bufferHeight === failedExport.after.bufferHeight, "failed export restores drawing-buffer height");
  assert(failedExport.wraps === 0, "failed export removes temporary wrapper elements", String(failedExport.wraps));

  // --- Line thickness slider uses LineMaterial and visibly changes rendered lines ---
  await page.evaluate(() => {
    const ctrl = window.__studyTestHooks.getStudyController();
    ctrl.sequenceStep = 3;
    ctrl.rebuild();
    ctrl.frameStudy();
    ctrl.setOptions({ lineWidth: 0.7, showFaces: false, showVertices: false });
  });
  await sleep(400);
  const thinLine = await page.evaluate(() => ({
    widths: window.__studyTestHooks.getStudyLineWidths(),
    sample: window.__studyTestHooks.sampleStudyLineThickness(),
  }));
  assert(Math.abs(thinLine.widths.edge - 0.7) < 1e-6, "thin line width applied to LineMaterial", String(thinLine.widths.edge));
  assert(thinLine.sample.goldPixels > 0, "thin study lines render gold pixels", String(thinLine.sample.goldPixels));

  await page.evaluate(() => {
    window.__studyTestHooks.getStudyController().setOptions({ lineWidth: 4.5 });
  });
  await sleep(400);
  const thickLine = await page.evaluate(() => ({
    widths: window.__studyTestHooks.getStudyLineWidths(),
    sample: window.__studyTestHooks.sampleStudyLineThickness(),
  }));
  assert(Math.abs(thickLine.widths.edge - 4.5) < 1e-6, "thick line width applied to LineMaterial", String(thickLine.widths.edge));
  assert(
    thickLine.sample.span > thinLine.sample.span * 1.25,
    "line thickness slider visibly increases rendered line span",
    `thin=${thinLine.sample.span} thick=${thickLine.sample.span}`
  );

  // --- drawLine/drawCircle honor showGuides ---
  await page.select("#studySelect", "dimensional-relationships");
  await sleep(500);
  const guidesOn = await page.evaluate(() => window.__studyTestHooks.countStudyLines());
  await page.evaluate(() => {
    window.__studyTestHooks.getStudyController().setOptions({ showGuides: false });
  });
  await sleep(300);
  const guidesOff = await page.evaluate(() => window.__studyTestHooks.countStudyLines());
  assert(guidesOff < guidesOn, "disabling showGuides removes guide Line2 instances", `${guidesOn} -> ${guidesOff}`);

  await page.select("#studySelect", "merkaba-stellated-octahedron");
  await sleep(400);

  // --- Exported PNG includes composited HTML overlay marker + title chrome ---
  const posterContent = await page.evaluate(async () => {
    const exportScale = 2;
    const marker = { top: 8, left: 8, size: 24, r: 255, g: 0, b: 170 };
    const hooks = window.__studyTestHooks;
    const blob = await hooks.exportPosterBlob({ scale: exportScale, includeExportMarker: true });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);

    const sampleX = Math.round((marker.left + marker.size / 2) * exportScale);
    const sampleY = Math.round((marker.top + marker.size / 2) * exportScale);
    const markerPx = ctx.getImageData(sampleX, sampleY, 1, 1).data;
    const markerMatch =
      Math.abs(markerPx[0] - marker.r) <= 40 &&
      Math.abs(markerPx[1] - marker.g) <= 40 &&
      Math.abs(markerPx[2] - marker.b) <= 40;

    const headerH = Math.round(bitmap.height * 0.12);
    const header = ctx.getImageData(0, 0, bitmap.width, headerH);
    let titleGoldPixels = 0;
    for (let i = 0; i < header.data.length; i += 4) {
      const r = header.data[i];
      const g = header.data[i + 1];
      const b = header.data[i + 2];
      if (r > 160 && g > 120 && b < 100) titleGoldPixels += 1;
    }

    const full = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let geometryPixels = 0;
    for (let i = 0; i < full.data.length; i += 4) {
      const r = full.data[i];
      const g = full.data[i + 1];
      const b = full.data[i + 2];
      if (r > 12 || g > 12 || b > 12) geometryPixels += 1;
    }

    bitmap.close();
    return {
      markerMatch,
      markerRgb: [markerPx[0], markerPx[1], markerPx[2]],
      titleGoldPixels,
      geometryPixels,
      blobSize: blob.size,
      sample: [sampleX, sampleY],
    };
  });
  assert(posterContent.markerMatch, "exported PNG contains composited HTML export marker pixels", posterContent.markerRgb.join(","));
  assert(posterContent.titleGoldPixels > 20, "exported PNG header contains composited title chrome (gold pixels)", String(posterContent.titleGoldPixels));
  assert(posterContent.geometryPixels > 10, "exported PNG includes WebGL geometry pixels", String(posterContent.geometryPixels));
  assert(posterContent.blobSize > 5000, "exported PNG blob is non-trivial", String(posterContent.blobSize));
  console.log("NOTE: Safari/WebKit poster export was not run in CI (Chrome headless only); manual Safari verification still required.");

  // --- Responsive layout: iPad landscape, iPad portrait, iPhone portrait ---
  await page.evaluate(() => {
    const studyCb = document.getElementById("studyModeEnabled");
    if (!studyCb.checked) studyCb.click();
    const posterCb = document.getElementById("studyPosterMode");
    if (posterCb.checked) posterCb.click();
  });
  await sleep(600);
  const studyOverlapSelectors = [
    ".study-title",
    ".study-subtitle",
    ".study-ratio-row",
    ".study-info",
    ".study-footer",
    ".study-summary",
  ];
  const viewports = [
    { name: "ipad-landscape", width: 2048, height: 1536 },
    { name: "ipad-portrait", width: 1536, height: 2048 },
    { name: "iphone-portrait", width: 1179, height: 2556 },
  ];
  const screenshotDir = "/opt/cursor/artifacts/screenshots";
  try {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(screenshotDir, { recursive: true });
  } catch {
    // directory may already exist
  }

  await page.select("#studySelect", "dimensional-relationships");
  await sleep(400);

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.evaluate(() => {
      window.dispatchEvent(new Event("resize"));
      window.__studyTestHooks.getStudyController().frameStudy();
    });
    await sleep(600);

    const layout = await page.evaluate((selectors) => {
      const state = window.__studyTestHooks.getStudyLayoutState();
      const insets = state.insets;
      const overlap = window.__studyTestHooks.measureStudyElementOverlaps(selectors);
      const geom = window.__studyTestHooks.measureStudyGeometrySize();
      const panel = document.getElementById("panel");
      const panelRect = panel?.getBoundingClientRect();
      const title = document.querySelector(".study-title")?.getBoundingClientRect();
      const panelOverlapTitle =
        title &&
        panelRect &&
        title.right > panelRect.left + 4 &&
        title.bottom > panelRect.top + 4 &&
        title.top < panelRect.bottom - 4;
      return { state, insets, overlap, geom, panelOverlapTitle };
    }, studyOverlapSelectors);

    assert(layout.insets.insetRight > 0 || layout.insets.insetBottom > 0, `${vp.name}: poster reserves panel inset`, JSON.stringify(layout.insets));
    assert(
      layout.state.camera && layout.state.camera.width < layout.state.camera.fullWidth - 100,
      `${vp.name}: camera available rect reserves panel space`,
      JSON.stringify(layout.state.camera)
    );
    assert(
      Math.abs(layout.state.camera.width - (layout.state.camera.fullWidth - layout.insets.insetRight)) < 24,
      `${vp.name}: camera and CSS insets stay synchronized`,
      `camera=${layout.state.camera?.width} insetRight=${layout.insets.insetRight}`
    );
    assert(layout.overlap.overlaps.length === 0, `${vp.name}: study poster elements do not overlap`, JSON.stringify(layout.overlap.overlaps));
    assert(!layout.panelOverlapTitle, `${vp.name}: title does not sit under control panel`);
    assert(layout.geom.goldSpan > 8, `${vp.name}: 3D geometry spans usable width`, `span=${layout.geom.goldSpan} avail=${layout.geom.availWidth}`);
    assert(layout.geom.goldPixels > 80, `${vp.name}: 3D geometry renders visible gold lines`, String(layout.geom.goldPixels));

    await page.screenshot({
      path: join(screenshotDir, `study-dimensional-${vp.name}-after.png`),
      fullPage: false,
    });
    console.log(`NOTE: saved ${join(screenshotDir, `study-dimensional-${vp.name}-after.png`)}`);
  }

  // Poster export view uses full width (panel hidden) with synchronized camera
  await page.setViewport({ width: 2048, height: 1536, deviceScaleFactor: 1 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.evaluate(() => {
    const cb = document.getElementById("studyPosterMode");
    if (!cb.checked) cb.click();
  });
  await sleep(400);
  const posterModeLayout = await page.evaluate(() => {
    const state = window.__studyTestHooks.getStudyLayoutState();
    const panel = document.getElementById("panel");
    const style = panel ? getComputedStyle(panel) : null;
    const panelRect = panel?.getBoundingClientRect();
    return {
      state,
      panelHidden:
        style?.visibility === "hidden" ||
        parseFloat(style?.opacity || "1") < 0.05 ||
        (panelRect && panelRect.left >= window.innerWidth - 4),
    };
  });
  assert(posterModeLayout.state.insets.insetRight === 0 && posterModeLayout.state.insets.insetBottom === 0, "poster mode clears panel insets");
  assert(posterModeLayout.state.camera.width === posterModeLayout.state.camera.fullWidth, "poster mode camera uses full viewport width");
  assert(posterModeLayout.state.insets.fullFrame, "poster mode marks full-frame layout");
  assert(posterModeLayout.panelHidden, "poster mode hides control panel");
  await page.screenshot({
    path: join(screenshotDir, "study-poster-mode-ipad-landscape-after.png"),
    fullPage: false,
  });

  // PNG export keeps full-frame layout for the entire operation
  await page.evaluate(() => {
    const ctrl = window.__studyTestHooks.getStudyController();
    ctrl.setPosterMode(false);
    window.__studyTestHooks.setPanelOpen(true);
    window.dispatchEvent(new Event("resize"));
    window.__studyTestHooks.syncStudyViewLayout();
    ctrl.frameStudy();
  });
  await sleep(300);
  const exportProbe = await page.evaluate(async () => window.__studyTestHooks.probeExportLayout({ scale: 2 }));
  assert(exportProbe.during?.exporting, "export probe runs while exporting");
  assert(exportProbe.during?.insets.insetRight === 0 && exportProbe.during?.insets.insetBottom === 0, "export keeps zero CSS panel inset");
  assert(
    exportProbe.during?.camera?.width === exportProbe.during?.camera?.fullWidth,
    "export keeps full-width camera rect",
    JSON.stringify(exportProbe.during?.camera)
  );
  assert(exportProbe.after?.insets.insetRight > 0, "export restore returns panel-aware CSS inset");
  assert(exportProbe.after?.camera?.width < exportProbe.after?.camera?.fullWidth, "export restore returns panel-aware camera rect");

  const exportPosterBytes = await page.evaluate(async () => {
    const blob = await window.__studyTestHooks.exportPosterBlob({ scale: 2, includeExportMarker: false });
    const buf = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buf));
  });
  writeFileSync(join(screenshotDir, "study-poster-export-ipad-landscape-after.png"), Buffer.from(exportPosterBytes));

  // Dimensional callouts: visible wide, hidden at collision breakpoints
  await page.evaluate(() => {
    const cb = document.getElementById("studyPosterMode");
    if (cb.checked) cb.click();
  });
  await sleep(200);
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    window.__studyTestHooks.setPanelOpen(false);
    window.dispatchEvent(new Event("resize"));
    window.__studyTestHooks.getStudyController().frameStudy();
  });
  await sleep(400);
  const wideCallouts = await page.evaluate(() => window.__studyTestHooks.getCalloutVisibility());
  assert(wideCallouts.visible, "dimensional callouts visible in wide layout with panel closed", JSON.stringify(wideCallouts));

  await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("resize"));
    window.__studyTestHooks.getStudyController().frameStudy();
  });
  await sleep(300);
  const narrowCallouts = await page.evaluate(() => window.__studyTestHooks.getCalloutVisibility());
  assert(!narrowCallouts.visible, "dimensional callouts hidden below 1100px breakpoint", JSON.stringify(narrowCallouts));

  await page.setViewport({ width: 2048, height: 1536, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    window.__studyTestHooks.setPanelOpen(true);
    window.dispatchEvent(new Event("resize"));
    window.__studyTestHooks.getStudyController().frameStudy();
  });
  await sleep(300);
  const panelCallouts = await page.evaluate(() => window.__studyTestHooks.getCalloutVisibility());
  assert(!panelCallouts.visible, "dimensional callouts hidden when right panel is open", JSON.stringify(panelCallouts));

  // --- Safe-area alignment: normal study vs poster/export full frame ---
  const iphoneSafe = { top: 59, right: 0, bottom: 34, left: 21 };
  await page.setViewport({ width: 1179, height: 2556, deviceScaleFactor: 1 });
  await page.evaluate((safe) => {
    window.__studyTestHooks.setSafeAreaInsets(safe);
    const cb = document.getElementById("studyPosterMode");
    if (cb.checked) cb.click();
    window.__studyTestHooks.setPanelOpen(false);
    window.dispatchEvent(new Event("resize"));
    window.__studyTestHooks.syncStudyViewLayout();
    window.__studyTestHooks.getStudyController().frameStudy();
  }, iphoneSafe);
  await sleep(400);
  const safeAreaNormal = await page.evaluate(() => {
    const camera = window.__studyTestHooks.getCameraAvailableRect();
    const poster = window.__studyTestHooks.getPosterRootRect();
    const insets = window.__studyTestHooks.getStudyPosterInsets();
    return { camera, poster, insets };
  });
  assert(safeAreaNormal.insets.insetTop === iphoneSafe.top, "CSS top inset matches iPhone safe area", String(safeAreaNormal.insets.insetTop));
  assert(safeAreaNormal.insets.insetLeft === iphoneSafe.left, "CSS left inset matches iPhone safe area", String(safeAreaNormal.insets.insetLeft));
  assert(
    Math.abs(safeAreaNormal.poster.top - safeAreaNormal.camera.y) < 2,
    "poster overlay top aligns with camera available rect",
    `poster=${safeAreaNormal.poster?.top} camera=${safeAreaNormal.camera?.y}`
  );
  assert(
    Math.abs(safeAreaNormal.poster.left - safeAreaNormal.camera.x) < 2,
    "poster overlay left aligns with camera available rect",
    `poster=${safeAreaNormal.poster?.left} camera=${safeAreaNormal.camera?.x}`
  );

  await page.evaluate(() => {
    const cb = document.getElementById("studyPosterMode");
    if (!cb.checked) cb.click();
    window.dispatchEvent(new Event("resize"));
    window.__studyTestHooks.syncStudyViewLayout();
    window.__studyTestHooks.getStudyController().frameStudy();
  });
  await sleep(400);
  const safeAreaPosterMode = await page.evaluate(() => {
    const camera = window.__studyTestHooks.getCameraAvailableRect();
    const poster = window.__studyTestHooks.getPosterRootRect();
    const insets = window.__studyTestHooks.getStudyPosterInsets();
    return {
      camera,
      poster,
      insets,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    };
  });
  assert(safeAreaPosterMode.insets.fullFrame, "poster mode uses full-frame layout with mocked safe area");
  assert(safeAreaPosterMode.poster.top < 1 && safeAreaPosterMode.poster.left < 1, "poster mode overlay starts at viewport origin", JSON.stringify(safeAreaPosterMode.poster));
  assert(safeAreaPosterMode.camera.x < 1 && safeAreaPosterMode.camera.y < 1, "poster mode camera rect starts at origin");
  assert(
    Math.abs(safeAreaPosterMode.camera.width - safeAreaPosterMode.innerWidth) < 2,
    "poster mode camera uses full viewport width with safe area mocked",
    String(safeAreaPosterMode.camera.width)
  );

  await page.evaluate(() => {
    const cb = document.getElementById("studyPosterMode");
    if (cb.checked) cb.click();
    window.__studyTestHooks.clearSafeAreaInsets();
    window.dispatchEvent(new Event("resize"));
    window.__studyTestHooks.syncStudyViewLayout();
    window.__studyTestHooks.getStudyController().frameStudy();
  });
  await sleep(200);
  await page.setViewport({ width: 2048, height: 1536, deviceScaleFactor: 1 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await sleep(200);

  // Blueprint step styling remains distinct
  await page.select("#studySelect", "merkaba-stellated-octahedron");
  await sleep(400);
  const blueprintStyles = await page.evaluate(() => window.__studyTestHooks.getBlueprintStepStyles());
  assert(blueprintStyles.count >= 4, "merkaba blueprint steps render", String(blueprintStyles.count));
  assert(blueprintStyles.hasInactive, "merkaba blueprint has inactive steps");
  assert(blueprintStyles.activeDiffers, "active blueprint step is visually distinct", JSON.stringify(blueprintStyles));
  await sleep(200);
  await page.evaluate(() => {
    const cb = document.getElementById("studyModeEnabled");
    if (cb.checked) {
      cb.checked = false;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
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
