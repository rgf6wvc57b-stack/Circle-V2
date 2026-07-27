/**
 * Real-browser regression for Geometry Explor.
 * Requires: google-chrome, vite preview/dev on PORT (default 5173)
 *
 * Run: node scripts/browser-regression.mjs
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.PORT || "4173";
const BASE_PATH = process.env.BASE_PATH || "/-Geometry-Explor/";
const BASE = `http://127.0.0.1:${PORT}${BASE_PATH}`;
const results = [];

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  console.log(`${status}: ${name}${detail ? " — " + detail : ""}`);
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

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200) return;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error(`Server not ready at ${url}`);
}

async function main() {
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
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`);
  });

  const drainErrors = () => {
    const copy = [...consoleErrors];
    consoleErrors.length = 0;
    return copy;
  };

  await waitForServer(BASE);
  // Clear any prior intro preference so startup auto-open can be asserted.
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    try {
      localStorage.removeItem("geometry-explor:show-intro-on-open");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#geometry option").length > 0 && window.__geometryExplor,
    { timeout: 15000 }
  );
  await sleep(500);

  // Boot errors
  {
    const errs = drainErrors();
    if (errs.length) {
      record("app boot", "FAIL", errs[0]);
    } else {
      record("app boot", "PASS");
    }
  }

  // Introduction preference — default checked + auto-open for new users
  {
    const introState = await page.evaluate(() => {
      const api = window.__geometryExplor;
      const settings = document.getElementById("showIntroOnOpen");
      const dialog = document.getElementById("showIntroOnOpenDialog");
      return {
        pref: api.getShowIntroOnOpen(),
        open: api.isIntroOpen(),
        settingsChecked: Boolean(settings?.checked),
        dialogChecked: Boolean(dialog?.checked),
      };
    });
    if (introState.pref && introState.settingsChecked && introState.dialogChecked) {
      record("intro checkbox checked for new user", "PASS");
    } else {
      record("intro checkbox checked for new user", "FAIL", JSON.stringify(introState));
    }
    if (introState.open) record("introduction opens automatically when checked", "PASS");
    else record("introduction opens automatically when checked", "FAIL", "overlay hidden");

    // Uncheck via settings — preference shared; close and reload must not auto-open
    await page.evaluate(() => {
      const el = document.getElementById("showIntroOnOpen");
      if (el && el.checked) el.click();
      window.__geometryExplor.closeIntro();
    });
    await sleep(200);
    const unchecked = await page.evaluate(() => ({
      pref: window.__geometryExplor.getShowIntroOnOpen(),
      settings: document.getElementById("showIntroOnOpen")?.checked,
      dialog: document.getElementById("showIntroOnOpenDialog")?.checked,
    }));
    if (!unchecked.pref && !unchecked.settings && !unchecked.dialog) {
      record("shared intro preference unchecks both boxes", "PASS");
    } else {
      record("shared intro preference unchecks both boxes", "FAIL", JSON.stringify(unchecked));
    }

    await page.reload({ waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForFunction(() => window.__geometryExplor, { timeout: 15000 });
    await sleep(400);
    const afterReload = await page.evaluate(() => ({
      pref: window.__geometryExplor.getShowIntroOnOpen(),
      open: window.__geometryExplor.isIntroOpen(),
      settings: document.getElementById("showIntroOnOpen")?.checked,
    }));
    if (!afterReload.pref && !afterReload.open && afterReload.settings === false) {
      record("intro preference persists after reload (stays off)", "PASS");
    } else {
      record(
        "intro preference persists after reload (stays off)",
        "FAIL",
        JSON.stringify(afterReload)
      );
    }
    if (!afterReload.open) {
      record("introduction does not open automatically when unchecked", "PASS");
    } else {
      record("introduction does not open automatically when unchecked", "FAIL");
    }

    // Manual open via Tutorial
    await page.click("#openTutorial");
    await sleep(200);
    const manual = await page.evaluate(() => window.__geometryExplor.isIntroOpen());
    if (manual) record("tutorial can still be opened manually", "PASS");
    else record("tutorial can still be opened manually", "FAIL");

    // Closing must not auto-uncheck (re-check, close via ✕ — Got it advances the tour)
    await page.evaluate(() => {
      const el = document.getElementById("showIntroOnOpenDialog");
      if (el && !el.checked) el.click();
    });
    await sleep(100);
    await page.click("#introClose");
    await sleep(200);
    const afterClose = await page.evaluate(() => ({
      open: window.__geometryExplor.isIntroOpen(),
      active: window.__geometryExplor.isTutorialActive(),
      pref: window.__geometryExplor.getShowIntroOnOpen(),
      settings: document.getElementById("showIntroOnOpen")?.checked,
    }));
    if (!afterClose.open && !afterClose.active && afterClose.pref && afterClose.settings) {
      record("closing introduction does not uncheck preference", "PASS");
    } else {
      record(
        "closing introduction does not uncheck preference",
        "FAIL",
        JSON.stringify(afterClose)
      );
    }

    // Reset Controls must not change preference — turn off, reset, still off
    await page.evaluate(() => {
      const el = document.getElementById("showIntroOnOpen");
      if (el && el.checked) el.click();
    });
    await sleep(100);
    const beforeReset = await page.evaluate(() => window.__geometryExplor.getShowIntroOnOpen());
    await page.click("#resetControls");
    await sleep(500);
    const afterResetPref = await page.evaluate(() => ({
      pref: window.__geometryExplor.getShowIntroOnOpen(),
      settings: document.getElementById("showIntroOnOpen")?.checked,
    }));
    if (beforeReset === false && afterResetPref.pref === false && afterResetPref.settings === false) {
      record("Reset Controls does not change intro preference", "PASS");
    } else {
      record(
        "Reset Controls does not change intro preference",
        "FAIL",
        JSON.stringify({ beforeReset, afterResetPref })
      );
    }

    // Keep intro closed for the rest of the suite
    await page.evaluate(() => window.__geometryExplor.closeIntro());
  }

  // Calm framing distance + screen-space sphere size (Vesica / spheres / step 1)
  {
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await sleep(300);
    await page.select("#geometry", "vesicaPiscis");
    await page.evaluate(() => window.__geometryExplor.setActiveRenderLayers(["spheres"]));
    await page.$eval("#layers", (el) => {
      el.value = "1";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(300);
    await page.click("#resetView");
    await sleep(900);
    await page.evaluate(() => {
      window.__geometryExplor.frameActiveConstruction({ animate: false, duration: 0 });
      window.__geometryExplor.publishFramingDebug();
    });
    const framing = await page.evaluate(() => {
      const m = window.__geometryExplor.measureSphereScreenSpace();
      return {
        distance: window.__geometryExplor.getCameraDistance(),
        heightFraction: m?.heightFraction ?? null,
        fullyVisible: m?.fullyVisible ?? false,
        overlapsPanel: m?.overlapsPanel ?? true,
        target: (document.getElementById("viewport")?.dataset.orbitTarget || "")
          .split(",")
          .map(Number),
      };
    });
    if (framing.distance >= 10) {
      record("startup camera distance is calm (≥10)", "PASS");
    } else {
      record("startup camera distance is calm (≥10)", "FAIL", `distance=${framing.distance}`);
    }
    const targetOk =
      framing.target.length === 3 &&
      framing.target.every((n) => Number.isFinite(n)) &&
      Math.hypot(...framing.target) < 0.75;
    if (targetOk) record("startup orbit target near geometric center", "PASS");
    else {
      record(
        "startup orbit target near geometric center",
        "FAIL",
        JSON.stringify(framing.target)
      );
    }
    if (
      framing.heightFraction != null &&
      framing.heightFraction >= 0.16 &&
      framing.heightFraction <= 0.22
    ) {
      record(
        "Vesica step-1 sphere is 16–22% of usable height",
        "PASS",
        `${(framing.heightFraction * 100).toFixed(1)}%`
      );
    } else {
      record(
        "Vesica step-1 sphere is 16–22% of usable height",
        "FAIL",
        framing.heightFraction == null
          ? "no measurement"
          : `${(framing.heightFraction * 100).toFixed(1)}%`
      );
    }
    if (framing.fullyVisible && !framing.overlapsPanel) {
      record("sphere fully visible and clear of menu", "PASS");
    } else {
      record(
        "sphere fully visible and clear of menu",
        "FAIL",
        JSON.stringify({
          fullyVisible: framing.fullyVisible,
          overlapsPanel: framing.overlapsPanel,
        })
      );
    }
  }

  async function measureMenuToggle() {
    return page.evaluate(() => {
      const btn = document.getElementById("menuToggle");
      const panel = document.getElementById("panel");
      const app = document.getElementById("app");
      if (!btn) return null;
      const br = btn.getBoundingClientRect();
      const pr = panel?.getBoundingClientRect();
      const style = getComputedStyle(btn);
      const duplicates = document.querySelectorAll("#menuToggle, .menu-toggle").length;
      const overlapsPanel =
        pr &&
        !app?.classList.contains("panel-collapsed") &&
        br.right > pr.left + 2 &&
        br.left < pr.right - 2 &&
        br.bottom > pr.top + 2 &&
        br.top < pr.bottom - 2;
      return {
        width: br.width,
        height: br.height,
        left: br.left,
        top: br.top,
        right: br.right,
        bottom: br.bottom,
        vw: window.innerWidth,
        vh: window.innerHeight,
        cssWidth: style.width,
        position: style.position,
        duplicates,
        overlapsPanel: Boolean(overlapsPanel),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        ariaExpanded: btn.getAttribute("aria-expanded"),
        ariaControls: btn.getAttribute("aria-controls"),
        ariaLabel: btn.getAttribute("aria-label"),
        label: btn.querySelector(".menu-toggle-label")?.textContent?.trim() || "",
        panelCollapsed: app?.classList.contains("panel-collapsed") || false,
        panelHidden: panel ? getComputedStyle(panel).visibility === "hidden" : true,
      };
    });
  }

  // Compact Menu toggle — never a full-width bar
  {
    const m = await measureMenuToggle();
    if (!m) {
      record("Menu toggle present", "FAIL", "missing #menuToggle");
    } else {
      const compact = m.width < m.vw * 0.45 && m.width < 220;
      if (compact) record("Menu button width is compact", "PASS");
      else {
        record(
          "Menu button width is compact",
          "FAIL",
          `width=${m.width.toFixed(1)} vw=${m.vw}`
        );
      }
      if (m.height >= 44 && m.width >= 44) {
        record("Menu button meets ~44px touch target", "PASS");
      } else {
        record(
          "Menu button meets ~44px touch target",
          "FAIL",
          `${m.width.toFixed(1)}×${m.height.toFixed(1)}`
        );
      }
      const inBounds =
        m.left >= -1 &&
        m.top >= -1 &&
        m.right <= m.vw + 1 &&
        m.bottom <= m.vh + 1;
      if (inBounds) record("Menu button within safe viewport bounds", "PASS");
      else record("Menu button within safe viewport bounds", "FAIL", JSON.stringify(m));

      if (m.left < m.vw * 0.35 && m.top < m.vh * 0.25) {
        record("Menu button near upper-left", "PASS");
      } else {
        record(
          "Menu button near upper-left",
          "FAIL",
          `left=${m.left.toFixed(1)} top=${m.top.toFixed(1)}`
        );
      }

      if (m.duplicates === 1) record("no duplicate Menu controls", "PASS");
      else record("no duplicate Menu controls", "FAIL", `count=${m.duplicates}`);

      if (!m.overlapsPanel) record("Menu button does not overlap control panel", "PASS");
      else record("Menu button does not overlap control panel", "FAIL", "overlap detected");

      if (m.scrollWidth <= m.clientWidth + 1) {
        record("menu does not create horizontal scrolling", "PASS");
      } else {
        record(
          "menu does not create horizontal scrolling",
          "FAIL",
          `scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth}`
        );
      }

      if (m.ariaControls === "panel" && m.ariaExpanded === "true" && m.label === "Menu") {
        record("Menu button a11y attributes when panel open", "PASS");
      } else {
        record(
          "Menu button a11y attributes when panel open",
          "FAIL",
          JSON.stringify({
            ariaControls: m.ariaControls,
            ariaExpanded: m.ariaExpanded,
            label: m.label,
          })
        );
      }

      // Close panel — compact button remains, panel hides
      await page.click("#menuToggle");
      await sleep(450);
      const closed = await measureMenuToggle();
      if (
        closed &&
        closed.panelCollapsed &&
        closed.ariaExpanded === "false" &&
        closed.width < closed.vw * 0.45 &&
        closed.left < closed.vw * 0.35
      ) {
        record("Menu toggle closes panel and stays compact upper-left", "PASS");
      } else {
        record(
          "Menu toggle closes panel and stays compact upper-left",
          "FAIL",
          JSON.stringify(closed)
        );
      }

      // Reopen
      await page.click("#menuToggle");
      await sleep(450);
      const reopened = await measureMenuToggle();
      if (reopened && !reopened.panelCollapsed && reopened.ariaExpanded === "true") {
        record("Menu toggle reopens control panel", "PASS");
      } else {
        record("Menu toggle reopens control panel", "FAIL", JSON.stringify(reopened));
      }
    }
  }

  // Phone / iPad layout checks via viewport resize
  {
    async function checkLayout(name, width, height) {
      await page.setViewport({ width, height, deviceScaleFactor: 2 });
      await sleep(400);
      // Ensure panel open for overlap / sheet checks
      await page.evaluate(() => {
        const app = document.getElementById("app");
        if (app?.classList.contains("panel-collapsed")) {
          document.getElementById("menuToggle")?.click();
        }
      });
      await sleep(500);
      const m = await measureMenuToggle();
      const ok =
        m &&
        m.width < width * 0.5 &&
        m.width < 220 &&
        m.left < width * 0.4 &&
        m.top < height * 0.3 &&
        !m.overlapsPanel &&
        m.scrollWidth <= m.clientWidth + 1;
      if (ok) record(`compact Menu layout (${name})`, "PASS");
      else record(`compact Menu layout (${name})`, "FAIL", JSON.stringify(m));
    }
    await checkLayout("iPhone", 390, 844);
    await checkLayout("iPad", 1024, 768);
    // Restore a desktop-ish viewport for the rest of the suite
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await sleep(400);
    await page.evaluate(() => {
      const app = document.getElementById("app");
      if (app?.classList.contains("panel-collapsed")) {
        document.getElementById("menuToggle")?.click();
      }
    });
    await sleep(400);
  }

  async function readBackgroundSample() {
    return page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const canvas = document.getElementById("viewport");
      const gl =
        canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl");
      let corner = null;
      if (gl) {
        const pixels = new Uint8Array(4);
        // Lower-left of the drawing buffer — away from the control panel on desktop.
        gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        corner = { r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3] };
      }
      return {
        cssBg: body.backgroundColor,
        cssImage: body.backgroundImage,
        corner,
      };
    });
  }

  /** Original dark navy scene/page backdrop before PR #22: #0e1a24 */
  function isNearDarkNavy(sample, tol = 28) {
    if (!sample) return false;
    const target = { r: 0x0e, g: 0x1a, b: 0x24 };
    return (
      Math.abs(sample.r - target.r) <= tol &&
      Math.abs(sample.g - target.g) <= tol &&
      Math.abs(sample.b - target.b) <= tol
    );
  }

  function isNotWhite(sample) {
    if (!sample) return false;
    return !(sample.r >= 240 && sample.g >= 240 && sample.b >= 240);
  }

  // Scene / page background is the restored dark theme on startup
  {
    const sample = await readBackgroundSample();
    const cssWhite =
      sample.cssBg === "rgb(255, 255, 255)" || sample.cssBg === "#ffffff";
    const hasGradient =
      Boolean(sample.cssImage) && sample.cssImage !== "none";
    if (!cssWhite && hasGradient) {
      record("CSS dark gradient background on startup", "PASS");
    } else {
      record(
        "CSS dark gradient background on startup",
        "FAIL",
        JSON.stringify({ cssBg: sample.cssBg, cssImage: sample.cssImage })
      );
    }
    if (isNearDarkNavy(sample.corner)) {
      record("scene canvas dark navy background on startup", "PASS");
    } else {
      record(
        "scene canvas dark navy background on startup",
        "FAIL",
        JSON.stringify(sample.corner)
      );
    }
    if (!cssWhite && isNotWhite(sample.corner)) {
      record("no white page or scene background remains", "PASS");
    } else {
      record(
        "no white page or scene background remains",
        "FAIL",
        JSON.stringify({ cssBg: sample.cssBg, corner: sample.corner })
      );
    }
  }

  // Helper: select option and wait
  async function selectAndSettle(selectId, value) {
    await page.select(`#${selectId}`, value);
    await sleep(400);
  }

  async function setChecked(id, checked) {
    await page.$eval(
      `#${id}`,
      (el, value) => {
        if (el.checked === value) return;
        el.click();
      },
      checked
    );
    await sleep(300);
  }

  async function clickId(id) {
    await page.$eval(`#${id}`, (el) => {
      el.disabled = false;
      el.click();
    });
    await sleep(250);
  }

  // Geometry dropdown: menu-visible options only; Vesica default
  const geometryValues = await page.$$eval("#geometry option", (opts) =>
    opts.map((o) => o.value)
  );
  const geometryLabels = await page.$$eval("#geometry option", (opts) =>
    opts.map((o) => o.textContent.trim())
  );
  const selectedGeometry = await page.$eval("#geometry", (el) => el.value);
  if (geometryValues.includes("point") || geometryValues.includes("circle") || geometryValues.includes("sphere")) {
    record("Geometry dropdown hides Point/Circle/Sphere", "FAIL", geometryValues.join(","));
  } else {
    record("Geometry dropdown hides Point/Circle/Sphere", "PASS");
  }
  if (geometryValues[0] === "vesicaPiscis" && geometryLabels[0] === "Vesica Piscis") {
    record("Geometry dropdown starts with Vesica Piscis", "PASS");
  } else {
    record(
      "Geometry dropdown starts with Vesica Piscis",
      "FAIL",
      `${geometryValues[0]} / ${geometryLabels[0]}`
    );
  }
  if (selectedGeometry === "vesicaPiscis") {
    record("Initial geometry selection is Vesica Piscis", "PASS");
  } else {
    record("Initial geometry selection is Vesica Piscis", "FAIL", selectedGeometry);
  }

  for (const value of geometryValues) {
    await selectAndSettle("geometry", value);
    const errs = drainErrors();
    if (errs.length) record(`geometry → ${value}`, "FAIL", errs[0]);
    else record(`geometry → ${value}`, "PASS");
  }

  {
    const sample = await readBackgroundSample();
    if (isNearDarkNavy(sample.corner)) {
      record("changing geometry keeps dark background", "PASS");
    } else {
      record(
        "changing geometry keeps dark background",
        "FAIL",
        JSON.stringify(sample.corner)
      );
    }
  }

  // Renderer multi-select: only menu-visible layers
  await selectAndSettle("geometry", "seedOfLife");
  const renderValues = await page.$$eval("[data-render-layer]", (opts) =>
    opts.map((o) => o.getAttribute("data-render-layer"))
  );
  const selectedRender = await page.evaluate(() =>
    window.__geometryExplor.getActiveRenderLayers().join(",")
  );
  const hiddenRenderers = [
    "constructionPlane",
    "traditionalTreeOfLife",
    "geometricTreeOfLife",
    "mixed",
  ];
  if (hiddenRenderers.some((id) => renderValues.includes(id))) {
    record(
      "Render dropdown hides Construction Plane / Tree specialty modes",
      "FAIL",
      renderValues.join(",")
    );
  } else {
    record(
      "Render dropdown hides Construction Plane / Tree specialty modes",
      "PASS"
    );
  }
  if (hiddenRenderers.some((id) => selectedRender.split(",").includes(id))) {
    record("Startup renderer is not a removed option", "FAIL", selectedRender);
  } else {
    record("Startup renderer is not a removed option", "PASS");
  }

  for (const value of renderValues) {
    await selectAndSettle("geometry", "seedOfLife");
    drainErrors();
    await page.evaluate((layer) => {
      window.__geometryExplor.setActiveRenderLayers([layer]);
    }, value);
    await sleep(250);
    const errs = drainErrors();
    if (errs.length) record(`renderer → ${value}`, "FAIL", errs[0]);
    else record(`renderer → ${value}`, "PASS");
  }

  {
    const sample = await readBackgroundSample();
    if (isNearDarkNavy(sample.corner)) {
      record("changing renderer keeps dark background", "PASS");
    } else {
      record(
        "changing renderer keeps dark background",
        "FAIL",
        JSON.stringify(sample.corner)
      );
    }
  }

  // Tree of Life with All Layers (former Mixed)
  drainErrors();
  await selectAndSettle("geometry", "treeOfLife");
  await page.evaluate(() => window.__geometryExplor.selectAllRenderLayers());
  await sleep(250);
  {
    const errs = drainErrors();
    if (errs.length) record("Tree of Life with Mixed renderer", "FAIL", errs[0]);
    else record("Tree of Life with Mixed renderer", "PASS");
  }

  // Tree modes
  await selectAndSettle("geometry", "treeOfLife");
  await sleep(300);
  const treeGroupHidden = await page.$eval("#treeViewModeGroup", (el) => el.hidden);
  if (treeGroupHidden) {
    record("Tree mode UI visible", "FAIL", "treeViewModeGroup hidden for treeOfLife");
  } else {
    record("Tree mode UI visible", "PASS");
  }
  const treeModes = await page.$$eval("#treeViewMode option", (opts) =>
    opts.map((o) => ({ value: o.value, text: o.textContent.trim() }))
  );
  const hasEmergent = treeModes.some((m) => /emergent/i.test(m.value) || /emergent/i.test(m.text));
  if (hasEmergent) record("Emergent Tree absent from UI", "FAIL", JSON.stringify(treeModes));
  else record("Emergent Tree absent from UI", "PASS");

  for (const mode of ["traditional", "spatial", "geometric"]) {
    drainErrors();
    await selectAndSettle("treeViewMode", mode);
    const errs = drainErrors();
    if (errs.length) record(`Tree mode → ${mode}`, "FAIL", errs[0]);
    else record(`Tree mode → ${mode}`, "PASS");
  }

  // Geometric overlays UI removed — confirm absent even in Geometric Tree mode
  await selectAndSettle("treeViewMode", "geometric");
  await sleep(300);
  {
    const geoGroup = await page.$("#geometricFlagsGroup");
    const geoLabel = await page.evaluate(() =>
      [...document.querySelectorAll("#panel label, #panel h2")].some((el) =>
        /Geometric overlays/i.test(el.textContent || "")
      )
    );
    if (geoGroup || geoLabel) {
      record("Geometric overlays hidden", "FAIL", "still present in panel");
    } else {
      record("Geometric overlays hidden", "PASS");
    }
  }

  // Display overlays
  await selectAndSettle("geometry", "seedOfLife");
  await page.evaluate(() => window.__geometryExplor.setActiveRenderLayers(["spheres"]));
  await sleep(250);
  for (const [id, label] of [
    ["togCenters", "overlay sphere centers"],
    ["togRadiusLines", "overlay radius lines"],
    ["togCircles", "overlay circle outlines"],
    ["togPlane", "overlay construction plane"],
    ["togGrid", "overlay grid"],
    ["togLabels", "overlay labels"],
    ["togIntersections", "overlay intersection points"],
  ]) {
    drainErrors();
    const el = await page.$(`#${id}`);
    if (!el) {
      record(label, "FAIL", "element missing");
      continue;
    }
    await el.click();
    await sleep(150);
    const errs = drainErrors();
    if (errs.length) record(label, "FAIL", errs[0]);
    else record(label, "PASS");
  }

  // Evolution Mode
  drainErrors();
  await page.click("#evolutionMode");
  await sleep(400);
  let errs = drainErrors();
  if (errs.length) record("Evolution Mode enable", "FAIL", errs[0]);
  else record("Evolution Mode enable", "PASS");

  try {
    await page.waitForFunction(
      () => !document.getElementById("evolutionPlayback")?.hidden,
      { timeout: 5000 }
    );
    record("Evolution playback visible", "PASS");
  } catch {
    const detail = await page.$eval("#evolutionPlayback", (el) =>
      JSON.stringify({
        hidden: el.hidden,
        checked: document.getElementById("evolutionMode")?.checked,
      })
    );
    record("Evolution playback visible", "FAIL", detail);
  }

  // Step Forward / Back / Restart
  drainErrors();
  for (let i = 0; i < 3; i += 1) {
    await clickId("evoStepForward");
  }
  errs = drainErrors();
  if (errs.length) record("Evolution Step Forward", "FAIL", errs[0]);
  else record("Evolution Step Forward", "PASS");

  drainErrors();
  await clickId("evoStepBack");
  errs = drainErrors();
  if (errs.length) record("Evolution Step Back", "FAIL", errs[0]);
  else record("Evolution Step Back", "PASS");

  drainErrors();
  await clickId("evoRestart");
  await sleep(200);
  const stepAfterRestart = await page.$eval("#evoStepCurrent", (el) => el.textContent.trim());
  errs = drainErrors();
  if (errs.length || stepAfterRestart !== "0") {
    record(
      "Evolution Restart",
      "FAIL",
      errs[0] || `step=${stepAfterRestart}, expected 0`
    );
  } else {
    record("Evolution Restart", "PASS");
  }

  // Exit evolution, Construction Mode
  await page.click("#evolutionMode");
  await sleep(300);
  drainErrors();
  await page.click("#constructionMode");
  await sleep(400);
  errs = drainErrors();
  try {
    await page.waitForFunction(
      () => !document.getElementById("constructionPlayback")?.hidden,
      { timeout: 5000 }
    );
    if (errs.length) record("Construction Mode", "FAIL", errs[0]);
    else record("Construction Mode", "PASS");
  } catch {
    const detail = await page.$eval("#constructionPlayback", (el) =>
      JSON.stringify({
        hidden: el.hidden,
        checked: document.getElementById("constructionMode")?.checked,
        evo: document.getElementById("evolutionMode")?.checked,
      })
    );
    record("Construction Mode", "FAIL", errs[0] || detail);
  }
  // step forward/back in construction
  drainErrors();
  await clickId("btnStepForward");
  await clickId("btnStepBack");
  await clickId("btnRestart");
  errs = drainErrors();
  if (errs.length) record("Construction step controls", "FAIL", errs[0]);
  else record("Construction step controls", "PASS");
  await setChecked("constructionMode", false);

  // Camera orbit / zoom via wheel and drag on canvas
  drainErrors();
  const canvas = await page.$("#viewport");
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 40, { steps: 10 });
  await page.mouse.up();
  await sleep(300);
  errs = drainErrors();
  if (errs.length) record("camera orbit", "FAIL", errs[0]);
  else record("camera orbit", "PASS");

  drainErrors();
  await page.mouse.move(cx, cy);
  await page.mouse.wheel({ deltaY: 200 });
  await sleep(200);
  await page.mouse.wheel({ deltaY: -200 });
  await sleep(200);
  errs = drainErrors();
  if (errs.length) record("zoom", "FAIL", errs[0]);
  else record("zoom", "PASS");

  drainErrors();
  await page.click("#resetView");
  await sleep(500);
  errs = drainErrors();
  if (errs.length) record("Reset View", "FAIL", errs[0]);
  else record("Reset View", "PASS");

  // Focus selection — click canvas center (may or may not hit a sphere)
  await selectAndSettle("geometry", "seedOfLife");
  await page.evaluate(() => window.__geometryExplor.setActiveRenderLayers(["spheres"]));
  await sleep(400);
  drainErrors();
  await page.mouse.click(cx, cy);
  await sleep(400);
  errs = drainErrors();
  if (errs.length) record("Focus selection click", "FAIL", errs[0]);
  else record("Focus selection click", "PASS");

  // Hidden UI sections / Watercolor must not appear
  {
    const hiddenUi = await page.evaluate(() => {
      const panel = document.getElementById("panel");
      const text = panel?.innerText || "";
      return {
        discovery: Boolean(document.getElementById("discoveriesPanel")) || /Discovery Explorer/i.test(text),
        exploration: /(?:^|\n)\s*Exploration\s*(?:\n|$)/i.test(text) || Boolean(document.getElementById("measurementMode")),
        projection: Boolean(document.getElementById("cameraProjection")) || /\bProjection\b/.test(text),
        watercolor: /Watercolor/i.test(text) || Boolean(document.querySelector('[data-opacity-preset="watercolor"]')),
        watercolorOption: Boolean(document.querySelector('#palette option[value="watercolor"]')),
        palette: document.getElementById("palette")?.value || null,
      };
    });
    if (hiddenUi.discovery) record("Discovery Explorer hidden", "FAIL", "still visible");
    else record("Discovery Explorer hidden", "PASS");
    if (hiddenUi.exploration) record("Exploration hidden", "FAIL", "still visible");
    else record("Exploration hidden", "PASS");
    if (hiddenUi.projection) record("Camera projection hidden", "FAIL", "still visible");
    else record("Camera projection hidden", "PASS");
    if (hiddenUi.watercolor || hiddenUi.watercolorOption) {
      record("Watercolor hidden", "FAIL", JSON.stringify(hiddenUi));
    } else {
      record("Watercolor hidden", "PASS");
    }
    if (hiddenUi.palette === "watercolor") {
      record("startup does not select Watercolor", "FAIL", `palette=${hiddenUi.palette}`);
    } else {
      record("startup does not select Watercolor", "PASS");
    }
  }

  // Sphere color + opacity
  drainErrors();
  const colorSection = await page.$("#sphereColorsSection");
  if (!colorSection) record("sphere color controls", "FAIL", "section missing");
  else {
    await page.select("#sphereColorMode", "global");
    await page.$eval("#globalSphereColor", (el) => {
      el.value = "#ff6600";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(200);
    await page.$eval("#globalSphereOpacity", (el) => {
      el.value = "50";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(200);
    await page.click('[data-opacity-preset="solid"][data-target="global"]');
    await sleep(200);
    const watercolorBtn = await page.$('[data-opacity-preset="watercolor"]');
    if (watercolorBtn) record("opacity presets without Watercolor", "FAIL", "button present");
    else record("opacity presets without Watercolor", "PASS");
    errs = drainErrors();
    if (errs.length) record("sphere color controls", "FAIL", errs[0]);
    else record("sphere color controls", "PASS");
    if (errs.length) record("opacity controls", "FAIL", errs[0]);
    else record("opacity controls", "PASS");
  }

  // Reset Controls must not restore hidden options; keeps restored dark background
  drainErrors();
  await page.click("#resetControls");
  await sleep(500);
  {
    const afterReset = await page.evaluate(() => ({
      palette: document.getElementById("palette")?.value || null,
      watercolorBtn: Boolean(document.querySelector('[data-opacity-preset="watercolor"]')),
      projection: Boolean(document.getElementById("cameraProjection")),
      inspect: Boolean(document.getElementById("inspectMode")),
      measure: Boolean(document.getElementById("measurementMode")),
      discovery: Boolean(document.getElementById("discoveriesPanel")),
      color: document.getElementById("globalSphereColor")?.value?.toUpperCase() || null,
      opacity: document.getElementById("globalSphereOpacity")?.value || null,
    }));
    errs = drainErrors();
    if (
      errs.length ||
      afterReset.palette === "watercolor" ||
      afterReset.watercolorBtn ||
      afterReset.projection ||
      afterReset.inspect ||
      afterReset.measure ||
      afterReset.discovery
    ) {
      record("Reset Controls skips hidden options", "FAIL", errs[0] || JSON.stringify(afterReset));
    } else {
      record("Reset Controls skips hidden options", "PASS");
    }
    if (afterReset.color === "#FFD84D" && afterReset.opacity === "45") {
      record("Reset Controls restores yellow @ 45%", "PASS");
    } else {
      record(
        "Reset Controls restores yellow @ 45%",
        "FAIL",
        JSON.stringify({ color: afterReset.color, opacity: afterReset.opacity })
      );
    }
    const sample = await readBackgroundSample();
    if (isNearDarkNavy(sample.corner)) {
      record("Reset Controls keeps dark navy background", "PASS");
    } else {
      record(
        "Reset Controls keeps dark navy background",
        "FAIL",
        JSON.stringify(sample.corner)
      );
    }
  }

  // Grid overlay remains drawable (helper visibility) without console errors
  {
    drainErrors();
    const gridToggle = await page.$("#togGrid");
    if (!gridToggle) record("grid helper toggle present", "FAIL", "missing #togGrid");
    else {
      await gridToggle.click();
      await sleep(200);
      const errsGrid = drainErrors();
      if (errsGrid.length) record("grid helper remains usable", "FAIL", errsGrid[0]);
      else record("grid helper remains usable", "PASS");
      await gridToggle.click();
      await sleep(150);
    }
  }

  // Default anim speed
  const animVal = await page.$eval("#animSpeed", (el) => el.value);
  if (animVal === "0") record("default rotation speed 0", "PASS");
  else record("default rotation speed 0", "FAIL", `value=${animVal}`);

  await browser.close();

  console.log("\n=== BROWSER SUMMARY ===");
  const fail = results.filter((r) => r.status === "FAIL");
  const pass = results.filter((r) => r.status === "PASS");
  console.log(`PASS ${pass.length} | FAIL ${fail.length}`);
  if (fail.length) {
    console.log("\nFailures:");
    fail.forEach((f) => console.log(`- ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log("\nAll browser regression checks passed.");
}

main().catch((err) => {
  console.error("Browser harness fatal:", err);
  process.exit(1);
});
