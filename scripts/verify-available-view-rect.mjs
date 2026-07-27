/**
 * Available-view-rect framing helpers.
 * Run: node scripts/verify-available-view-rect.mjs
 */
import assert from "node:assert/strict";
import {
  computeAvailableViewRect,
  isBottomSheetPanel,
} from "../src/exploration/availableViewRect.js";
import { CameraController } from "../src/exploration/CameraController.js";
import * as THREE from "three";

let failed = 0;
function check(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

// Right-side panel (desktop / iPad)
{
  const panelRect = {
    left: 700,
    right: 1020,
    top: 16,
    bottom: 700,
    width: 320,
    height: 684,
  };
  check(
    isBottomSheetPanel(panelRect, 1024, 768) === false,
    "right-side panel is not classified as bottom sheet"
  );
  const fakePanel = {
    getBoundingClientRect: () => panelRect,
  };
  const rect = computeAvailableViewRect({
    fullWidth: 1024,
    fullHeight: 768,
    panelEl: fakePanel,
    panelOpen: true,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  check(rect.layout === "right", "desktop layout is right");
  check(rect.x === 0 && rect.y === 0, "right-panel available rect starts at origin");
  check(rect.width === 700, `available width is left of panel (got ${rect.width})`);
  check(rect.height === 768, `available height is full (got ${rect.height})`);
}

// Bottom sheet (iPhone)
{
  const panelRect = {
    left: 0,
    right: 390,
    top: 420,
    bottom: 844,
    width: 390,
    height: 424,
  };
  check(
    isBottomSheetPanel(panelRect, 390, 844) === true,
    "bottom sheet panel is classified correctly"
  );
  const fakePanel = { getBoundingClientRect: () => panelRect };
  const rect = computeAvailableViewRect({
    fullWidth: 390,
    fullHeight: 844,
    panelEl: fakePanel,
    panelOpen: true,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  check(rect.layout === "bottom", "phone layout is bottom");
  check(rect.width === 390, "bottom-sheet available width is full");
  check(rect.height === 420, `available height is above sheet (got ${rect.height})`);
}

// Panel closed → full viewport
{
  const rect = computeAvailableViewRect({
    fullWidth: 1024,
    fullHeight: 768,
    panelEl: { getBoundingClientRect: () => ({ width: 320, height: 600, left: 700, top: 16, right: 1020, bottom: 616 }) },
    panelOpen: false,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  check(rect.layout === "full", "closed panel uses full layout");
  check(rect.width === 1024 && rect.height === 768, "closed panel available rect is full viewport");
}

// CameraController: view offset shifts toward available center; orbit target unchanged
{
  const dom = {
    style: {},
    clientWidth: 1000,
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
      width: 1000,
      height: 800,
      right: 1000,
      bottom: 800,
    }),
  };
  const ctrl = new CameraController({
    scene: new THREE.Scene(),
    domElement: dom,
    aspect: 1000 / 800,
  });
  const targetBefore = ctrl.controls.target.clone();
  ctrl.setAvailableViewRect({
    fullWidth: 1000,
    fullHeight: 800,
    x: 0,
    y: 0,
    width: 700,
    height: 800,
  });
  check(Math.abs(ctrl._fitAspect - 700 / 800) < 1e-9, "fit aspect uses available rect");
  check(ctrl.perspective.view?.enabled === true, "perspective view offset enabled for right panel");
  check(
    ctrl.controls.target.distanceTo(targetBefore) < 1e-9,
    "orbit target unchanged when applying available rect"
  );

  const box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  ctrl.frameBox(box, { animate: false, duration: 0 });
  check(
    ctrl.controls.target.distanceTo(box.getCenter(new THREE.Vector3())) < 1e-6,
    "frameBox keeps orbit target on geometric center"
  );

  ctrl.clearAvailableViewRect(1000, 800);
  check(!ctrl.perspective.view?.enabled, "clearAvailableViewRect disables view offset");
}

// Safe-area insets shrink the rect
{
  const rect = computeAvailableViewRect({
    fullWidth: 400,
    fullHeight: 800,
    panelOpen: false,
    safeArea: { top: 40, right: 10, bottom: 20, left: 10 },
  });
  check(rect.x === 10 && rect.y === 40, "safe-area offsets origin");
  check(rect.width === 380 && rect.height === 740, "safe-area reduces size");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll available-view-rect checks passed.");
assert.ok(failed === 0);
