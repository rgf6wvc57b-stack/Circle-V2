/**
 * Calm default camera framing — generous margin, minimum distance, expand-only.
 * Run: node scripts/verify-calm-framing.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { CameraController } from "../src/exploration/CameraController.js";
import {
  DEFAULT_FIT_MARGIN,
  FIT_DISTANCE_SCALE,
  MIN_FRAMING_SIZE,
  MIN_CAMERA_DISTANCE,
  VOLUMETRIC_FIT_MARGIN,
  VOLUMETRIC_FIT_DISTANCE_SCALE,
} from "../src/exploration/framingDefaults.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const mainSrc = readFileSync(join(root, "src/main.js"), "utf8");
const camSrc = readFileSync(join(root, "src/exploration/CameraController.js"), "utf8");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

function heightFraction(maxDim, margin = DEFAULT_FIT_MARGIN, scale = FIT_DISTANCE_SCALE) {
  const fitDim = Math.max(maxDim, MIN_FRAMING_SIZE);
  const padded = fitDim * (1 + margin * 2);
  // When height-limited, object fills maxDim/padded of the padded span; distance scale enlarges further.
  return maxDim / (padded * scale);
}

function makeController(aspect = 1) {
  const dom = {
    style: {},
    clientWidth: 800,
    clientHeight: 800,
    ownerDocument: { addEventListener() {}, removeEventListener() {} },
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    getRootNode() {
      return this;
    },
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 800,
      right: 800,
      bottom: 800,
    }),
  };
  return new CameraController({
    scene: new THREE.Scene(),
    domElement: dom,
    aspect,
  });
}

// --- Constants vs previous defaults ---
{
  assert(DEFAULT_FIT_MARGIN === 1.75, `new fit margin is 1.75 (got ${DEFAULT_FIT_MARGIN})`);
  assert(DEFAULT_FIT_MARGIN > 0.13, "new fit margin substantially larger than previous 0.13");
  assert(MIN_FRAMING_SIZE === 2.4, `min framing size is 2.4 (got ${MIN_FRAMING_SIZE})`);
  assert(MIN_FRAMING_SIZE > 0.5, "min framing size larger than previous 0.5 floor");
  assert(MIN_CAMERA_DISTANCE === 10, `min camera distance is 10 (got ${MIN_CAMERA_DISTANCE})`);
  assert(FIT_DISTANCE_SCALE >= 1.05, "fit distance scale at least previous 1.05");
}

// --- Vesica / single-sphere occupancy ~18–25% ---
{
  const vesicaStep1 = 2.4; // diameter at default radius 1.2
  const frac = heightFraction(vesicaStep1);
  assert(
    frac >= 0.18 && frac <= 0.25,
    `Vesica step-1 height fraction ≈18–25% (got ${(frac * 100).toFixed(1)}%)`
  );
  const tiny = heightFraction(0.4);
  assert(
    tiny < 0.2,
    `tiny geometry stays small via MIN_FRAMING_SIZE (frac=${(tiny * 100).toFixed(1)}%)`
  );
}

// --- Volumetric 3D Tree targets ~70–80% fill ---
{
  const treeExtent = 5.2;
  const frac =
    treeExtent /
    (treeExtent * (1 + VOLUMETRIC_FIT_MARGIN * 2) * VOLUMETRIC_FIT_DISTANCE_SCALE);
  assert(
    frac >= 0.75 && frac <= 0.88,
    `volumetric tree height fraction targets ~70–80% (got ${(frac * 100).toFixed(1)}%)`
  );
  assert(
    VOLUMETRIC_FIT_MARGIN < DEFAULT_FIT_MARGIN,
    "volumetric margin is tighter than calm default"
  );
  assert(
    VOLUMETRIC_FIT_DISTANCE_SCALE <= FIT_DISTANCE_SCALE,
    "volumetric distance scale is not looser than default"
  );
}

// --- frameBox distance / target ---
{
  const ctrl = makeController(700 / 800);
  ctrl.setAvailableViewRect({
    fullWidth: 1000,
    fullHeight: 800,
    x: 0,
    y: 0,
    width: 700,
    height: 800,
  });
  // Single sphere ≈ Vesica step 1
  const box = new THREE.Box3(
    new THREE.Vector3(-1.2, -1.2, -1.2),
    new THREE.Vector3(1.2, 1.2, 1.2)
  );
  const center = box.getCenter(new THREE.Vector3());
  ctrl.frameBox(box, { animate: false, duration: 0 });
  const dist = ctrl.camera.position.distanceTo(ctrl.controls.target);
  assert(dist >= MIN_CAMERA_DISTANCE, `framed distance ≥ min (${dist.toFixed(2)})`);
  assert(
    ctrl.controls.target.distanceTo(center) < 1e-6,
    "orbit target remains geometric center"
  );
  assert(dist > 8, `calm framing is zoomed out (dist=${dist.toFixed(2)}, was ~3.4 at margin 0.13)`);

  // expandOnly must not zoom in when already farther out
  const farPos = ctrl.camera.position.clone();
  const small = new THREE.Box3(
    new THREE.Vector3(-0.5, -0.5, -0.5),
    new THREE.Vector3(0.5, 0.5, 0.5)
  );
  ctrl.frameBox(small, { animate: false, duration: 0, expandOnly: true });
  const distAfter = ctrl.camera.position.distanceTo(ctrl.controls.target);
  assert(
    distAfter >= dist * 0.98,
    `expandOnly does not zoom in (before=${dist.toFixed(2)}, after=${distAfter.toFixed(2)})`
  );
  assert(
    farPos.distanceTo(ctrl.camera.position) < 0.05 || distAfter >= dist,
    "expandOnly leaves camera calm when content already fits"
  );
}

// --- main.js policy wiring ---
{
  assert(
    /DEFAULT_FIT_MARGIN/.test(mainSrc) &&
      (/margin:\s*DEFAULT_FIT_MARGIN/.test(mainSrc) || /fitMargin/.test(mainSrc)),
    "frameActiveConstruction uses DEFAULT_FIT_MARGIN"
  );
  assert(!/margin:\s*0\.13/.test(mainSrc), "previous margin 0.13 removed from main.js");
  assert(/expandOnly:\s*true/.test(mainSrc), "construction/evolution use expandOnly framing");

  const renderHandler = mainSrc.match(
    /querySelectorAll\("\[data-render-layer\]"\)\.forEach\(\(el\) => \{\n    el\.addEventListener\("change"[\s\S]*?\n  \}\);/
  )?.[0];
  assert(renderHandler, "renderer layer change handler found");
  assert(
    !/frameActiveConstruction/.test(renderHandler),
    "changing renderer does not alter camera framing"
  );

  assert(
    /btnStepForward[\s\S]*?expandOnly:\s*true/.test(mainSrc),
    "construction Step Forward uses expandOnly"
  );
  assert(
    /btnStepBack[\s\S]*?expandOnly:\s*true/.test(mainSrc),
    "construction Step Back uses expandOnly"
  );
  assert(
    /Evolution: keep calm framing|expandOnly:\s*true/.test(mainSrc),
    "evolution framing is expand-only"
  );
  assert(/DEFAULT_FIT_MARGIN/.test(camSrc), "CameraController imports framing defaults");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll calm-framing checks passed.");
console.log(
  `Previous fit margin: 0.13 → new: ${DEFAULT_FIT_MARGIN}; ` +
    `previous min size floor: 0.5 → new: ${MIN_FRAMING_SIZE}; ` +
    `previous min camera distance: (FOV-only, ~3.4 for Vesica) → new floor: ${MIN_CAMERA_DISTANCE}`
);
