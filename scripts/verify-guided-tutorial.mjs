/**
 * Guided Flower of Life tutorial — browser acceptance.
 * Requires google-chrome. Starts its own Vite preview.
 *
 * Run: node scripts/verify-guided-tutorial.mjs
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.PORT || "4188";
const BASE_PATH = process.env.BASE_PATH || "/-Geometry-Explor/";
const BASE = `http://127.0.0.1:${PORT}${BASE_PATH}`;

let failed = 0;
function assert(cond, msg, detail = "") {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg, detail ? `— ${detail}` : "");
  } else {
    console.log("PASS:", msg, detail ? `— ${detail}` : "");
  }
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

/** Highlight ring is padded ~6px around the live control. */
function highlightTracksTarget(target, ring, tol = 18) {
  if (!target || !ring) return false;
  if (ring.width < 4 || ring.height < 4) return false;
  const tcx = target.left + target.width / 2;
  const tcy = target.top + target.height / 2;
  const rcx = ring.left + ring.width / 2;
  const rcy = ring.top + ring.height / 2;
  return (
    Math.abs(tcx - rcx) <= tol &&
    Math.abs(tcy - rcy) <= tol &&
    ring.width + 1 >= target.width &&
    ring.height + 1 >= target.height &&
    ring.width <= target.width + 40 &&
    ring.height <= target.height + 40
  );
}

async function main() {
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
    drain: {
      consoleErrors.length = 0;
    }

    // Start tutorial from Help
    await page.click("#openTutorial");
    await sleep(300);
    let step = await page.evaluate(() => window.__geometryExplor.getTutorialStep());
    assert(step === "welcome", "Tutorial opens on welcome step", step);

    // Got it advances to Geometry step
    await page.click("#introDone");
    await sleep(500);
    await page.evaluate(() => {
      document.getElementById("panel")?.scrollTo({ top: 0 });
      window.__geometryExplor.tutorialReposition();
    });
    await sleep(350);
    step = await page.evaluate(() => window.__geometryExplor.getTutorialStep());
    assert(step === "selectFlower", "pressing Got it advances to the Geometry tutorial step", step);

    const geoHighlight = await page.evaluate(() => {
      window.__geometryExplor.tutorialReposition();
      const geo = document.getElementById("geometry");
      const ring = document.getElementById("tutorialHighlight");
      const card = document.getElementById("tutorialCard");
      const pointer = document.getElementById("tutorialPointer");
      const layer = document.getElementById("tutorialLayer");
      const gr = geo.getBoundingClientRect();
      const hr = ring.getBoundingClientRect();
      const style = getComputedStyle(layer);
      return {
        spotlight: geo.classList.contains("tutorial-spotlight"),
        ringVisible: !ring.hidden,
        pointerVisible: !pointer.hidden,
        cardVisible: !card.hidden,
        layerPe: style.pointerEvents,
        geo: { left: gr.left, top: gr.top, width: gr.width, height: gr.height },
        ring: { left: hr.left, top: hr.top, width: hr.width, height: hr.height },
        flowerOption: [...geo.options].some((o) => o.value === "flowerOfLife"),
        selected: geo.value,
      };
    });
    assert(geoHighlight.spotlight, "the Geometry dropdown is highlighted");
    assert(geoHighlight.ringVisible && geoHighlight.pointerVisible, "highlight ring and pointer visible");
    assert(
      highlightTracksTarget(geoHighlight.geo, geoHighlight.ring),
      "pointer/highlight aligned to live Geometry dropdown rect",
      JSON.stringify({ geo: geoHighlight.geo, ring: geoHighlight.ring })
    );
    assert(geoHighlight.layerPe === "none", "tutorial layer does not capture clicks");
    assert(geoHighlight.flowerOption, "Flower of Life remains visible as an option");
    assert(geoHighlight.selected !== "flowerOfLife", "does not auto-select Flower of Life", geoHighlight.selected);

    // Click-through: select must work while highlighted
    await page.select("#geometry", "flowerOfLife");
    await sleep(700);
    step = await page.evaluate(() => window.__geometryExplor.getTutorialStep());
    assert(step === "enableConstruction", "selecting Flower of Life advances the tutorial", step);

    const afterFlower = await page.evaluate(() => ({
      geoSpotlight: document.getElementById("geometry").classList.contains("tutorial-spotlight"),
      modeSpotlight: document
        .getElementById("constructionMode")
        .classList.contains("tutorial-spotlight"),
      geometry: document.getElementById("geometry").value,
      title: document.getElementById("tutorialTitle")?.textContent,
    }));
    assert(!afterFlower.geoSpotlight, "Geometry dropdown highlight removed after selection");
    assert(afterFlower.modeSpotlight, "Construction Mode is highlighted next");
    assert(
      /Build the Flower of Life/i.test(afterFlower.title || ""),
      "Construction Mode step title shown",
      afterFlower.title
    );

    // Enable Construction Mode
    await page.click("#constructionMode");
    await sleep(700);
    step = await page.evaluate(() => window.__geometryExplor.getTutorialStep());
    assert(step === "scrubConstruction", "enabling Construction Mode advances the tutorial", step);

    const scrub = await page.evaluate(() => {
      const slider = document.getElementById("constructionStepSlider");
      const playback = document.getElementById("constructionPlayback");
      return {
        sliderSpotlight: slider.classList.contains("tutorial-spotlight"),
        sliderVisible: !playback.hidden && slider.offsetParent !== null,
        min: slider.min,
        max: slider.max,
        value: slider.value,
      };
    });
    assert(scrub.sliderSpotlight, "the Construction Step slider is highlighted next");
    assert(scrub.sliderVisible, "Construction Step slider is visible and interactive");

    const baseline = Number(scrub.value);
    // Moving right advances construction + report
    await page.$eval("#constructionStepSlider", (el) => {
      const next = Math.min(Number(el.max), Number(el.value) + 2);
      el.value = String(next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(500);
    const mid = await page.evaluate(() => {
      const st = window.__geometryExplor.getPlayerState();
      const report = window.__geometryExplor.getConstructionReport();
      const reportHtml = document.getElementById("tutorialReport")?.innerText || "";
      return {
        step: st.displayStep || st.step,
        total: st.totalSteps,
        report,
        reportHtml,
        stillScrub: window.__geometryExplor.getTutorialStep() === "scrubConstruction",
      };
    });
    assert(mid.step > baseline, "moving the slider right advances the construction", `${baseline}→${mid.step}`);
    assert(mid.report && mid.report.constructionRule, "tutorial reads canonical construction-report data");
    assert(
      /Step|Rule|Parent|Validation/i.test(mid.reportHtml),
      "construction report fields shown in tutorial card"
    );

    // Jump to final step
    await page.$eval("#constructionStepSlider", (el) => {
      el.value = el.max;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(800);
    const done = await page.evaluate(() => ({
      stepId: window.__geometryExplor.getTutorialStep(),
      title: document.getElementById("tutorialTitle")?.textContent,
      finish: Boolean(document.getElementById("tutorialFinish")),
      replay: Boolean(document.getElementById("tutorialReplay")),
    }));
    assert(done.stepId === "complete", "final construction step displays complete state", done.stepId);
    assert(
      /Flower of Life Complete/i.test(done.title || ""),
      "final step title is Flower of Life Complete",
      done.title
    );
    assert(done.finish && done.replay, "complete step offers Finish and Replay actions");

    // Responsive pointer alignment — iPad
    await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 2 });
    await page.evaluate(() => {
      window.__geometryExplor.endTutorial();
      window.__geometryExplor.startTutorial();
      window.__geometryExplor.tutorialAdvanceWelcome();
    });
    await sleep(500);
    await page.evaluate(() => window.__geometryExplor.tutorialReposition());
    await sleep(150);
    const ipad = await page.evaluate(() => {
      window.__geometryExplor.tutorialReposition();
      const geo = document.getElementById("geometry").getBoundingClientRect();
      const ring = document.getElementById("tutorialHighlight").getBoundingClientRect();
      const card = document.getElementById("tutorialCard").getBoundingClientRect();
      const panel = document.getElementById("panel").getBoundingClientRect();
      return {
        step: window.__geometryExplor.getTutorialStep(),
        geo: { left: geo.left, top: geo.top, width: geo.width, height: geo.height },
        ring: { left: ring.left, top: ring.top, width: ring.width, height: ring.height },
        cardOverlapsGeo:
          card.left < geo.right &&
          card.right > geo.left &&
          card.top < geo.bottom &&
          card.bottom > geo.top,
        cardLeftOfPanel: card.right <= panel.left + 8,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });
    assert(ipad.step === "selectFlower", "iPad layout still on Geometry tutorial step", ipad.step);
    assert(
      highlightTracksTarget(ipad.geo, ipad.ring, 22),
      "pointer positions remain aligned on iPad",
      JSON.stringify({ geo: ipad.geo, ring: ipad.ring })
    );
    assert(!ipad.cardOverlapsGeo, "iPad tutorial card does not cover Geometry dropdown");
    assert(ipad.scrollWidth <= ipad.clientWidth + 1, "no horizontal scrolling on iPad");

    // iPhone
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await sleep(400);
    await page.evaluate(() => {
      const geo = document.getElementById("geometry");
      geo.scrollIntoView({ block: "nearest" });
      window.__geometryExplor.tutorialReposition();
    });
    await sleep(300);
    const iphone = await page.evaluate(() => {
      const geo = document.getElementById("geometry");
      geo.scrollIntoView({ block: "nearest" });
      window.__geometryExplor.tutorialReposition();
      const gr = geo.getBoundingClientRect();
      const hr = document.getElementById("tutorialHighlight").getBoundingClientRect();
      const card = document.getElementById("tutorialCard").getBoundingClientRect();
      return {
        geo: { left: gr.left, top: gr.top, width: gr.width, height: gr.height },
        ring: { left: hr.left, top: hr.top, width: hr.width, height: hr.height },
        cardOverlapsGeo:
          card.left < gr.right - 4 &&
          card.right > gr.left + 4 &&
          card.top < gr.bottom - 4 &&
          card.bottom > gr.top + 4,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });
    assert(
      highlightTracksTarget(iphone.geo, iphone.ring, 28),
      "pointer positions remain aligned on iPhone",
      JSON.stringify({ geo: iphone.geo, ring: iphone.ring })
    );
    assert(!iphone.cardOverlapsGeo, "iPhone tutorial card does not cover Geometry dropdown");
    assert(iphone.scrollWidth <= iphone.clientWidth + 1, "no horizontal scrolling on iPhone");

    // Close removes highlights
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.evaluate(() => window.__geometryExplor.endTutorial());
    await sleep(200);
    const cleared = await page.evaluate(() => ({
      active: window.__geometryExplor.isTutorialActive(),
      spotlights: document.querySelectorAll(".tutorial-spotlight").length,
      layerHidden: document.getElementById("tutorialLayer").hidden,
      hiddenUi: {
        watercolor: !document.body.innerText.includes("Watercolor"),
        discovery: !document.getElementById("discoveriesPanel"),
        cameraProj: !document.getElementById("cameraProjection"),
      },
    }));
    assert(!cleared.active && cleared.spotlights === 0 && cleared.layerHidden, "closing the tutorial removes all highlights and pointers");
    assert(
      cleared.hiddenUi.watercolor && cleared.hiddenUi.discovery && cleared.hiddenUi.cameraProj,
      "no hidden UI feature is restored"
    );

    const bootErrs = consoleErrors.filter(
      (e) => !/favicon|ResizeObserver|net::ERR/i.test(e)
    );
    assert(bootErrs.length === 0, "the app loads without console errors", bootErrs[0] || "");

    await browser.close();
  } finally {
    try {
      preview.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll guided-tutorial checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Guided tutorial harness fatal:", err);
  process.exit(1);
});
