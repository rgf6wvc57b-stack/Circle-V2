/**
 * Confirm the original dark theme (pre-PR #22 / before 849200b) is restored.
 * Source values taken from git show 849200b^ (parent of white-background commit).
 *
 * Run: node scripts/verify-dark-background.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const mainSrc = readFileSync(join(root, "src/main.js"), "utf8");
const css = readFileSync(join(root, "src/styles.css"), "utf8");
const overlaysSrc = readFileSync(join(root, "src/exploration/DisplayOverlays.js"), "utf8");
const rendererSrc = readFileSync(join(root, "src/engine/renderer/GeometryRenderer.js"), "utf8");
const focusSrc = readFileSync(join(root, "src/exploration/FocusSystem.js"), "utf8");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

// --- Original values from 849200b^ ---
{
  assert(
    /scene\.fog\s*=\s*new THREE\.FogExp2\(\s*0x0e1a24\s*,\s*0\.035\s*\)/.test(mainSrc),
    "scene fog restored: FogExp2(0x0e1a24, 0.035)"
  );
  assert(
    /scene\.background\s*=\s*new THREE\.Color\(\s*0x0e1a24\s*\)/.test(mainSrc),
    "scene.background restored: 0x0e1a24"
  );
  assert(!/SCENE_BACKGROUND|sceneTheme\.js|applySceneBackground/.test(mainSrc), "white-theme helpers removed from main.js");
  assert(!existsSync(join(root, "src/app/sceneTheme.js")), "src/app/sceneTheme.js removed");
  assert(
    !existsSync(join(root, "scripts/verify-white-background.mjs")),
    "verify-white-background.mjs removed"
  );

  assert(
    /HemisphereLight\(\s*0xb8e4ff\s*,\s*0x1a2030\s*,\s*1\.1\s*\)/.test(mainSrc),
    "original hemisphere light restored"
  );
  assert(
    /toneMappingExposure\s*=\s*1\.15/.test(mainSrc),
    "original toneMappingExposure 1.15 restored"
  );
  assert(/color:\s*0x15202a/.test(mainSrc), "original floor color 0x15202a restored");
  assert(
    /GridHelper\(\s*12\s*,\s*24\s*,\s*0x3ecfbf\s*,\s*0x243442\s*\)/.test(mainSrc),
    "original world grid colors 0x3ecfbf / 0x243442 restored"
  );
  assert(
    /worldGrid\.material\.opacity\s*=\s*0\.35/.test(mainSrc),
    "original world grid opacity 0.35 restored"
  );
}

// --- CSS page background / labels ---
{
  assert(
    /linear-gradient\(160deg,\s*#0b141c\s*0%,\s*#132433\s*45%,\s*#0e1a24\s*100%\)/.test(css),
    "original CSS navy gradient page background restored"
  );
  assert(!/--scene-bg:\s*#ffffff/i.test(css), "CSS --scene-bg white token removed");
  assert(!/--grid-major:\s*#c9ced6/i.test(css), "white-theme grid CSS tokens removed");
  assert(
    /\.geo-label[\s\S]*?background:\s*rgba\(8,\s*16,\s*24,\s*0\.75\)/.test(css),
    "geo-label dark chip background restored"
  );
  assert(
    /\.geo-label[\s\S]*?color:\s*#e8f2f7/.test(css),
    "geo-label light text restored"
  );
  assert(
    /--panel-border:\s*rgba\(180,\s*220,\s*240,\s*0\.18\)/.test(css),
    "original panel-border restored"
  );
}

// --- Overlay / renderer / focus helpers ---
{
  assert(/0x3ecfbf,\s*0x2a3d4c/.test(overlaysSrc), "DisplayOverlays grid uses original teal/navy");
  assert(/color:\s*0x8ecae6/.test(overlaysSrc), "radius helper line 0x8ecae6 restored");
  assert(/color:\s*0xa8dadc/.test(overlaysSrc), "circle outline helper 0xa8dadc restored");
  assert(/color:\s*0x1a3344/.test(overlaysSrc), "construction plane overlay 0x1a3344 restored");
  assert(!/sceneTheme|HELPER_LINE|GRID_MAJOR/.test(overlaysSrc), "DisplayOverlays white-theme imports gone");

  assert(
    /GridHelper\([^)]*0x3ecfbf,\s*0x243442/.test(rendererSrc),
    "GeometryRenderer construction grid original colors restored"
  );
  assert(/color:\s*0x152836/.test(rendererSrc), "construction plane mesh 0x152836 restored");
  assert(!/sceneTheme|GRID_MAJOR/.test(rendererSrc), "GeometryRenderer white-theme imports gone");

  assert(
    /outlineMat[\s\S]*?color:\s*0xffffff/.test(focusSrc),
    "FocusSystem outline restored to 0xffffff"
  );
  assert(!/0x6b7280/.test(focusSrc), "white-theme focus outline removed");
}

// --- Runtime Color check ---
{
  const c = new THREE.Color(0x0e1a24);
  assert(c.getHex() === 0x0e1a24, "THREE.Color(0x0e1a24) matches original navy");
  assert(c.getHexString().toLowerCase() === "0e1a24", "hex string 0e1a24");
}

// --- White values must not remain as scene/page defaults ---
{
  assert(!/scene\.background\s*=\s*new THREE\.Color\(\s*0xffffff\s*\)/.test(mainSrc), "no white scene.background");
  assert(!/setClearColor\(\s*0xffffff/.test(mainSrc) && !/setClearColor\(\s*SCENE_BACKGROUND/.test(mainSrc), "no white clear color");
  assert(!/background:\s*#ffffff/i.test(css) && !/background:\s*var\(--scene-bg\)/.test(css), "no solid white page background");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll dark-background restoration checks passed.");
console.log("Source: git tree at 849200b^ (parent of white-background commit 849200b).");
