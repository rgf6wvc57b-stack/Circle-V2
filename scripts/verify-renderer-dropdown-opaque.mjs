/**
 * Renderer multi-select dropdown must be fully opaque and readable.
 * Run: node scripts/verify-renderer-dropdown-opaque.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

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

// --- Static CSS / JS ---
{
  const css = readFileSync(join(root, "src/styles.css"), "utf8");
  const mainSrc = readFileSync(join(root, "src/main.js"), "utf8");
  const popCss =
    css.match(/\.renderer-popover\s*\{[\s\S]*?\n\}/)?.[0] ||
    css.match(/\.renderer-popover \{[\s\S]*?\n\}/)?.[0] ||
    "";
  assert(popCss.length > 0, "renderer-popover rule found");
  assert(
    /background(?:-color)?:\s*rgb\(\s*18\s*,\s*28\s*,\s*38\s*\)/.test(popCss) ||
      /--renderer-popover-bg:\s*rgb\(\s*18\s*,\s*28\s*,\s*38\s*\)/.test(popCss),
    "popover uses solid panel-matching RGB background"
  );
  assert(!/var\(--surface\)/.test(popCss), "popover no longer uses translucent --surface");
  assert(!/backdrop-filter:\s*blur/.test(popCss), "popover does not use backdrop blur");
  assert(/opacity:\s*1/.test(popCss), "popover declares opacity: 1");
  assert(/z-index:\s*100/.test(popCss), "popover z-index is 100");
  assert(/box-shadow:/.test(popCss), "popover has a shadow");
  assert(/border:\s*1px solid/.test(popCss), "popover has a clear border");
  assert(
    /\.renderer-popover--up/.test(css),
    "popover supports upward open class for overflow"
  );
  assert(
    /:has\(input:checked\)/.test(css),
    "selected checkbox rows have a distinct style"
  );
  assert(/positionRendererPopover/.test(mainSrc), "overflow positioning helper exists");
  assert(
    /Escape/.test(mainSrc) && /setRendererPopoverOpen\(false\)/.test(mainSrc),
    "Escape closes the dropdown"
  );
  assert(
    /pointerdown[\s\S]*setRendererPopoverOpen\(false\)/.test(mainSrc),
    "outside click closes the dropdown"
  );
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

function parseAlpha(bg) {
  const m = String(bg || "").match(
    /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/i
  );
  if (!m) return null;
  return Number(m[4] ?? 1);
}

async function browserChecks() {
  const PORT = process.env.PORT || "4285";
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

    const panelTopBefore = await page.evaluate(() => {
      const panel = document.getElementById("panel");
      return panel?.scrollHeight ?? 0;
    });

    await page.evaluate(() => window.__geometryExplor.setRendererPopoverOpen(true));
    await sleep(120);

    const metrics = await page.evaluate(() => window.__geometryExplor.getRendererPopoverMetrics());
    assert(metrics, "popover metrics available when open");
    assert(
      metrics.opacity === 1 && metrics.backgroundAlpha === 1,
      "dropdown background opacity equals 1",
      `opacity=${metrics.opacity} alpha=${metrics.backgroundAlpha} bg=${metrics.backgroundColor}`
    );
    assert(metrics.zIndex >= 100, "dropdown z-index is above nearby controls", String(metrics.zIndex));
    assert(/rgb\(18,\s*28,\s*38\)/.test(metrics.backgroundColor), "dropdown uses solid dark panel color", metrics.backgroundColor);
    assert(Boolean(metrics.boxShadow) && metrics.boxShadow !== "none", "dropdown has a shadow");
    assert(
      metrics.labels.length >= 5 &&
        metrics.labels.every((l) => l.opacity === 1 && l.text.length > 0),
      "all renderer option labels are readable",
      JSON.stringify(metrics.labels.map((l) => l.text))
    );
    const expected = [
      "Solid Spheres",
      "Circle Outlines",
      "Point Markers",
      "Connection Lines",
      "All Layers",
    ];
    assert(
      expected.every((label) => metrics.labels.some((l) => l.text === label)),
      "expected renderer option labels present"
    );

    const selected = metrics.rows.filter((r) => r.checked);
    const unselected = metrics.rows.filter((r) => !r.checked);
    assert(selected.length >= 1 && unselected.length >= 1, "has selected and unselected rows");
    assert(
      selected[0].backgroundColor !== unselected[0].backgroundColor ||
        selected[0].borderColor !== unselected[0].borderColor,
      "selected and unselected states are visually distinct",
      `${selected[0].backgroundColor} / ${unselected[0].backgroundColor}`
    );
    assert(
      metrics.rows.every((r) => r.minHeight >= 44),
      "option rows meet ~44px touch height"
    );

    // Probe that nothing behind shows through: sample a pixel in the popover
    // and ensure it is the opaque panel dark (not a bright/translucent blend).
    const occlusion = await page.evaluate(async () => {
      const pop = document.getElementById("rendererPopover");
      const rect = pop.getBoundingClientRect();
      const canvas = document.createElement("canvas");
      // Use elementFromPoint on a point inside the popover — must be the popover itself.
      const x = rect.left + rect.width / 2;
      const y = rect.top + 24;
      const el = document.elementFromPoint(x, y);
      const inside =
        el &&
        (el.id === "rendererPopover" ||
          el.closest?.("#rendererPopover") != null);
      // Compare computed backgrounds of a control that sits under typical open area.
      const radius = document.getElementById("radius");
      const under = radius ? getComputedStyle(radius).backgroundColor : null;
      const popBg = getComputedStyle(pop).backgroundColor;
      return {
        inside,
        popBg,
        under,
        popAlpha: (() => {
          const m = popBg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/i);
          return m ? Number(m[4] ?? 1) : null;
        })(),
      };
    });
    assert(occlusion.inside, "dropdown covers controls behind it (hit-test)");
    assert(occlusion.popAlpha === 1, "text behind the dropdown is not visually visible through it", occlusion.popBg);

    // Geometry opacity must not affect dropdown opacity
    await page.evaluate(() => {
      window.__geometryExplor.setRenderLayerStyle("spheres", { opacity: 0.1 });
    });
    await sleep(100);
    const afterGeo = await page.evaluate(() => window.__geometryExplor.getRendererPopoverMetrics());
    assert(
      afterGeo.opacity === 1 && afterGeo.backgroundAlpha === 1,
      "geometry opacity changes do not affect dropdown opacity"
    );

    // Opening must not shift panel layout height meaningfully
    const panelTopAfter = await page.evaluate(() => document.getElementById("panel")?.scrollHeight ?? 0);
    assert(
      Math.abs(panelTopAfter - panelTopBefore) < 8,
      "opening the dropdown must not shift the panel layout",
      `${panelTopBefore} → ${panelTopAfter}`
    );

    // Escape closes
    await page.keyboard.press("Escape");
    await sleep(80);
    assert(
      !(await page.evaluate(() => window.__geometryExplor.isRendererPopoverOpen())),
      "Escape closes dropdown"
    );

    // Outside click closes
    await page.evaluate(() => window.__geometryExplor.setRendererPopoverOpen(true));
    await sleep(80);
    await page.mouse.click(20, 20);
    await sleep(80);
    assert(
      !(await page.evaluate(() => window.__geometryExplor.isRendererPopoverOpen())),
      "outside click closes dropdown"
    );

    const viewports = [
      [390, 844],
      [393, 852],
      [430, 932],
      [1024, 768], // iPad landscape
    ];
    for (const [w, h] of viewports) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: w >= 1000 ? 2 : 2 });
      await sleep(150);
      await page.evaluate(() => window.__geometryExplor.setRendererPopoverOpen(true));
      await sleep(120);
      const m = await page.evaluate(() => window.__geometryExplor.getRendererPopoverMetrics());
      const layout = await page.evaluate(() => ({
        noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
        offscreen:
          (() => {
            const pop = document.getElementById("rendererPopover");
            const r = pop.getBoundingClientRect();
            return r.bottom > window.innerHeight + 2 || r.top < -2;
          })(),
      }));
      assert(m && m.backgroundAlpha === 1 && m.opacity === 1, `opaque at ${w}×${h}`);
      assert(m.withinPanel, `dropdown stays inside panel bounds at ${w}×${h}`);
      assert(!layout.offscreen, `dropdown not off-screen at ${w}×${h}`);
      assert(layout.noHScroll, `no horizontal scrolling at ${w}×${h}`);
      await page.evaluate(() => window.__geometryExplor.setRendererPopoverOpen(false));
    }

    const errs = consoleErrors.filter((e) => !/favicon|ResizeObserver|net::ERR/i.test(e));
    assert(errs.length === 0, "no console errors occur", errs[0] || "");

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
console.log("\nAll renderer-dropdown-opaque checks passed.");
process.exit(0);
