/**
 * Construction step clamping verification — MAX_SAFE_INTEGER must never surface.
 * Run: node scripts/verify-construction-step.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import {
  clampConstructionStep,
  countVisibleSpheresAtStep,
  formatConstructionStepLabel,
  isInvalidConstructionStep,
  isLegacyFullConstructionStep,
  resolveConstructionStep,
  resolveStartupConstructionStep,
} from "../src/engine/construction/constructionStep.js";
import { ConstructionSystem, buildConstructionPlan } from "../src/engine/construction/ConstructionSystem.js";
import { generateGeometry } from "../src/engine/generators/index.js";

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

const SENTINEL = Number.MAX_SAFE_INTEGER;
const SENTINEL_STR = String(SENTINEL);

assert(isLegacyFullConstructionStep(SENTINEL), "MAX_SAFE_INTEGER is legacy full-step sentinel");
assert(!isInvalidConstructionStep(SENTINEL), "legacy sentinel is not treated as invalid for load");
assert(isInvalidConstructionStep(NaN), "NaN is invalid");
assert(!isInvalidConstructionStep(5), "5 is valid");
assert(clampConstructionStep(SENTINEL, 10) === 10, "clamp sentinel to max");
assert(resolveConstructionStep(SENTINEL, 19) === 19, "resolve sentinel to engine max");
assert(resolveConstructionStep(3, 10) === 3, "resolve preserves valid saved step");
assert(resolveConstructionStep(NaN, 10) === 10, "resolve non-finite to max");
assert(resolveConstructionStep(-4, 10) === 0, "resolve negative to 0");
assert(
  resolveStartupConstructionStep({
    step: 1,
    maxStep: 2,
    stateLoaded: false,
    constructionMode: false,
  }) === 2,
  "fresh startup without saved state shows full geometry"
);
assert(
  resolveStartupConstructionStep({
    step: 1,
    maxStep: 2,
    stateLoaded: true,
    constructionMode: false,
  }) === 1,
  "saved construction step is preserved on startup"
);
assert(
  resolveStartupConstructionStep({
    step: 5,
    maxStep: 19,
    stateLoaded: true,
    constructionMode: false,
  }) === 5,
  "intentional mid-step saved state is preserved"
);
assert(
  resolveStartupConstructionStep({
    step: 1,
    maxStep: 19,
    stateLoaded: false,
    constructionMode: true,
  }) === 1,
  "fresh startup in construction mode keeps step 1"
);
assert(clampConstructionStep(99, 10) === 10, "clamp high value to max");
assert(clampConstructionStep(-3, 10) === 0, "clamp negative to 0");
assert(clampConstructionStep(0, 10) === 0, "allow step 0");
assert(formatConstructionStepLabel(3, 10) === "3 / 10", "format step label");

const mainSrc = readFileSync(join(root, "src/main.js"), "utf8");
assert(
  /isLegacyFullConstructionStep\(savedStep\)/.test(mainSrc),
  "loadState preserves legacy full-step sentinel until engine max is known"
);
assert(
  !/ui\.constructionStep\s*=\s*Number\.MAX_SAFE_INTEGER/.test(mainSrc) ||
    /isLegacyFullConstructionStep\(savedStep\)/.test(mainSrc),
  "main.js only rehydrates MAX_SAFE_INTEGER for legacy saved state"
);
assert(!/ui\.constructionStep \|\|/.test(mainSrc), "no truthy fallback on constructionStep");
assert(
  !/setStep\(Math\.max\(1,\s*ui\.constructionStep/.test(mainSrc),
  "showStaticStep does not coerce step 0 to max via truthy fallback"
);

// --- Engine + clamp stay aligned for static stepping ---
{
  const data = generateGeometry("flowerOfLife", 1.2);
  const plan = buildConstructionPlan("flowerOfLife", 1.2);
  const sys = new ConstructionSystem();
  sys.setConstructionData(data, { plan });
  const max = sys.getMaxStep();

  const assertStepSync = (input, expectedStep) => {
    sys.setStep(input);
    assert(sys.getStep() === expectedStep, `engine step for input ${String(input)}`, String(sys.getStep()));
    assert(
      clampConstructionStep(input, max) === expectedStep,
      `clamped step for input ${String(input)}`,
      String(clampConstructionStep(input, max))
    );
    const visible = sys.getVisibleData().sphereCenters.length;
    const expectedVisible = countVisibleSpheresAtStep(data, expectedStep);
    assert(
      visible === expectedVisible,
      `visible spheres at step ${expectedStep}`,
      `${visible} vs ${expectedVisible}`
    );
  };

  assertStepSync(0, 0);
  assertStepSync(1, 1);
  assertStepSync(max, max);
  assertStepSync(-3, 0);
  assertStepSync(Number.NaN, max);
  assertStepSync(SENTINEL, max);
  assert(countVisibleSpheresAtStep(data, 0) === 0, "step 0 shows no spheres");
  assert(countVisibleSpheresAtStep(data, 1) === 1, "step 1 shows one sphere");
  assert(
    countVisibleSpheresAtStep(data, max) === data.sphereCenters.length,
    "max step shows all spheres"
  );
}

await run("npm", ["run", "build"]);

const port = "4313";
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
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem("geometry-explor:show-intro-on-open", "0");
  });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(800);

  await page.select("#geometry", "flowerOfLife");
  await sleep(500);

  const afterExit = await page.evaluate(async () => {
    const cb = document.getElementById("constructionMode");
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    cb.checked = false;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const layersValue = document.getElementById("layersValue")?.textContent ?? "";
    const stepCurrent = document.getElementById("stepCurrent")?.textContent ?? "";
    const stepTotal = document.getElementById("stepTotal")?.textContent ?? "";
    const slider = document.getElementById("layers");
    const saved = localStorage.getItem("geometryExplorState_v1");
    return {
      layersValue,
      stepCurrent,
      stepTotal,
      sliderValue: slider?.value ?? "",
      sliderMax: slider?.max ?? "",
      saved,
      uiStep: window.__constructionTestHooks?.getUiConstructionStep?.(),
    };
  });

  assert(!afterExit.layersValue.includes(SENTINEL_STR), "layers label never shows sentinel", afterExit.layersValue);
  assert(!afterExit.stepCurrent.includes(SENTINEL_STR), "stepCurrent never shows sentinel", afterExit.stepCurrent);
  assert(!afterExit.stepTotal.includes(SENTINEL_STR), "stepTotal never shows sentinel", afterExit.stepTotal);
  assert(!afterExit.saved?.includes(SENTINEL_STR), "localStorage never stores sentinel");
  assert(afterExit.layersValue.includes("/"), "layers label uses current / total format", afterExit.layersValue);
  assert(Number(afterExit.uiStep) <= Number(afterExit.sliderMax), "ui step within slider max");

  const afterModeChange = await page.evaluate(async () => {
    await window.__constructionTestHooks.selectTreeMode("spatial");
    await new Promise((r) => setTimeout(r, 500));
    return {
      step: window.__constructionTestHooks.getUiConstructionStep(),
      label: document.getElementById("layersValue")?.textContent ?? "",
    };
  });
  assert(afterModeChange.step <= 10, "tree mode change resets step", String(afterModeChange.step));
  assert(!afterModeChange.label.includes(SENTINEL_STR), "mode change label has no sentinel");

  await page.select("#geometry", "flowerOfLife");
  await sleep(500);

  const staticStepCases = [0, 1, -4, 99];

  for (const input of staticStepCases) {
    const sync = await page.evaluate((rawStep) => {
      const max = window.__constructionTestHooks.getMaxConstructionStep();
      const expected = window.__constructionTestHooks.resolveConstructionStep(rawStep);
      window.__constructionTestHooks.applyStaticStep(rawStep);
      return {
        expected,
        ui: window.__constructionTestHooks.getUiConstructionStep(),
        engine: window.__constructionTestHooks.getEngineStep(),
        visible: window.__constructionTestHooks.getVisibleSphereCount(),
        expectedVisible: window.__constructionTestHooks.countExpectedVisibleSpheres(rawStep),
        label: window.__constructionTestHooks.getLayersLabel(),
        slider: window.__constructionTestHooks.getSliderValue(),
        max,
      };
    }, input);

    assert(sync.ui === sync.expected, `ui step matches for input ${input}`, `${sync.ui} vs ${sync.expected}`);
    assert(sync.engine === sync.expected, `engine step matches for input ${input}`, `${sync.engine} vs ${sync.expected}`);
    assert(
      sync.label === `${sync.expected} / ${sync.max}`,
      `label matches for input ${input}`,
      sync.label
    );
    assert(
      sync.slider === String(sync.expected),
      `slider matches for input ${input}`,
      `${sync.slider} vs ${sync.expected}`
    );
    assert(
      sync.visible === sync.expectedVisible,
      `visible spheres match for input ${input}`,
      `${sync.visible} vs ${sync.expectedVisible}`
    );
  }

  const maxSync = await page.evaluate(() => {
    const max = window.__constructionTestHooks.getMaxConstructionStep();
    window.__constructionTestHooks.applyStaticStep(max);
    return {
      expected: max,
      ui: window.__constructionTestHooks.getUiConstructionStep(),
      engine: window.__constructionTestHooks.getEngineStep(),
      visible: window.__constructionTestHooks.getVisibleSphereCount(),
      expectedVisible: window.__constructionTestHooks.countExpectedVisibleSpheres(max),
      label: window.__constructionTestHooks.getLayersLabel(),
      slider: window.__constructionTestHooks.getSliderValue(),
      max,
    };
  });
  assert(maxSync.ui === maxSync.expected, "max ui step matches", String(maxSync.ui));
  assert(maxSync.engine === maxSync.expected, "max engine step matches", String(maxSync.engine));
  assert(maxSync.visible === maxSync.expectedVisible, "max visible spheres match", `${maxSync.visible} vs ${maxSync.expectedVisible}`);

  const nonFiniteSync = await page.evaluate(() => {
    window.__constructionTestHooks.applyStaticStep(Number.NaN);
    const max = window.__constructionTestHooks.getMaxConstructionStep();
    const expected = window.__constructionTestHooks.resolveConstructionStep(Number.NaN);
    return {
      expected,
      ui: window.__constructionTestHooks.getUiConstructionStep(),
      engine: window.__constructionTestHooks.getEngineStep(),
      visible: window.__constructionTestHooks.getVisibleSphereCount(),
      expectedVisible: window.__constructionTestHooks.countExpectedVisibleSpheres(Number.NaN),
      label: window.__constructionTestHooks.getLayersLabel(),
      max,
    };
  });
  assert(nonFiniteSync.ui === nonFiniteSync.expected, "non-finite ui step resolves to max", String(nonFiniteSync.ui));
  assert(nonFiniteSync.engine === nonFiniteSync.expected, "non-finite engine step resolves to max", String(nonFiniteSync.engine));
  assert(
    nonFiniteSync.visible === nonFiniteSync.expectedVisible,
    "non-finite step shows full geometry",
    `${nonFiniteSync.visible} vs ${nonFiniteSync.expectedVisible}`
  );
  assert(
    nonFiniteSync.label === `${nonFiniteSync.expected} / ${nonFiniteSync.max}`,
    "non-finite label shows max",
    nonFiniteSync.label
  );

  const evolutionOk = await page.evaluate(async () => {
    try {
      window.__evolutionTestHooks.enableEvolutionMode();
      await new Promise((r) => setTimeout(r, 500));
      window.__evolutionTestHooks.syncDiscovery();
      window.__evolutionTestHooks.stepEvolutionForward();
      await new Promise((r) => setTimeout(r, 400));
      window.__evolutionTestHooks.syncDiscovery();
      return { ok: true, error: null };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  assert(evolutionOk.ok, "evolution mode syncDiscovery does not throw", evolutionOk.error ?? "");

  const freshPage = await browser.newPage();
  await freshPage.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem("geometry-explor:show-intro-on-open", "0");
  });
  await freshPage.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1200);

  const freshStartup = await freshPage.evaluate(() => ({
    geometry: document.getElementById("geometry")?.value ?? "",
    uiStep: window.__constructionTestHooks.getUiConstructionStep(),
    engineStep: window.__constructionTestHooks.getEngineStep(),
    maxStep: window.__constructionTestHooks.getMaxConstructionStep(),
    visibleSpheres: window.__constructionTestHooks.getVisibleSphereCount(),
    fullSpheres: window.__constructionTestHooks.getFullSphereCount?.() ?? null,
    constructionMode: window.__constructionTestHooks.isConstructionMode?.() ?? null,
    label: window.__constructionTestHooks.getLayersLabel(),
    hasSavedState: Boolean(localStorage.getItem("geometryExplorState_v1")),
  }));

  await freshPage.close();

  assert(!freshStartup.hasSavedState, "fresh startup has no saved state yet");
  assert(freshStartup.geometry === "vesicaPiscis", "fresh startup uses default Vesica Piscis");
  assert(!freshStartup.constructionMode, "fresh startup is not in construction mode");
  assert(
    freshStartup.uiStep === freshStartup.maxStep,
    "fresh startup ui step is max",
    `${freshStartup.uiStep} vs ${freshStartup.maxStep}`
  );
  assert(
    freshStartup.engineStep === freshStartup.maxStep,
    "fresh startup engine step is max",
    `${freshStartup.engineStep} vs ${freshStartup.maxStep}`
  );
  assert(
    freshStartup.visibleSpheres === 2,
    "fresh Vesica Piscis startup shows both spheres",
    String(freshStartup.visibleSpheres)
  );
  assert(
    freshStartup.fullSpheres === 2,
    "Vesica Piscis has two sphere centers at full step",
    String(freshStartup.fullSpheres)
  );
  assert(
    freshStartup.label === `${freshStartup.maxStep} / ${freshStartup.maxStep}`,
    "fresh startup label shows full step",
    freshStartup.label
  );

  const savedMidPage = await browser.newPage();
  await savedMidPage.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem("geometry-explor:show-intro-on-open", "0");
    localStorage.setItem(
      "geometryExplorState_v1",
      JSON.stringify({
        geometry: "flowerOfLife",
        constructionStep: 5,
        activeRenderLayers: ["spheres"],
        radius: 1.2,
      })
    );
  });
  await savedMidPage.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1200);

  const savedMidStartup = await savedMidPage.evaluate(() => ({
    uiStep: window.__constructionTestHooks.getUiConstructionStep(),
    engineStep: window.__constructionTestHooks.getEngineStep(),
    visibleSpheres: window.__constructionTestHooks.getVisibleSphereCount(),
    expectedVisible: window.__constructionTestHooks.countExpectedVisibleSpheres(5),
  }));

  await savedMidPage.close();

  assert(savedMidStartup.uiStep === 5, "saved mid-step preserved on startup", String(savedMidStartup.uiStep));
  assert(savedMidStartup.engineStep === 5, "saved mid-step engine matches ui", String(savedMidStartup.engineStep));
  assert(
    savedMidStartup.visibleSpheres === savedMidStartup.expectedVisible,
    "saved mid-step renders matching geometry",
    `${savedMidStartup.visibleSpheres} vs ${savedMidStartup.expectedVisible}`
  );

  const legacyPage = await browser.newPage();
  await legacyPage.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem("geometry-explor:show-intro-on-open", "0");
    localStorage.setItem(
      "geometryExplorState_v1",
      JSON.stringify({
        geometry: "flowerOfLife",
        constructionStep: 9007199254740991,
        activeRenderLayers: ["spheres"],
        radius: 1.2,
      })
    );
  });
  await legacyPage.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1200);

  const legacyUpgrade = await legacyPage.evaluate((sentinelStr) => {
    const key = "geometryExplorState_v1";
    return {
      layersValue: document.getElementById("layersValue")?.textContent ?? "",
      sliderValue: document.getElementById("layers")?.value ?? "",
      sliderMax: document.getElementById("layers")?.max ?? "",
      uiStep: window.__constructionTestHooks?.getUiConstructionStep?.(),
      engineStep: window.__constructionTestHooks?.getEngineStep?.(),
      visible: window.__constructionTestHooks?.getVisibleSphereCount?.(),
      saved: localStorage.getItem(key),
      hasSentinelInSaved: localStorage.getItem(key)?.includes(sentinelStr) ?? false,
    };
  }, SENTINEL_STR);

  await legacyPage.close();

  assert(!legacyUpgrade.layersValue.includes(SENTINEL_STR), "legacy upgrade label has no sentinel", legacyUpgrade.layersValue);
  assert(!legacyUpgrade.hasSentinelInSaved, "legacy upgrade does not persist sentinel");
  assert(
    Number(legacyUpgrade.uiStep) === Number(legacyUpgrade.sliderMax),
    "legacy sentinel upgrades to full geometry step",
    `${legacyUpgrade.uiStep} vs max ${legacyUpgrade.sliderMax}`
  );
  assert(
    legacyUpgrade.layersValue === `${legacyUpgrade.sliderMax} / ${legacyUpgrade.sliderMax}`,
    "legacy sentinel shows full current / total",
    legacyUpgrade.layersValue
  );
  assert(
    Number(legacyUpgrade.uiStep) === Number(legacyUpgrade.engineStep),
    "legacy sentinel ui and engine steps match",
    `${legacyUpgrade.uiStep} vs ${legacyUpgrade.engineStep}`
  );
  assert(
    Number(legacyUpgrade.visible) === Number(legacyUpgrade.sliderMax),
    "legacy sentinel renders full geometry",
    String(legacyUpgrade.visible)
  );

  await browser.close();
} finally {
  preview.kill("SIGTERM");
}

if (failed > 0) {
  console.error(`\n${failed} construction-step assertion(s) failed`);
  process.exit(1);
}

console.log("\nAll construction step checks passed.");

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
