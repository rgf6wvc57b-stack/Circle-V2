/**
 * UI cleanup: confirm removed sections/controls are absent from the panel,
 * Watercolor is not exposed, and defaults/Reset do not select hidden options.
 *
 * Run: node scripts/verify-hidden-ui.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  listUiRenderModeOptions,
  isUiRenderMode,
} from "../src/engine/renderer/uiRenderModes.js";
import {
  DEFAULT_SPHERE_COLOR,
  DEFAULT_SPHERE_OPACITY,
  OPACITY_PRESETS,
  createSphereColorState,
  resetSphereColorState,
} from "../src/app/sphereColorState.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const mainSrc = readFileSync(join(root, "src/main.js"), "utf8");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

function visiblePanelText() {
  // Strip script/style; approximate visible control-panel markup.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
}

const panel = visiblePanelText();

// --- Removed sections / labels ---
{
  assert(!/Geometric overlays/i.test(panel), "Geometric overlays is not visible");
  assert(!/id="geometricFlagsGroup"/.test(html), "geometricFlagsGroup removed from HTML");
  assert(!/id="geoShowTree"/.test(html), "geoShowTree control removed from HTML");

  assert(!/id="cameraProjection"/.test(html), "Camera projection control removed from HTML");
  assert(!/>\s*Projection\s*</.test(panel), "Projection label not in the panel");
  assert(!/Orthographic/.test(panel), "Orthographic option not in the panel");

  assert(!/Discovery Explorer/i.test(panel), "Discovery Explorer is not visible");
  assert(!/id="discoveriesPanel"/.test(html), "discoveriesPanel removed from HTML");

  assert(!/<h2>\s*Exploration\s*<\/h2>/i.test(panel), "Exploration section is not visible");
  assert(!/id="measurementMode"/.test(html), "measurementMode control removed from HTML");
  assert(!/id="inspectMode"/.test(html), "inspectMode control removed from HTML");
  assert(!/id="showGraph"/.test(html), "showGraph control removed from HTML");
}

// --- Watercolor absent from visible UI ---
{
  assert(!/Watercolor/i.test(panel), "Watercolor label is not visible anywhere in the UI");
  assert(!/value="watercolor"/.test(html), "watercolor option value absent from HTML");
  assert(
    !/data-opacity-preset="watercolor"/.test(html),
    "watercolor opacity preset buttons removed"
  );
  const paletteMatch = html.match(/<select id="palette">([\s\S]*?)<\/select>/);
  assert(paletteMatch, "palette select remains for other accents");
  assert(!/watercolor/i.test(paletteMatch[1]), "palette dropdown has no Watercolor option");
  assert(
    /value="ocean"[^>]*selected|selected[^>]*value="ocean"/.test(paletteMatch[1]) ||
      /value="ocean" selected/.test(paletteMatch[1]),
    "palette default selection is Ocean (not Watercolor)"
  );

  const renderModes = listUiRenderModeOptions().map((m) => m.id);
  assert(!renderModes.includes("watercolor"), "watercolor is not a Render dropdown mode");
  assert(
    !listUiRenderModeOptions().some((m) => /watercolor/i.test(m.label)),
    "watercolor label absent from Render dropdown options"
  );
}

// --- Defaults / Reset do not select hidden options ---
{
  assert(/palette:\s*"ocean"/.test(mainSrc), "startup palette default is ocean");
  assert(
    /ui\.palette\s*=\s*"ocean"/.test(mainSrc),
    "Reset Controls sets palette to ocean"
  );
  assert(
    !/palette\.value\s*=\s*"watercolor"/.test(mainSrc),
    "Reset Controls does not select watercolor"
  );
  assert(
    /measurementMode\.setEnabled\(false\)/.test(mainSrc) &&
      /discoveryEngine\.setInspectMode\(false\)/.test(mainSrc) &&
      /discoveryEngine\.setShowGraph\(false\)/.test(mainSrc),
    "Reset Controls clears hidden exploration/discovery modes"
  );
  assert(
    /setProjection\(\s*"perspective"/.test(mainSrc),
    "Reset Controls keeps perspective (no hidden orthographic selection)"
  );
  assert(
    /flagsGroup\.hidden\s*=\s*true/.test(mainSrc) || !/geometricFlagsGroup/.test(mainSrc),
    "Geometric overlays group stays hidden if present"
  );

  // Optional chaining / null-safe bindings for removed controls
  assert(
    /getElementById\("cameraProjection"\)\?\.addEventListener/.test(mainSrc),
    "startup does not require cameraProjection in the DOM"
  );
  assert(
    /getElementById\("measurementMode"\)\?\.addEventListener/.test(mainSrc),
    "startup does not require measurementMode in the DOM"
  );
  assert(
    /getElementById\("inspectMode"\)\?\.addEventListener/.test(mainSrc),
    "startup does not require inspectMode in the DOM"
  );
  assert(
    /getElementById\("showGraph"\)\?\.addEventListener/.test(mainSrc),
    "startup does not require showGraph in the DOM"
  );
}

// --- Remaining visible sections still present ---
{
  for (const needle of [
    'id="geometry"',
    'id="rendererMultiselect"',
    'id="sphereColorsSection"',
    'id="viewPresets"',
    'id="mathematicsPanel"',
    'id="inspectorPanel"',
    ">Display<",
    'id="resetControls"',
  ]) {
    assert(panel.includes(needle) || html.includes(needle), `remaining control present: ${needle}`);
  }
  assert(/Solid Spheres|id="rendererMultiselect"/.test(html), "Renderer multi-select remains");
  assert(
    html.includes('data-opacity-preset="solid"') &&
      html.includes('data-opacity-preset="transparent"'),
    "Solid and Transparent opacity presets remain"
  );
}

// --- Sphere color defaults unchanged ---
{
  assert(DEFAULT_SPHERE_COLOR.toUpperCase() === "#FFD84D", "default yellow color unchanged");
  assert(DEFAULT_SPHERE_OPACITY === 0.45, "default 45% opacity unchanged");
  const state = createSphereColorState();
  resetSphereColorState(state);
  assert(state.global.hex.toUpperCase() === "#FFD84D", "reset keeps yellow");
  assert(state.global.opacity === 0.45, "reset keeps 45% opacity");
  assert(OPACITY_PRESETS.transparent === 0.45, "Transparent preset still 45%");
  // Underlying watercolor preset may remain in code; must not appear in UI (checked above).
  assert(isUiRenderMode("spheres"), "spheres remains a UI render mode");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll hidden-UI cleanup checks passed.");
