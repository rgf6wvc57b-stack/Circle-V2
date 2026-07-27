/**
 * Construction kernel verification — procedural geometry, no hard-coded centers.
 * Run: node scripts/verify-construction-kernel.mjs
 */
import { dist } from "../src/engine/construction/compass.js";
import {
  rebuild,
  buildFromRules,
  buildSeedOfLifeRules,
  buildFlowerOfLifeRules,
  buildFruitOfLifeRules,
  buildMetatronCubeRules,
  applyRule,
  createKernel,
} from "../src/engine/construction/kernel/index.js";
import { generateSeedOfLife } from "../src/engine/generators/seedOfLife.js";
import {
  generateFlowerOfLife,
  snapshotFlowerOfLifeHistory,
} from "../src/engine/generators/flowerOfLife.js";
import {
  buildSeedOfLifeConstructionPlan,
  buildFlowerOfLifeConstructionPlan,
} from "../src/engine/construction/seedOfLifePlan.js";
import { applyConstructionPlan } from "../src/engine/construction/applyPlan.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

const r = 1.25;

// --- Step 0–2: origin, sphere, Vesica ---
{
  const rules = buildSeedOfLifeRules();
  const s0 = rebuild(rules, r, { endIndex: 0 });
  assert(s0.points.size === 1, "Step 0: one origin point");
  assert(s0.spheres.size === 0, "Step 0: no spheres yet");
  const o = s0.points.get("seed-center");
  assert(o.x === 0 && o.y === 0, "Step 0: origin at (0,0)");

  const s1 = rebuild(rules, r, { endIndex: 1 });
  assert(s1.spheres.size === 1, "Step 1: one sphere");
  assert(
    Math.abs(s1.spheres.get("sphere-seed-center").radius - r) < 1e-12,
    "Step 1: sphere radius == r"
  );

  const s2 = rebuild(rules, r, { endIndex: 3 }); // point + draw second sphere
  assert(s2.spheres.size === 2, "Step 2: Vesica — two spheres");
  const c0 = s2.points.get("seed-center");
  const c1 = s2.points.get("seed-outer-0");
  assert(Math.abs(dist(c0, c1) - r) < 1e-9, "Vesica: distance(center1, center2) == radius");
  assert(
    s2.validations.every((v) => v.ok),
    "Vesica steps all validate"
  );
}

// --- Seed of Life ---
{
  const { state, data } = buildFromRules(buildSeedOfLifeRules(), r, {
    id: "seedOfLife",
    name: "Seed of Life",
  });
  assert(state.spheres.size === 7, "Seed: 7 spheres");
  assert(data.sphereCenters.length === 7, "Seed data: 7 sphereCenters");
  assert(state.validations.every((v) => v.ok), "Seed: all validations pass");

  const origin = state.points.get("seed-center");
  for (let i = 0; i < 6; i += 1) {
    const p = state.points.get(`seed-outer-${i}`);
    assert(Math.abs(dist(p, origin) - r) < 1e-9, `Seed outer ${i} on circle(O)`);
    const next = state.points.get(`seed-outer-${(i + 1) % 6}`);
    assert(Math.abs(dist(p, next) - r) < 1e-9, `Seed ring closes at ${i}`);
  }

  // Rebuild identity: two independent rebuilds match
  const a = rebuild(buildSeedOfLifeRules(), r);
  const b = rebuild(buildSeedOfLifeRules(), r);
  for (const id of a.points.keys()) {
    assert(dist(a.points.get(id), b.points.get(id)) < 1e-12, `Rebuild identity: ${id}`);
  }
}

// --- No hard-coded coords in rule declarations ---
{
  const rules = [
    ...buildSeedOfLifeRules(),
    ...buildFlowerOfLifeRules().slice(0, 5),
  ];
  const hasBakedPoint = rules.some(
    (rule) =>
      rule.point &&
      typeof rule.point.x === "number" &&
      rule.type !== "placeOrigin"
  );
  assert(!hasBakedPoint, "Rules contain no baked point coordinates");
}

// --- Flower full lattice (19) ---
{
  const { state, data } = buildFromRules(buildFlowerOfLifeRules(), r, {
    id: "flowerOfLife",
    name: "Flower of Life",
  });
  assert(state.spheres.size === 19, `Flower: 19 spheres (got ${state.spheres.size})`);
  assert(data.sphereCenters.length === 19, "Flower data: 19 centers");
  assert(state.validations.every((v) => v.ok), "Flower: all validations pass");

  const origin = state.points.get("seed-center");
  for (let i = 0; i < 6; i += 1) {
    const mid = state.points.get(`flower-mid-${i}`);
    const tip = state.points.get(`flower-tip-${i}`);
    assert(Math.abs(dist(mid, origin) - r * Math.sqrt(3)) < 1e-8, `mid ${i} at r√3`);
    assert(Math.abs(dist(tip, origin) - 2 * r) < 1e-8, `tip ${i} at 2r`);
  }
}

// --- Flower mid-ring step (13) is a snapshot of the canonical 19 history ---
{
  const midRing = snapshotFlowerOfLifeHistory(r, { sphereCount: 13 });
  assert(midRing.sphereCenters.length === 13, "Flower step-13 snapshot: 13 spheres");
  const fullIds = new Set(generateFlowerOfLife(r).sphereCenters.map((s) => s.pointId));
  assert(
    midRing.sphereCenters.every((s) => fullIds.has(s.pointId)),
    "Flower step-13 IDs are a subset of canonical 19"
  );
  const fruit = rebuild(buildFruitOfLifeRules(), r);
  assert(fruit.spheres.size === 13, "Fruit: 13 spheres");
}

// --- Metatron complete graph ---
{
  const { data } = buildFromRules(buildMetatronCubeRules(), r, {
    id: "metatron",
    name: "Metatron's Cube",
  });
  assert(data.sphereCenters.length === 13, "Metatron: 13 centers");
  assert(data.edges.filter((e) => e.meta?.kind === "metatron").length === 78, "Metatron: C(13,2)=78 edges");
}

// --- Generators use kernel ---
{
  const seed = generateSeedOfLife(r);
  assert(seed.meta?.constructionKernel === true, "generateSeedOfLife uses kernel");
  assert(seed.sphereCenters.length === 7, "generateSeedOfLife: 7 spheres");
  const flower = generateFlowerOfLife(r);
  assert(flower.meta?.constructionKernel === true, "generateFlowerOfLife uses kernel");
  assert(flower.sphereCenters.length === 19, "generateFlowerOfLife: 19 spheres");
}

// --- Plans rebuild from history (applyPlan matches kernel) ---
{
  const plan = buildSeedOfLifeConstructionPlan(r);
  assert(Array.isArray(plan.rules) && plan.rules.length > 0, "Seed plan stores rules");
  assert(plan.validations.every((v) => v.ok), "Seed plan validations ok");
  const applied = applyConstructionPlan(plan, plan.operations.length - 1);
  assert(applied.sphereCenters.length === 7, "applyPlan Seed: 7 spheres");

  const fplan = buildFlowerOfLifeConstructionPlan(r);
  assert(fplan.sphereCount === 19, "Flower plan sphereCount is 19");
  const fapplied = applyConstructionPlan(fplan, fplan.operations.length - 1);
  assert(fapplied.sphereCenters.length === 19, "applyPlan Flower: 19 spheres");
  const at13 = applyConstructionPlan(fplan, fplan.operationIndexForSphereCount(13));
  assert(at13.sphereCenters.length === 13, "applyPlan Flower step 13: 13 spheres");
}

// --- Validation failure reports immediately ---
{
  let threw = false;
  try {
    const state = createKernel(r);
    applyRule(state, {
      type: "drawSphere",
      sphereId: "orphan",
      centerId: "missing",
      justification: "bad",
    });
  } catch (e) {
    threw = true;
    assert(/validation failed|Unknown point/i.test(e.message), `Failure message clear: ${e.message}`);
  }
  assert(threw, "Invalid rule throws immediately");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll construction kernel checks passed.");
