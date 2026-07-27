/**
 * Canonical Flower of Life — Tests A–G.
 * One 19-center construction history shared by generator, construction,
 * evolution, and both Circle / Sphere renderers.
 *
 * Run: node scripts/verify-canonical-flower.mjs
 */
import * as THREE from "three";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ConstructionEngine,
  RENDER_MODES,
  buildFlowerOfLifeRules,
} from "../src/engine/index.js";
import {
  generateFlowerOfLife,
  snapshotFlowerOfLifeHistory,
  flowerGeometryFingerprint,
  FLOWER_OF_LIFE_CENTER_IDS,
} from "../src/engine/generators/flowerOfLife.js";
import { buildFlowerOfLifeConstructionPlan } from "../src/engine/construction/seedOfLifePlan.js";
import { applyConstructionPlan } from "../src/engine/construction/applyPlan.js";
import { buildFlowerOfLifeStage } from "../src/engine/evolution/stages/flowerFruit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = 1.2;
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

function centerIds(data) {
  return data.sphereCenters.map((s) => s.pointId);
}

function sortedIds(data) {
  return [...centerIds(data)].sort();
}

console.log("=== Canonical Flower of Life (19) — Tests A–G ===\n");
console.log("Canonical center IDs (construction order):");
FLOWER_OF_LIFE_CENTER_IDS.forEach((id, i) => console.log(`  ${i + 1}. ${id}`));
console.log("");

// --- Test A: generator returns exactly 19 centers ---
const generated = generateFlowerOfLife(r);
assert(generated.sphereCenters.length === 19, "Test A: Flower generator returns exactly 19 centers");
assert(
  centerIds(generated).length === new Set(centerIds(generated)).size,
  "Test A: generator center IDs are unique"
);
assert(
  FLOWER_OF_LIFE_CENTER_IDS.every((id) => centerIds(generated).includes(id)),
  "Test A: generator includes every canonical center ID"
);
assert(
  sortedIds(generated).join("|") === [...FLOWER_OF_LIFE_CENTER_IDS].sort().join("|"),
  "Test A: generator ID set equals FLOWER_OF_LIFE_CENTER_IDS"
);

// --- Test B: Construction Mode final step = same 19 centers ---
const plan = buildFlowerOfLifeConstructionPlan(r);
assert(plan.sphereCount === 19, "Test B: construction plan sphereCount === 19");
const constructed = applyConstructionPlan(plan, plan.operations.length - 1);
assert(
  constructed.sphereCenters.length === 19,
  "Test B: Construction Mode final step returns exactly 19 centers"
);
assert(
  sortedIds(constructed).join("|") === sortedIds(generated).join("|"),
  "Test B: construction final IDs match generator IDs"
);
{
  const genFp = flowerGeometryFingerprint(generated);
  const conFp = flowerGeometryFingerprint(constructed);
  assert(genFp === conFp, "Test B: construction final fingerprint equals generator fingerprint");
  if (genFp !== conFp) {
    console.error("  generator fp:", genFp.slice(0, 200), "…");
    console.error("  construct fp:", conFp.slice(0, 200), "…");
  }
}

// --- Test C: Evolution Mode Flower step = same 19 centers ---
const evolution = buildFlowerOfLifeStage(r);
assert(
  evolution.sphereCenters.length === 19,
  "Test C: Evolution Flower step returns exactly 19 centers"
);
assert(
  sortedIds(evolution).join("|") === sortedIds(generated).join("|"),
  "Test C: evolution IDs match generator IDs"
);
{
  // Compare centers/radius/IDs (evolution flattens display steps for timeline)
  const pick = (data) =>
    JSON.stringify({
      radius: data.radius,
      centers: data.sphereCenters
        .map((s) => {
          const p = data.points.find((pt) => pt.id === s.pointId);
          return { id: s.pointId, sphereId: s.id, x: p.x, y: p.y, z: p.z, radius: s.radius };
        })
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
  assert(
    pick(evolution) === pick(generated),
    "Test C: evolution centers/radius/IDs equal generator"
  );
}

// --- Tests D & E: Circle/Sphere renderer input fingerprint ---
{
  const group = new THREE.Group();
  const engine = new ConstructionEngine(group);
  engine.setGeometry("flowerOfLife");
  engine.setRadius(r);

  const before = engine.getFullData();
  const fpBefore = flowerGeometryFingerprint(before);
  const rendererDataBefore = structuredClone(engine.getVisibleData());

  engine.setRenderMode(RENDER_MODES.circles);
  const afterCircles = engine.getFullData();
  const visibleCircles = engine.getVisibleData();
  const fpCircles = flowerGeometryFingerprint(afterCircles);
  const fpVisibleCircles = flowerGeometryFingerprint(visibleCircles);

  engine.setRenderMode(RENDER_MODES.spheres);
  const afterSpheres = engine.getFullData();
  const visibleSpheres = engine.getVisibleData();
  const fpSpheres = flowerGeometryFingerprint(afterSpheres);
  const fpVisibleSpheres = flowerGeometryFingerprint(visibleSpheres);

  engine.setRenderMode(RENDER_MODES.circles);
  const afterBack = engine.getFullData();
  const fpBack = flowerGeometryFingerprint(afterBack);

  console.log("\nFingerprints (renderer switching):");
  console.log("  initial :", fpBefore);
  console.log("  circles :", fpCircles);
  console.log("  spheres :", fpSpheres);
  console.log("  circles2:", fpBack);

  assert(
    fpVisibleCircles === fpVisibleSpheres,
    "Test D: Circle renderer input fingerprint equals Sphere renderer input fingerprint"
  );
  assert(
    fpCircles === fpSpheres,
    "Test D: fullData fingerprint identical for Circle and Sphere modes"
  );

  assert(fpBefore === fpCircles, "Test E: Circle switch does not change fingerprint");
  assert(fpBefore === fpSpheres, "Test E: Sphere switch does not change fingerprint");
  assert(fpBefore === fpBack, "Test E: Circle→Sphere→Circle fingerprint unchanged");

  assert(
    sortedIds(afterBack).join("|") === sortedIds(before).join("|"),
    "Test E: IDs unchanged after Circle→Sphere→Circle"
  );
  assert(afterBack.radius === before.radius, "Test E: radius unchanged");
  assert(
    afterBack.sphereCenters.every(
      (s, i) => s.constructionStep === before.sphereCenters[i].constructionStep
    ),
    "Test E: constructionStep metadata unchanged"
  );

  // Selecting Circle/Sphere must not regenerate — same object identity for fullData
  assert(
    engine.getFullData() === before || flowerGeometryFingerprint(engine.getFullData()) === fpBefore,
    "Test E: geometry data remains the canonical Flower history"
  );

  void rendererDataBefore;
}

// --- Test F: step-13 centers are a subset of canonical 19 ---
{
  const full = generateFlowerOfLife(r);
  const fullIdSet = new Set(centerIds(full));
  const step13 = snapshotFlowerOfLifeHistory(r, { sphereCount: 13 });
  assert(step13.sphereCenters.length === 13, "Test F: intermediate step has 13 centers");
  assert(
    step13.sphereCenters.every((s) => fullIdSet.has(s.pointId)),
    "Test F: every step-13 center ID is in the canonical 19 list"
  );

  const plan13 = applyConstructionPlan(
    buildFlowerOfLifeConstructionPlan(r),
    buildFlowerOfLifeConstructionPlan(r).operationIndexForSphereCount(13)
  );
  assert(plan13.sphereCenters.length === 13, "Test F: construction step 13 has 13 spheres");
  assert(
    plan13.sphereCenters.every((s) => fullIdSet.has(s.pointId)),
    "Test F: construction step-13 IDs ⊆ canonical 19"
  );

  console.log("\nStep-13 subset IDs:");
  centerIds(step13).forEach((id) => console.log(`  ${id}`));
  const missingTips = FLOWER_OF_LIFE_CENTER_IDS.filter((id) => !centerIds(step13).includes(id));
  console.log("Not yet revealed at step 13 (tips):", missingTips.join(", "));
  assert(
    missingTips.length === 6 && missingTips.every((id) => id.startsWith("flower-tip-")),
    "Test F: the six flower-tip-* centers are the ones deferred past step 13"
  );
}

// --- Test G: no separate compact Flower center generator remains ---
{
  const compactName = "buildFlowerOfLifeCompactRules";
  const ring2 = "flower-ring2-";
  const hits = [];

  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist" || name === ".git") continue;
      const full = path.join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|mjs|ts|tsx|md)$/.test(name)) continue;
      // Allow this verify script / audit docs to mention the removed name historically
      if (full.endsWith("verify-canonical-flower.mjs")) continue;
      if (full.includes(`${path.sep}docs${path.sep}`)) continue;
      const text = readFileSync(full, "utf8");
      if (text.includes(compactName)) hits.push(`${full}: ${compactName}`);
      if (text.includes(ring2) && !full.includes(`${path.sep}fruitOfLife`)) {
        // fruitOfLife may use fruit-ring2; flower-ring2 must not exist
        hits.push(`${full}: ${ring2}`);
      }
    }
  }
  walk(path.join(ROOT, "src"));
  walk(path.join(ROOT, "scripts"));
  assert(hits.length === 0, `Test G: no compact Flower generator remains (${hits.join("; ") || "clean"})`);

  let threw = false;
  try {
    // Dynamic import of removed export should fail if re-exported
    const mod = await import("../src/engine/construction/kernel/index.js");
    assert(
      typeof mod.buildFlowerOfLifeCompactRules !== "function",
      "Test G: buildFlowerOfLifeCompactRules is not exported from kernel"
    );
  } catch (e) {
    threw = true;
    assert(false, `Test G: kernel import failed: ${e.message}`);
  }
  void threw;

  assert(
    typeof buildFlowerOfLifeRules === "function",
    "Test G: canonical buildFlowerOfLifeRules remains the sole Flower rule builder"
  );
}

// Progressive reveal sanity (Construction Mode history)
{
  const p = buildFlowerOfLifeConstructionPlan(r);
  const counts = [1, 2, 3, 7, 13, 19];
  for (const n of counts) {
    const snap = applyConstructionPlan(p, p.operationIndexForSphereCount(n));
    assert(
      snap.sphereCenters.length === n,
      `Construction progressive reveal: step ${n} shows ${n} circles (got ${snap.sphereCenters.length})`
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll canonical Flower of Life tests (A–G) PASSED.");
console.log("Every system consumes the same canonical 19-center construction history.");
