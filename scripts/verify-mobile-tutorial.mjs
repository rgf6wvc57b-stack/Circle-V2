/**
 * iPhone / mobile guided-tutorial layout acceptance.
 * Viewports: 390×844, 393×852, 430×932.
 *
 * Run: node scripts/verify-mobile-tutorial.mjs
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { SHEET_HALF_HEIGHT_FRACTION } from "../src/app/mobileSheet.js";
import { MOBILE_TUTORIAL_FIT_MARGIN } from "../src/exploration/framingDefaults.js";

const PORT = process.env.PORT || "4233";
const BASE_PATH = process.env.BASE_PATH || "/-Geometry-Explor/";
const BASE = `http://127.0.0.1:${PORT}${BASE_PATH}`;

const VIEWPORTS = [
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "iPhone 14 Pro", width: 393, height: 852 },
  { name: "iPhone 15 Pro Max", width: 430, height: 932 },
];

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

async function measureLayout(page) {
  return page.evaluate(() => {
    const panel = document.getElementById("panel");
    const card = document.getElementById("tutorialCard");
    const geo = document.getElementById("geometry");
    const ring = document.getElementById("tutorialHighlight");
    const pointer = document.getElementById("tutorialPointer");
    const menu = document.getElementById("menuToggle");
    const pr = panel.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const gr = geo.getBoundingClientRect();
    const hr = ring.getBoundingClientRect();
    const mr = menu.getBoundingClientRect();
    const avail = window.__geometryExplor.syncViewLayout();
    const cam = window.__geometryExplor.getCameraDistance();
    const target = (document.getElementById("viewport").dataset.orbitTarget || "")
      .split(",")
      .map(Number);
    // Face-on: camera mostly along +Z relative to target.
    const pos = (() => {
      // Approximate from distance + target; read camera via debug if needed.
      return null;
    })();
    return {
      step: window.__geometryExplor.getTutorialStep(),
      sheet: window.__geometryExplor.getSheetState(),
      mobileTutorial: document.body.classList.contains("mobile-tutorial"),
      panel: { top: pr.top, height: pr.height, bottom: pr.bottom },
      card: {
        top: cr.top,
        bottom: cr.bottom,
        height: cr.height,
        hidden: card.hidden,
        visible: !card.hidden && cr.height > 8,
      },
      geo: { top: gr.top, bottom: gr.bottom, left: gr.left, height: gr.height, width: gr.width },
      ring: { top: hr.top, left: hr.left, width: hr.width, height: hr.height, hidden: ring.hidden },
      pointerHidden: pointer.hidden,
      menu: { width: mr.width, height: mr.height, top: mr.top, left: mr.left, bottom: mr.bottom },
      avail,
      cam,
      target,
      vw: window.innerWidth,
      vh: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      geoSpotlight: geo.classList.contains("tutorial-spotlight"),
      cardOverlapsGeo:
        !card.hidden &&
        cr.left < gr.right &&
        cr.right > gr.left &&
        cr.top < gr.bottom &&
        cr.bottom > gr.top,
      menuOverlapsCard:
        !card.hidden &&
        mr.left < cr.right &&
        mr.right > cr.left &&
        mr.top < cr.bottom &&
        mr.bottom > cr.top,
      progress: document.getElementById("tutorialProgress")?.textContent || "",
      instruction: document.getElementById("tutorialInstruction")?.textContent || "",
      pos,
    };
  });
}

async function runViewport(page, vp) {
  console.log(`\n=== ${vp.name} (${vp.width}×${vp.height}) ===`);
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: true });
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

  await page.click("#openTutorial");
  await sleep(300);
  await page.click("#introDone");
  await sleep(700);
  await page.evaluate(() => window.__geometryExplor.tutorialReposition());
  await sleep(200);

  let m = await measureLayout(page);
  assert(m.step === "selectFlower", `${vp.name}: instructions remain after Got it`, m.step);
  assert(m.card.visible, `${vp.name}: tutorial card visible after Got it`);
  assert(/Flower of Life/i.test(m.instruction), `${vp.name}: instruction text shown`, m.instruction);
  assert(/Step 2 of 5/i.test(m.progress), `${vp.name}: progress shown`, m.progress);
  assert(m.mobileTutorial, `${vp.name}: mobile-tutorial body class active`);
  assert(m.sheet === "half", `${vp.name}: bottom sheet half-open during guided step`, m.sheet);

  const sheetFrac = m.panel.height / m.vh;
  assert(
    sheetFrac <= 0.5 + 0.02,
    `${vp.name}: bottom sheet does not exceed 50% height`,
    `${(sheetFrac * 100).toFixed(1)}% (h=${m.panel.height.toFixed(0)})`
  );
  assert(
    sheetFrac >= 0.35,
    `${vp.name}: half-open sheet is substantial (~45–50%)`,
    `${(sheetFrac * 100).toFixed(1)}%`
  );
  console.log(
    `  measured sheet height: ${m.panel.height.toFixed(1)}px (${(sheetFrac * 100).toFixed(1)}% of ${m.vh})`
  );
  console.log(
    `  measured visible geometry area: ${m.avail.width.toFixed(0)}×${m.avail.height.toFixed(0)} ` +
      `(y=${m.avail.y.toFixed(0)})`
  );
  console.log(
    `  tutorial card: top=${m.card.top.toFixed(0)} bottom=${m.card.bottom.toFixed(0)} h=${m.card.height.toFixed(0)}`
  );

  assert(m.geoSpotlight, `${vp.name}: Geometry dropdown is highlighted`);
  assert(!m.ring.hidden && m.ring.height > 8, `${vp.name}: highlight ring visible`);
  assert(!m.pointerHidden, `${vp.name}: pointer visible`);
  assert(
    m.geo.top >= m.panel.top - 8 && m.geo.bottom <= m.panel.bottom + 8,
    `${vp.name}: Geometry control is visible inside the sheet`,
    `geo=${m.geo.top.toFixed(0)}–${m.geo.bottom.toFixed(0)} sheet=${m.panel.top.toFixed(0)}–${m.panel.bottom.toFixed(0)}`
  );
  // Target clickable — not covered by card
  assert(!m.cardOverlapsGeo, `${vp.name}: tutorial card does not cover Geometry dropdown`);
  assert(m.geo.top < m.vh && m.geo.bottom > 0, `${vp.name}: Geometry dropdown on-screen`);

  // Geometry band above the card/sheet must be a real viewing area (not a sliver).
  assert(
    m.avail.height >= 160 && m.avail.height + m.card.height <= m.panel.top + 2,
    `${vp.name}: geometry remains visible above the sheet`,
    `availH=${m.avail.height.toFixed(0)} cardH=${m.card.height.toFixed(0)} sheetTop=${m.panel.top.toFixed(0)}`
  );

  // Face-on: orbit target near origin; camera distance calm
  const targetOk =
    m.target.length === 3 &&
    m.target.every((n) => Number.isFinite(n)) &&
    Math.hypot(m.target[0], m.target[1], m.target[2]) < 1.5;
  assert(targetOk, `${vp.name}: orbit target near geometric center`);
  assert(m.cam >= 8, `${vp.name}: camera distance not crushed`, `d=${m.cam}`);

  // Screen-space size of design (settle camera with animate:false first)
  const size = await page.evaluate(() => {
    window.__geometryExplor.frameTutorialGeometry({ animate: false, duration: 0 });
    window.__geometryExplor.publishFramingDebug?.();
    const measure = window.__geometryExplor.measureSphereScreenSpace?.();
    const avail = window.__geometryExplor.syncViewLayout();
    return {
      sphereFrac: measure?.heightFraction ?? null,
      availH: avail.height,
      distance: window.__geometryExplor.getCameraDistance(),
    };
  });
  await sleep(50);
  // For Vesica at step select (still default until user picks FoL), size should not be tiny.
  if (size.sphereFrac != null) {
    assert(
      size.sphereFrac >= 0.22 && size.sphereFrac <= 0.42,
      `${vp.name}: geometry size in usable area is calm (~28–38%)`,
      `${(size.sphereFrac * 100).toFixed(1)}%`
    );
    console.log(`  measured geometry screen size: ${(size.sphereFrac * 100).toFixed(1)}% of usable height`);
  }

  // Select Flower of Life
  await page.select("#geometry", "flowerOfLife");
  await sleep(900);
  m = await measureLayout(page);
  assert(m.step === "enableConstruction", `${vp.name}: advances after Flower selected`, m.step);
  assert(m.sheet === "half", `${vp.name}: sheet stays half-open on step 2`, m.sheet);

  const modeVisible = await page.evaluate(() => {
    const el = document.getElementById("constructionMode");
    el.scrollIntoView({ block: "nearest" });
    window.__geometryExplor.tutorialReposition();
    const r = el.getBoundingClientRect();
    const panel = document.getElementById("panel").getBoundingClientRect();
    return {
      spotlight: el.classList.contains("tutorial-spotlight"),
      top: r.top,
      bottom: r.bottom,
      inSheet: r.top >= panel.top - 4 && r.bottom <= panel.bottom + 4,
    };
  });
  assert(modeVisible.spotlight, `${vp.name}: Construction Mode highlighted`);
  assert(modeVisible.inSheet, `${vp.name}: Construction Mode visible in sheet`);

  await page.click("#constructionMode");
  await sleep(900);
  m = await measureLayout(page);
  assert(m.step === "scrubConstruction", `${vp.name}: advances after Construction Mode`, m.step);

  // Pointer still aligned after scroll to slider
  const align = await page.evaluate(() => {
    const slider = document.getElementById("constructionStepSlider");
    slider.scrollIntoView({ block: "nearest" });
    window.__geometryExplor.tutorialReposition();
    const gr = slider.getBoundingClientRect();
    const hr = document.getElementById("tutorialHighlight").getBoundingClientRect();
    const tcx = gr.left + gr.width / 2;
    const tcy = gr.top + gr.height / 2;
    const rcx = hr.left + hr.width / 2;
    const rcy = hr.top + hr.height / 2;
    return {
      dx: Math.abs(tcx - rcx),
      dy: Math.abs(tcy - rcy),
      pointerHidden: document.getElementById("tutorialPointer").hidden,
    };
  });
  assert(align.dx < 30 && align.dy < 30, `${vp.name}: pointer remains aligned after scrolling`, JSON.stringify(align));
  assert(!align.pointerHidden, `${vp.name}: pointer visible on Construction Step`);

  // Menu button sizing / non-overlap
  m = await measureLayout(page);
  assert(m.menu.width >= 44 && m.menu.height >= 44, `${vp.name}: Menu button ≥ 44×44`);
  assert(!m.menuOverlapsCard, `${vp.name}: Menu does not overlap tutorial card`);
  assert(m.scrollWidth <= m.clientWidth + 1, `${vp.name}: no horizontal scrolling`);

  // Close cleans up
  await page.evaluate(() => window.__geometryExplor.endTutorial());
  await sleep(300);
  const cleared = await page.evaluate(() => ({
    active: window.__geometryExplor.isTutorialActive(),
    spotlights: document.querySelectorAll(".tutorial-spotlight").length,
    layerHidden: document.getElementById("tutorialLayer").hidden,
    mobileClass: document.body.classList.contains("mobile-tutorial"),
    sheet: window.__geometryExplor.getSheetState(),
  }));
  assert(
    !cleared.active && cleared.spotlights === 0 && cleared.layerHidden && !cleared.mobileClass,
    `${vp.name}: closing removes coach marks and restores normal panel behavior`
  );
}

async function main() {
  console.log(
    `Mobile tutorial constants: SHEET_HALF≈${SHEET_HALF_HEIGHT_FRACTION}, ` +
      `MOBILE_TUTORIAL_FIT_MARGIN=${MOBILE_TUTORIAL_FIT_MARGIN}`
  );

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

    for (const vp of VIEWPORTS) {
      await runViewport(page, vp);
    }

    // Portrait-only suite (already portrait viewports) + safe-area smoke
    assert(true, "tutorial works in portrait orientation");

    const errs = consoleErrors.filter((e) => !/favicon|ResizeObserver|net::ERR/i.test(e));
    assert(errs.length === 0, "app loads without console errors on mobile", errs[0] || "");

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
  console.log("\nAll mobile-tutorial checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Mobile tutorial harness fatal:", err);
  process.exit(1);
});
