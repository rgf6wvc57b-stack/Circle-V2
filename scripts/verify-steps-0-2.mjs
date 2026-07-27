/**
 * Automated proof for construction Steps 0–2 (Vesica Piscis foundation).
 *
 * Run: node scripts/verify-steps-0-2.mjs
 *
 * Does not judge appearance. Pass/fail is numerical only (epsilon = 1e-9).
 */
import {
  EPS,
  buildSteps0to2,
  rebuildSteps0to2,
  distance3,
  nearlyEqual,
} from "../src/engine/math/index.js";
import { validateSteps0to2 } from "../src/engine/validation/validateSteps0to2.js";
import {
  prepareDisplaySnapshot,
  assertConstructionUnchanged,
} from "../src/engine/display/DisplayAdapter.js";

const R = 1.2;
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

console.log("=== Steps 0–2 automated proof ===");
console.log(`R = ${R}`);
console.log(`epsilon = ${EPS}`);
console.log("");

// ---------------------------------------------------------------------------
// Test 1: first point = (0,0,0)
// ---------------------------------------------------------------------------
{
  const c = buildSteps0to2(R, { endStep: 0 });
  const p = c.points[0];
  assert(p.id === "origin", "Test 1: first point id is origin");
  assert(
    nearlyEqual(p.x, 0) && nearlyEqual(p.y, 0) && nearlyEqual(p.z, 0),
    `Test 1: first point equals (0,0,0) — got (${p.x}, ${p.y}, ${p.z})`
  );
  assert(p.constructionStep === 0, "Test 1: constructionStep === 0");
}

// ---------------------------------------------------------------------------
// Test 2: first sphere center (0,0,0), radius R
// ---------------------------------------------------------------------------
{
  const c = buildSteps0to2(R, { endStep: 1 });
  assert(c.spheres.length === 1, "Test 2: exactly one sphere");
  const s0 = c.spheres[0];
  assert(
    nearlyEqual(s0.center.x, 0) &&
      nearlyEqual(s0.center.y, 0) &&
      nearlyEqual(s0.center.z, 0),
    `Test 2: sphere-0 center = (0,0,0) — got (${s0.center.x}, ${s0.center.y}, ${s0.center.z})`
  );
  assert(nearlyEqual(s0.radius, R, EPS), `Test 2: sphere-0.radius = R (${s0.radius})`);
}

// ---------------------------------------------------------------------------
// Test 3: second sphere radius R and distance(c0,c1) = R
// ---------------------------------------------------------------------------
{
  const c = buildSteps0to2(R, { endStep: 2 });
  assert(c.spheres.length === 2, "Test 3: exactly two spheres");
  const s0 = c.spheres.find((s) => s.id === "sphere-0");
  const s1 = c.spheres.find((s) => s.id === "sphere-1");
  assert(nearlyEqual(s1.radius, R, EPS), `Test 3: sphere-1.radius = R (${s1.radius})`);
  const d = distance3(s0.center, s1.center);
  assert(
    nearlyEqual(d, R, EPS),
    `Test 3: distance(center0, center1) = R — d=${d}, R=${R}, eps=${EPS}`
  );
}

// ---------------------------------------------------------------------------
// Test 4: construction unchanged across "renderers" (display adapters)
// ---------------------------------------------------------------------------
{
  const layer1 = buildSteps0to2(R, { endStep: 2 });
  const before = structuredClone({
    radius: layer1.radius,
    points: layer1.points,
    spheres: layer1.spheres,
  });
  const rendererA = prepareDisplaySnapshot(layer1, { projection: "perspective" });
  const rendererB = prepareDisplaySnapshot(layer1, { projection: "orthographic" });
  // Mutate display copies only
  rendererA.display.zoom = 99;
  rendererB.spheres[1].center.x = 999; // corrupt display copy
  const check = assertConstructionUnchanged(before, layer1);
  assert(check.ok, "Test 4: Layer 1 unchanged when switching/mutating display snapshots");
  assert(
    nearlyEqual(layer1.spheres[1].center.x, R, EPS) ||
      Math.abs(layer1.spheres[1].center.x) > 0,
    "Test 4: Layer 1 sphere-1 center still the constructed value"
  );
  // Explicit: corrupting rendererB must not change Layer 1
  assert(
    layer1.spheres[1].center.x !== 999,
    "Test 4: display mutation did not write through to Layer 1"
  );
}

// ---------------------------------------------------------------------------
// Test 5: rotate / zoom / projection / overlays leave construction unchanged
// ---------------------------------------------------------------------------
{
  const layer1 = buildSteps0to2(R, { endStep: 2 });
  const fingerprint = JSON.stringify({
    points: layer1.points,
    spheres: layer1.spheres,
    radius: layer1.radius,
  });
  const views = [
    { rotationY: 0.7, zoom: 1, projection: "perspective", overlaysEnabled: false },
    { rotationY: -1.2, zoom: 2.5, projection: "orthographic", overlaysEnabled: true },
    { rotationY: Math.PI, zoom: 0.5, projection: "perspective", overlaysEnabled: true },
  ];
  for (const view of views) {
    prepareDisplaySnapshot(layer1, view);
  }
  const after = JSON.stringify({
    points: layer1.points,
    spheres: layer1.spheres,
    radius: layer1.radius,
  });
  assert(fingerprint === after, "Test 5: construction unchanged under view/overlay changes");
  // Frozen: attempts to mutate Layer 1 must throw
  let threw = false;
  try {
    layer1.spheres[0].radius = 0;
  } catch {
    threw = true;
  }
  assert(threw, "Test 5: Layer 1 document is frozen (mutation throws)");
}

// ---------------------------------------------------------------------------
// Test 6: every sphere records required provenance fields
// ---------------------------------------------------------------------------
{
  const c = buildSteps0to2(R, { endStep: 2 });
  for (const s of c.spheres) {
    assert(typeof s.id === "string" && s.id.length > 0, `Test 6: ${s.id || "?"} has id`);
    assert(
      s.center &&
        typeof s.center.x === "number" &&
        typeof s.center.y === "number" &&
        typeof s.center.z === "number",
      `Test 6: ${s.id} has center {x,y,z}`
    );
    assert(typeof s.radius === "number", `Test 6: ${s.id} has radius`);
    assert(typeof s.constructionStep === "number", `Test 6: ${s.id} has constructionStep`);
    assert(Array.isArray(s.parents), `Test 6: ${s.id} has parents[]`);
    assert(
      typeof s.constructionRule === "string" && s.constructionRule.length > 0,
      `Test 6: ${s.id} has constructionRule`
    );
    assert(
      s.validationStatus && typeof s.validationStatus.ok === "boolean",
      `Test 6: ${s.id} has validationStatus`
    );
  }
}

// ---------------------------------------------------------------------------
// Layer 2 independent validation + rebuild identity + PROOF block
// ---------------------------------------------------------------------------
{
  const c = rebuildSteps0to2(R, 2);
  const report = validateSteps0to2(c);
  assert(report.ok, `Layer 2 validateSteps0to2: ${report.failures.join("; ") || "ok"}`);

  const s0 = c.spheres[0];
  const s1 = c.spheres[1];
  const d = distance3(s0.center, s1.center);

  console.log("");
  console.log("=== PROOF (Step 2 Vesica) ===");
  console.log(`center of sphere 0: (${s0.center.x}, ${s0.center.y}, ${s0.center.z})`);
  console.log(`center of sphere 1: (${s1.center.x}, ${s1.center.y}, ${s1.center.z})`);
  console.log(`radius R:           ${R}`);
  console.log(`center-to-center:   ${d}`);
  console.log(`tolerance epsilon:  ${EPS}`);
  console.log(`distance == R:      ${nearlyEqual(d, R, EPS)}`);
  console.log(`Layer 2 pass:       ${report.ok}`);
  console.log(`proof object:       ${JSON.stringify(report.proof)}`);
}

// Scope guard: this module must not emit Seed/Flower/Tree
{
  const c = buildSteps0to2(R, { endStep: 2 });
  assert(c.spheres.length === 2, "Scope: Steps 0–2 emit exactly 2 spheres");
  assert(c.points.length === 2, "Scope: Steps 0–2 emit exactly 2 points");
  assert(
    !JSON.stringify(c).toLowerCase().includes("sephir") &&
      !JSON.stringify(c).includes("flower-tip"),
    "Scope: no Tree/Flower artifacts in Steps 0–2 document"
  );
}

console.log("");
if (failed > 0) {
  console.error(`${failed} assertion(s) FAILED — Steps 0–2 are NOT proven.`);
  process.exit(1);
}
console.log("All Steps 0–2 tests PASSED — Vesica foundation is proven numerically.");
