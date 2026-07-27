/**
 * Evolution steps 0–6: empty → point → sphere → vesica → intersections → third sphere → Seed.
 * Built by replaying construction-kernel rules (no hard-coded centers).
 */
import {
  dist,
  intersectCirclesEqualRadius,
} from "../../construction/compass.js";
import { snapshot, addPoint } from "../buildHelpers.js";
import {
  applyRule,
  createKernel,
  buildSeedOfLifeRules,
  rebuild,
  toConstructionData,
} from "../../construction/kernel/index.js";

function seedRules() {
  return buildSeedOfLifeRules();
}

/** Apply the first N rules that match a predicate / count of drawSphere etc. */
function rebuildThrough(radius, predicate) {
  const rules = seedRules();
  const state = createKernel(radius);
  for (let i = 0; i < rules.length; i += 1) {
    applyRule(state, rules[i]);
    if (predicate(state, rules[i], i)) break;
  }
  return state;
}

/** Step 0 — empty space */
export function buildEmpty(radius) {
  return snapshot("evolution-empty", "Empty Space", radius);
}

/** Step 1 — one point */
export function buildOnePoint(radius) {
  const state = rebuildThrough(radius, (s) => s.points.size >= 1 && s.spheres.size === 0);
  const data = toConstructionData(state, { id: "evolution-point", name: "One Point" });
  // Only the origin point — strip any spheres (shouldn't exist)
  data.sphereCenters = [];
  data.circleCenters = [];
  data.edges = [];
  data.points = data.points.filter((p) => p.id === "seed-center");
  return data;
}

/** Step 2 — one sphere on the point */
export function buildOneSphere(radius) {
  const state = rebuildThrough(radius, (s) => s.spheres.size >= 1);
  const data = toConstructionData(state, { id: "evolution-sphere", name: "First Sphere" });
  data.edges = [];
  data.points = data.points.filter((p) => p.id === "seed-center");
  data.sphereCenters = data.sphereCenters.filter((s) => s.pointId === "seed-center");
  data.circleCenters = data.circleCenters.filter((c) => c.pointId === "seed-center");
  return data;
}

/** Step 3 — second sphere at distance R (Vesica Piscis) */
export function buildVesicaSpheres(radius) {
  const state = rebuildThrough(radius, (s) => s.spheres.size >= 2);
  const data = toConstructionData(state, { id: "evolution-vesica", name: "Vesica Piscis" });
  data.edges = [];
  // Keep only the two vesica centers / spheres
  const keep = new Set(["seed-center", "seed-outer-0"]);
  data.points = data.points.filter((p) => keep.has(p.id));
  data.sphereCenters = data.sphereCenters.filter((s) => keep.has(s.pointId));
  data.circleCenters = data.circleCenters.filter((c) => keep.has(c.pointId));
  const c0 = data.points.find((p) => p.id === "seed-center");
  const c1 = data.points.find((p) => p.id === "seed-outer-0");
  if (Math.abs(dist(c0, c1) - radius) > 1e-9) {
    throw new Error("Vesica center is not one radius from origin");
  }
  return data;
}

/** Step 4 — mark both vesica intersection points */
export function buildVesicaIntersections(radius) {
  const data = buildVesicaSpheres(radius);
  data.id = "evolution-vesica-ix";
  data.name = "Vesica Intersections";
  const o = data.points.find((p) => p.id === "seed-center");
  const a = data.points.find((p) => p.id === "seed-outer-0");
  const hits = intersectCirclesEqualRadius(o, a, radius);
  if (hits.length !== 2) {
    throw new Error("Expected two vesica intersection points");
  }
  hits.forEach((h, i) => {
    addPoint(data, {
      id: `vesica-ix-${i}`,
      x: h.x,
      y: h.y,
      z: h.z,
      label: i === 0 ? "ix-a" : "ix-b",
      meta: { role: "intersection" },
    });
  });
  return data;
}

/** Step 5 — third sphere from a vesica intersection (compass walk) */
export function buildThirdSphere(radius) {
  const state = rebuildThrough(radius, (s) => s.spheres.size >= 3);
  const data = toConstructionData(state, { id: "evolution-third", name: "Third Sphere" });
  data.edges = [];
  const keep = new Set(["seed-center", "seed-outer-0", "seed-outer-1"]);
  // Include vesica intersection markers from prior narrative step
  const withIx = buildVesicaIntersections(radius);
  withIx.points
    .filter((p) => p.id.startsWith("vesica-ix-"))
    .forEach((p) => {
      if (!data.points.some((q) => q.id === p.id)) data.points.push(p);
    });
  data.points = data.points.filter(
    (p) => keep.has(p.id) || p.id.startsWith("vesica-ix-")
  );
  data.sphereCenters = data.sphereCenters.filter((s) => keep.has(s.pointId));
  data.circleCenters = data.circleCenters.filter((c) => keep.has(c.pointId));
  return data;
}

/** Step 6 — complete Seed of Life (7 spheres) + ring edges */
export function buildSeedOfLifeStage(radius) {
  const rules = seedRules();
  const state = rebuild(rules, radius);
  const data = toConstructionData(state, {
    id: "evolution-seed",
    name: "Seed of Life",
  });
  // Keep only seed centers (drop nothing — seed rules are exactly the seed)
  const centerIds = new Set([
    "seed-center",
    ...Array.from({ length: 6 }, (_, i) => `seed-outer-${i}`),
  ]);
  data.points = data.points.filter((p) => centerIds.has(p.id));
  data.sphereCenters = data.sphereCenters.filter((s) => centerIds.has(s.pointId));
  data.circleCenters = data.circleCenters.filter((c) => centerIds.has(c.pointId));
  if (data.sphereCenters.length !== 7) {
    throw new Error(`Seed stage expected 7 spheres, got ${data.sphereCenters.length}`);
  }
  return data;
}
