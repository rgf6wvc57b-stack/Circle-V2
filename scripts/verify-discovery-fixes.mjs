/**
 * Verification for C1, H1, H2, H3 discovery bug fixes.
 * Run: node scripts/verify-discovery-fixes.mjs
 */
import * as THREE from "three";

// Minimal browser globals for DiscoveryEngine / DiscoveryHighlights in Node
if (typeof globalThis.window === "undefined") {
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
    removeEventListener() {},
  };
}
if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    createElement: () => ({ style: {}, appendChild() {} }),
    body: { appendChild() {} },
  };
}
import { generateGeometry } from "../src/engine/generators/index.js";
import {
  analyzeConstruction,
  analyzeConstructionCached,
  clearDiscoveryCache,
  fingerprintData,
} from "../src/discovery/analyze.js";
import { DiscoveryEngine } from "../src/discovery/DiscoveryEngine.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

function summarize(label, result) {
  const byType = {};
  result.discoveries.forEach((d) => {
    byType[d.type] = (byType[d.type] || 0) + 1;
  });
  console.log(`\n=== ${label} ===`);
  console.log("circles", result.circles.length, "intersections", result.intersections.length);
  console.log("discoveries", result.discoveries.length, byType);
  const titles = result.discoveries.map((d) => d.title);
  console.log(
    "titles sample:",
    titles.filter((t) => /Midpoint|C2|C3|Hexagon|Vesica|Six-fold|Symmetry Axis/.test(t)).join(" | ")
  );
  return { byType, titles };
}

// --- H1: midpoints on Seed ---
clearDiscoveryCache();
const seed = analyzeConstruction(generateGeometry("seedOfLife", 1.2), { step: 7, maxStep: 7 });
const seedSum = summarize("Seed of Life", seed);
const seedMids = seed.discoveries.filter((d) => d.type === "midpoint");
assert(seedMids.length >= 3, `H1: Seed midpoints >= 3 (got ${seedMids.length})`);
assert(
  seedMids.every((d) => Math.hypot(d.payload.midpoint.x, d.payload.midpoint.y) < 0.05),
  "H1: Seed midpoints lie at origin (opposite petal pairs)"
);

// --- H2: C3 title not corrupted ---
const c2 = seed.discoveries.find((d) => d.title === "Rotational Symmetry C2");
const c3 = seed.discoveries.find((d) => d.title === "Rotational Symmetry C3");
const c3bad = seed.discoveries.find((d) => d.title === "Rotational Symmetry C3 #2");
assert(Boolean(c2), "H2: title 'Rotational Symmetry C2' present");
assert(Boolean(c3), "H2: title 'Rotational Symmetry C3' present (not #2)");
assert(!c3bad, "H2: corrupted title 'Rotational Symmetry C3 #2' absent");

// --- Flower discoveries ---
const flower = analyzeConstruction(generateGeometry("flowerOfLife", 1.0), { step: 99, maxStep: 99 });
const flowerSum = summarize("Flower of Life", flower);
assert(flowerSum.byType.vesicaPiscis > 0, "Flower has vesica discoveries");
assert(flowerSum.byType.sixFoldSymmetry === 1, "Flower has six-fold symmetry");
assert(flowerSum.byType.hexagon >= 1, "Flower has hexagon");
assert((flowerSum.byType.midpoint || 0) >= 3, `Flower midpoints >= 3 (got ${flowerSum.byType.midpoint || 0})`);
assert(
  !flower.discoveries.some((d) => d.title === "Rotational Symmetry C3 #2"),
  "H2: Flower has no corrupted C3 #2 title"
);
assert(
  Boolean(flower.discoveries.find((d) => d.title === "Rotational Symmetry C3")),
  "H2: Flower has clean C3 title"
);

// --- C1: graph shared materials disposed; count stays constant ---
const scene = new THREE.Scene();
const parent = new THREE.Group();
scene.add(parent);
const design = new THREE.Group();
scene.add(design);

const disposed = [];
const OrigDispose = THREE.Material.prototype.dispose;
THREE.Material.prototype.dispose = function patchedDispose(...args) {
  disposed.push(this);
  return OrigDispose.apply(this, args);
};

const fakeCam = {
  getActiveCamera() {
    return new THREE.PerspectiveCamera();
  },
};
const fakeFocus = { setMeasurementBlocking() {} };

const discoveriesEl = {
  querySelector: (sel) => {
    if (sel === ".discoveries-list") return { innerHTML: "", querySelectorAll: () => [] };
    return null;
  },
  querySelectorAll: () => [],
};
const mathematicsEl = {
  querySelector: (sel) => {
    if (sel === ".math-grid") return { innerHTML: "" };
    return null;
  },
};
const hud = { hidden: true, innerHTML: "" };
const dom = {
  addEventListener() {},
  removeEventListener() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
};

const engine = new DiscoveryEngine({
  scene,
  parentGroup: parent,
  designGroup: design,
  cameraController: fakeCam,
  focusSystem: fakeFocus,
  domElement: dom,
  discoveriesEl,
  mathematicsEl,
  intersectionHud: hud,
});

engine.setShowGraph(true);

// Repeated rebuilds of the SAME geometry — live unique materials must stay constant
const seedDataForGraph = generateGeometry("seedOfLife", 1.2);
engine.setContext({ step: 7, maxStep: 7 });
const seedSnaps = [];
for (let i = 0; i < 10; i += 1) {
  // Force rebuild path even if fingerprint matches by clearing cache + new object identity
  // setData uses fingerprint; same fingerprint still rebuilds graph today.
  engine.setData(seedDataForGraph);
  const unique = new Set();
  engine.graphGroup.traverse((obj) => {
    if (!obj.material) return;
    (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => unique.add(m));
  });
  seedSnaps.push({ unique: unique.size, disposed: disposed.length });
}

// Alternating geometries: dispose count must rise; live unique must not accumulate across switches
const altSnaps = [];
for (let i = 0; i < 8; i += 1) {
  clearDiscoveryCache();
  const data = generateGeometry(i % 2 === 0 ? "seedOfLife" : "flowerOfLife", 1 + i * 0.05);
  engine.setContext({ step: 99, maxStep: 99 });
  engine.setData(data);
  const unique = new Set();
  engine.graphGroup.traverse((obj) => {
    if (!obj.material) return;
    (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => unique.add(m));
  });
  altSnaps.push({ unique: unique.size, disposed: disposed.length });
}

THREE.Material.prototype.dispose = OrigDispose;

console.log("\n=== C1 same-geometry rebuild snaps ===");
seedSnaps.forEach((s, i) => console.log(`seed rebuild ${i}`, s));
console.log("=== C1 alternating geometry snaps ===");
altSnaps.forEach((s, i) => console.log(`alt rebuild ${i}`, s));

const seedUnique = new Set(seedSnaps.map((s) => s.unique));
assert(seedUnique.size === 1, `C1: same-geometry unique live materials constant (values=${[...seedUnique]})`);
assert(
  seedSnaps[seedSnaps.length - 1].disposed > seedSnaps[0].disposed,
  `C1: disposals increase across same-geometry rebuilds (${seedSnaps[0].disposed} → ${seedSnaps[seedSnaps.length - 1].disposed})`
);
assert(
  altSnaps[altSnaps.length - 1].disposed > altSnaps[0].disposed,
  `C1: disposals increase across alternating rebuilds (${altSnaps[0].disposed} → ${altSnaps[altSnaps.length - 1].disposed})`
);
const altMax = Math.max(...altSnaps.map((s) => s.unique));
assert(altMax < 40, `C1: live unique materials bounded under geometry switches (max=${altMax})`);

// --- H3: highlight persistence when fingerprint unchanged ---
clearDiscoveryCache();
const seedData = generateGeometry("seedOfLife", 1.2);
engine.setContext({ step: 7, maxStep: 7 });
engine.setData(seedData);
const hex = engine.analysis.discoveries.find((d) => d.type === "hexagon");
assert(Boolean(hex), "H3 setup: hexagon discovery exists");

let showCalls = 0;
const origShow = engine.highlights.show.bind(engine.highlights);
engine.highlights.show = (d) => {
  showCalls += 1;
  return origShow(d);
};

engine.selectDiscovery(hex.id);
const showsAfterSelect = showCalls;
assert(showsAfterSelect === 1, `H3: selectDiscovery invokes show once (got ${showsAfterSelect})`);

const childCountAfterSelect = engine.highlights.root.children.length;
assert(childCountAfterSelect > 0, "H3: highlight meshes present after select");

// Simulate construction sync with identical fingerprint (cached analysis)
for (let i = 0; i < 5; i += 1) {
  engine.setData(seedData);
}
assert(showCalls === 1, `H3: setData with same fingerprint does not re-call show (showCalls=${showCalls})`);
assert(
  engine.highlights.root.children.length === childCountAfterSelect,
  "H3: highlight child count unchanged across identical syncs"
);
assert(engine.selectedId === hex.id, "H3: selectedId persists");

// Fingerprint change should rebuild highlight
engine.setContext({ step: 7, maxStep: 7 });
engine.setData(generateGeometry("seedOfLife", 1.5));
assert(showCalls === 2, `H3: radius/fingerprint change re-calls show (showCalls=${showCalls})`);

engine.dispose();

console.log("\n========");
if (failed) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("All discovery fix verifications passed");
