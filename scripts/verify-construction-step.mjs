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
  formatConstructionStepLabel,
  isInvalidConstructionStep,
} from "../src/app/constructionStep.js";

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

assert(isInvalidConstructionStep(SENTINEL), "MAX_SAFE_INTEGER is invalid");
assert(isInvalidConstructionStep(NaN), "NaN is invalid");
assert(!isInvalidConstructionStep(5), "5 is valid");
assert(clampConstructionStep(SENTINEL, 10) === 10, "clamp sentinel to max");
assert(clampConstructionStep(99, 10) === 10, "clamp high value to max");
assert(clampConstructionStep(-3, 10) === 0, "clamp negative to 0");
assert(clampConstructionStep(0, 10) === 0, "allow step 0");
assert(formatConstructionStepLabel(3, 10) === "3 / 10", "format step label");

const mainSrc = readFileSync(join(root, "src/main.js"), "utf8");
assert(!/ui\.constructionStep\s*=\s*Number\.MAX_SAFE_INTEGER/.test(mainSrc), "main.js no longer assigns MAX_SAFE_INTEGER");

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
