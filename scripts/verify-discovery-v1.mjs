/**
 * Discovery Engine v1 verification.
 * Run: node scripts/verify-discovery-v1.mjs
 */
import { generateGeometry } from "../src/engine/generators/index.js";
import { GeometryGraph } from "../src/discovery/graph/GeometryGraph.js";
import { discoverFromGraph } from "../src/discovery/detect/discoverFromGraph.js";
import { DISCOVERY_LABELS, NODE_TYPES, REL } from "../src/discovery/graph/types.js";
import { inspectNode } from "../src/discovery/ObjectInspector.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

function analyze(id, radius = 1) {
  const data = generateGeometry(id, radius);
  const graph = new GeometryGraph();
  const t0 = performance.now();
  const { changed, ms } = graph.update(data, { step: 99, maxStep: 99 });
  const t1 = performance.now();
  const result = discoverFromGraph(graph);
  const total = performance.now() - t0;
  return { data, graph, result, changed, graphMs: ms, discoverMs: performance.now() - t1, totalMs: total };
}

function summarize(label, pack) {
  const counts = {};
  pack.result.summary.forEach((s) => {
    counts[s.type] = s.count;
  });
  console.log(`\n=== ${label} ===`);
  console.log(
    `nodes=${pack.graph.nodes.size} relations=${pack.graph.relations.length} ` +
      `discoveries=${pack.result.discoveries.length} ` +
      `graphMs=${pack.graphMs.toFixed(2)} totalMs=${pack.totalMs.toFixed(2)}`
  );
  console.log("counts", counts);
  return counts;
}

// --- Graph structure ---
const seed = analyze("seedOfLife", 1.2);
const seedCounts = summarize("Seed of Life", seed);

assert(seed.graph.nodes.size > 0, "Seed graph has nodes");
assert(
  seed.graph.nodesOfType(NODE_TYPES.POINT).every(
    (n) => n.id && n.type && n.constructionStep != null && Array.isArray(n.parentIds) && Array.isArray(n.childIds) && Array.isArray(n.adjacency) && n.center
  ),
  "Seed points have required graph fields"
);
assert(
  seed.graph.nodesOfType(NODE_TYPES.SPHERE).every((n) => n.radius != null),
  "Seed spheres have radius"
);
assert(seed.graph.relationsOf(REL.INTERSECTS).length > 0, "Seed has intersects relations");
assert(seed.graph.relationsOf(REL.EQUAL_RADIUS).length > 0, "Seed has equal-radius relations");
assert(seed.graph.relationsOf(REL.MIRROR_PAIR).length > 0, "Seed has mirror-pair relations");
assert(
  seed.graph.relationsOf(REL.ROTATIONAL_EQUIVALENT).length > 0,
  "Seed has rotational-equivalent relations"
);

// --- Discovery types present ---
assert(seedCounts.vesicaPiscis > 0, "Seed detects Vesica Piscis");
assert(seedCounts.equilateralTriangle > 0, "Seed detects equilateral triangles");
assert(seedCounts.hexagon > 0, "Seed detects hexagon");
assert(seedCounts.reflectionSymmetry > 0, "Seed detects reflection symmetry");
assert(seedCounts.rotationalSymmetry > 0, "Seed detects rotational symmetry");
assert(seedCounts.equalRadiusGroup > 0, "Seed detects equal-radius groups");

// --- Explorer summary labels ---
const labels = seed.result.summary.map((s) => s.label);
Object.values(DISCOVERY_LABELS).forEach((label) => {
  assert(labels.includes(label), `Explorer lists "${label}"`);
});

// --- Clicking a type collects all matching node ids ---
const vesicaItems = seed.result.byType.get("vesicaPiscis") || [];
const vesicaIds = new Set();
vesicaItems.forEach((d) => (d.nodeIds || []).forEach((id) => vesicaIds.add(id)));
assert(vesicaIds.size >= 2, "Vesica discovery exposes highlightable node ids");

// --- Object inspector ---
const anySphere = seed.graph.nodesOfType(NODE_TYPES.SPHERE)[0];
const insp = inspectNode(seed.graph, anySphere.id, seed.result);
assert(Boolean(insp), "Inspector resolves sphere node");
assert(insp.history.length >= 1, "Inspector has construction history");
assert(Array.isArray(insp.parents), "Inspector has parents");
assert(Array.isArray(insp.children), "Inspector has children");
assert(Array.isArray(insp.connected), "Inspector has connected");
assert(insp.measurements.radius != null, "Inspector reports radius measurement");

// --- Incremental cache ---
const again = seed.graph.update(seed.data, { step: 99, maxStep: 99 });
assert(again.changed === false, "Identical fingerprint skips graph rebuild");
assert(again.ms < 5, `Cache hit is cheap (got ${again.ms.toFixed(3)} ms)`);

// --- Flower ---
const flower = analyze("flowerOfLife", 1);
const flowerCounts = summarize("Flower of Life", flower);
assert(flowerCounts.vesicaPiscis > seedCounts.vesicaPiscis, "Flower has more vesicae than Seed");
assert(flower.totalMs < 100, `Flower analysis under 100ms (got ${flower.totalMs.toFixed(2)} ms)`);
assert(seed.totalMs < 100, `Seed analysis under 100ms (got ${seed.totalMs.toFixed(2)} ms)`);

// --- Construction independence: tesseract / merkaba also participate ---
const merkaba = analyze("merkaba", 1);
summarize("Merkaba", merkaba);
assert(merkaba.graph.nodes.size > 0, "Merkaba builds a graph without special-case code");
assert(merkaba.result.summary.length === Object.keys(DISCOVERY_LABELS).length, "Merkaba summary has all categories");

const tesseract = analyze("tesseract", 1);
summarize("Tesseract", tesseract);
assert(tesseract.graph.nodesOfType(NODE_TYPES.EDGE).length > 0, "Tesseract edges enter the graph");
assert(
  tesseract.graph.relationsOf(REL.EQUAL_LENGTH).length > 0 ||
    tesseract.graph.relationsOf(REL.PARALLEL).length > 0,
  "Tesseract edge relations computed"
);
assert(tesseract.totalMs < 100, `Tesseract analysis under 100ms (got ${tesseract.totalMs.toFixed(2)} ms)`);

console.log(failed ? `\n${failed} failure(s)` : "\nAll Discovery Engine v1 checks passed.");
process.exit(failed ? 1 : 0);
