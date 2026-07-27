/**
 * Evolution Mode verification.
 * Run: node scripts/verify-evolution.mjs
 */
import { getEvolutionSequence } from "../src/engine/evolution/registry.js";
import { GeometryGraph } from "../src/discovery/graph/GeometryGraph.js";
import { discoverFromGraph } from "../src/discovery/detect/discoverFromGraph.js";
import { NODE_TYPES } from "../src/discovery/graph/types.js";
import { dist } from "../src/engine/construction/compass.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

const r = 1.2;
const seq = getEvolutionSequence("sacredGeometry");
assert(seq.steps.length === 12, `12 evolution steps 0..11 (got ${seq.steps.length})`);

const expectedTitles = [
  "Empty Space",
  "One Point",
  "First Sphere",
  "Vesica Piscis",
  "Intersection Points",
  "Third Sphere",
  "Seed of Life",
  "Flower of Life",
  "Fruit of Life",
  "Metatron's Cube",
  "Platonic Solids",
  "Tree of Life",
];

expectedTitles.forEach((title, i) => {
  assert(seq.steps[i].title === title, `Step ${i}: ${title}`);
});

// Monotonic constructibility: object counts never decrease (except empty→point is increase)
let prevSpheres = -1;
const snapshots = seq.steps.map((s) => s.build(r));

snapshots.forEach((data, i) => {
  const n = data.sphereCenters.length;
  const p = data.points.length;
  console.log(`Step ${i} (${seq.steps[i].id}): points=${p} spheres=${n} edges=${data.edges.length}`);
  if (i === 0) {
    assert(p === 0 && n === 0, "Step 0 is empty");
  }
  if (i === 1) assert(p === 1 && n === 0, "Step 1: one point, no sphere");
  if (i === 2) assert(n === 1, "Step 2: one sphere");
  if (i === 3) assert(n === 2, "Step 3: vesica — two spheres");
  if (i === 4) assert(p >= 4, "Step 4: intersection points marked");
  if (i === 5) assert(n === 3, "Step 5: three spheres");
  if (i === 6) assert(n === 7, "Step 6: Seed of Life — 7 spheres");
  if (i === 8) assert(n === 13, "Step 8: Fruit of Life — 13 spheres");
  if (i === 11) {
    const seph = data.points.filter((pt) => pt.meta?.role === "sephirah");
    assert(seph.length === 10, "Step 11: 10 Sephirot");
  }
  if (i > 0 && i <= 6) {
    assert(n >= prevSpheres, `Step ${i}: spheres non-decreasing through Seed`);
  }
  prevSpheres = n;
});

// Vesica geometry: centers distance = R
const vesica = snapshots[3];
const c0 = vesica.points.find((p) => p.id === "seed-center");
const c1 = vesica.points.find((p) => p.id === "seed-outer-0");
assert(Math.abs(dist(c0, c1) - r) < 1e-9, "Vesica centers are one radius apart");

// Nothing appears before constructible: step 2 has no second center
assert(
  !snapshots[2].points.some((p) => p.id === "seed-outer-0"),
  "Second center absent before step 3"
);

// Discovery updates on later stages
const flower = snapshots[7];
const graph = new GeometryGraph();
graph.update(flower, { step: 1, maxStep: 1 });
const result = discoverFromGraph(graph);
assert((result.byType.get("vesicaPiscis") || []).length > 0, "Flower stage yields vesicae");
assert(graph.nodesOfType(NODE_TYPES.SPHERE).length > 7, "Flower has more spheres than Seed");

const metatron = snapshots[9];
assert(metatron.edges.length >= 78, `Metatron has complete connections (got ${metatron.edges.length})`);

const tree = snapshots[11];
assert(tree.meta?.viewMode === "geometric" || tree.meta?.foundation, "Tree stage is geometric mode");

// Extensibility: sequence registry shape
assert(typeof seq.id === "string" && Array.isArray(seq.steps), "Sequence registry shape");

console.log(failed ? `\n${failed} failure(s)` : "\nAll Evolution Mode checks passed.");
process.exit(failed ? 1 : 0);
