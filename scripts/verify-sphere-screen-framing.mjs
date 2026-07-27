/**
 * Browser acceptance: Vesica Step 1 sphere occupies ~16–22% of usable canvas height.
 * Starts its own Vite preview. Requires google-chrome.
 *
 * Run: node scripts/verify-sphere-screen-framing.mjs
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { DEFAULT_FIT_MARGIN, MIN_CAMERA_DISTANCE } from "../src/exploration/framingDefaults.js";

const PORT = process.env.PORT || "4175";
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
    console.log("Installing puppeteer-core…");
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

async function main() {
  console.log(
    `Framing constants: DEFAULT_FIT_MARGIN=${DEFAULT_FIT_MARGIN} (prev 0.13), ` +
      `MIN_CAMERA_DISTANCE=${MIN_CAMERA_DISTANCE} (prev FOV-only ~3.4)`
  );

  // Build first, then serve — avoids racing an empty/partial dist against preview.
  await new Promise((resolve, reject) => {
    const b = spawn("npm", ["run", "build"], { cwd: "/workspace", stdio: "inherit" });
    b.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("build failed"))));
  });

  const preview = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", PORT], {
    cwd: "/workspace",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  let previewLog = "";
  preview.stdout.on("data", (d) => {
    previewLog += d.toString();
  });
  preview.stderr.on("data", (d) => {
    previewLog += d.toString();
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
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForFunction(() => window.__geometryExplor, { timeout: 15000 });

    // Close intro so it does not affect layout/clicks
    await page.evaluate(() => window.__geometryExplor.closeIntro());
    await sleep(200);

    await page.select("#geometry", "vesicaPiscis");
    await page.evaluate(() => window.__geometryExplor.setActiveRenderLayers(["spheres"]));
    await page.$eval("#layers", (el) => {
      el.value = "1";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(300);
    await page.click("#resetView");
    await sleep(1000);
    await page.evaluate(() => {
      window.__geometryExplor.frameActiveConstruction({ animate: false, duration: 0 });
      window.__geometryExplor.publishFramingDebug();
    });
    await sleep(100);

    const measure = await page.evaluate(() => window.__geometryExplor.measureSphereScreenSpace());
    const distance = await page.evaluate(() => window.__geometryExplor.getCameraDistance());

    assert(measure, "sphere screen-space measurement available");
    if (measure) {
      const pct = measure.heightFraction * 100;
      assert(
        measure.heightFraction <= 0.22,
        "sphere ≤ 22% of usable canvas height",
        `${pct.toFixed(1)}%`
      );
      assert(
        measure.heightFraction >= 0.16,
        "sphere ≥ 16% of usable canvas height",
        `${pct.toFixed(1)}%`
      );
      // Must fail if sphere fills most of the screen (old margin 0.13 ≈ 76%)
      assert(
        measure.heightFraction < 0.5,
        "sphere does not fill most of the screen",
        `${pct.toFixed(1)}%`
      );
      assert(measure.fullyVisible, "entire sphere is visible on screen");
      assert(!measure.overlapsPanel, "menu does not overlap the sphere");
      assert(
        Math.abs(measure.centerOffsetX) < measure.usableWidth * 0.12,
        "sphere roughly centered horizontally in usable area",
        `dx=${measure.centerOffsetX.toFixed(1)}`
      );
      assert(
        Math.abs(measure.centerOffsetY) < measure.usableHeight * 0.18,
        "sphere roughly centered vertically in usable area",
        `dy=${measure.centerOffsetY.toFixed(1)}`
      );
      console.log(
        `MEASURED sphere height fraction: ${pct.toFixed(2)}% ` +
          `(${measure.sphereHeight.toFixed(1)}px / ${measure.usableHeight.toFixed(1)}px usable)`
      );
    }
    assert(distance >= MIN_CAMERA_DISTANCE, "camera distance ≥ minimum", `d=${distance.toFixed(2)}`);

    // Reset View restores the same calm framing
    await page.evaluate(() => {
      // Nudge camera closer
      const api = window.__geometryExplor;
      api.frameActiveConstruction({ animate: false, duration: 0 });
    });
    await page.mouse.wheel({ deltaY: -400 });
    await sleep(200);
    await page.click("#resetView");
    await sleep(1000);
    await page.evaluate(() => {
      window.__geometryExplor.frameActiveConstruction({ animate: false, duration: 0 });
    });
    const afterReset = await page.evaluate(() => window.__geometryExplor.measureSphereScreenSpace());
    if (afterReset) {
      const pct = afterReset.heightFraction * 100;
      assert(
        afterReset.heightFraction >= 0.16 && afterReset.heightFraction <= 0.22,
        "Reset View restores 16–22% sphere framing",
        `${pct.toFixed(1)}%`
      );
    } else {
      assert(false, "Reset View restores 16–22% sphere framing", "no measurement");
    }

    // Construction step change must not zoom tightly
    await page.$eval("#layers", (el) => {
      el.value = "2";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(400);
    await page.$eval("#layers", (el) => {
      el.value = "1";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(400);
    const afterStep = await page.evaluate(() => window.__geometryExplor.measureSphereScreenSpace());
    if (afterStep) {
      assert(
        afterStep.heightFraction < 0.35,
        "construction step change does not zoom tightly into first sphere",
        `${(afterStep.heightFraction * 100).toFixed(1)}%`
      );
    }

    // Renderer change must not change camera distance
    const distBefore = await page.evaluate(() => window.__geometryExplor.getCameraDistance());
    await page.evaluate(() => window.__geometryExplor.selectAllRenderLayers());
    await sleep(300);
    await page.evaluate(() => window.__geometryExplor.setActiveRenderLayers(["spheres"]));
    await sleep(300);
    const distAfter = await page.evaluate(() => window.__geometryExplor.getCameraDistance());
    assert(
      Math.abs(distAfter - distBefore) < 0.05,
      "changing renderer does not change camera distance",
      `${distBefore.toFixed(3)} → ${distAfter.toFixed(3)}`
    );

    await browser.close();
  } finally {
    try {
      preview.kill("SIGKILL");
    } catch {
      /* already exited */
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll sphere screen-framing checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Sphere framing harness fatal:", err);
  process.exit(1);
});
