/**
 * Flower of Life — one canonical construction history (19 equal-radius centers).
 *
 * After Seed (7):
 *  - 6 mid-ring centers at distance r√3 (adjacent petal outer intersections)
 *  - 6 outer tips at distance 2r (ray through petal ∩ petal circle)
 * Total: 19 equal-radius sphere centers.
 *
 * The historical “13-circle Flower” is NOT a separate model. It is the prefix of
 * this history after the mid-ring is complete (Seed + mid-ring = 13). Snapshot /
 * step-filter that prefix via {@link snapshotFlowerOfLifeHistory} in the generator.
 *
 * Fruit of Life is a different geometry (see fruitOfLife.js).
 */

import {
  circleCircleIntersection,
  rayCircleIntersection,
  drawSphere,
  connectCenters,
  RULE,
} from "../rules.js";
import { buildSeedOfLifeRules } from "./seedOfLife.js";

/** Canonical center IDs in construction order (19). */
export const FLOWER_OF_LIFE_CENTER_IDS = Object.freeze([
  "seed-center",
  "seed-outer-0",
  "seed-outer-1",
  "seed-outer-2",
  "seed-outer-3",
  "seed-outer-4",
  "seed-outer-5",
  "flower-mid-0",
  "flower-mid-1",
  "flower-mid-2",
  "flower-mid-3",
  "flower-mid-4",
  "flower-mid-5",
  "flower-tip-0",
  "flower-tip-1",
  "flower-tip-2",
  "flower-tip-3",
  "flower-tip-4",
  "flower-tip-5",
]);

/**
 * Rules that extend an already-complete Seed history with Flower lattice points.
 * Does not include Seed rules.
 */
export function buildFlowerRingRules() {
  const rules = [];

  // Mid-ring (√3 r): circle(outer_i) ∩ circle(outer_{i+1}), farther from origin
  // (the near hit is the origin itself).
  for (let i = 0; i < 6; i += 1) {
    const a = `seed-outer-${i}`;
    const b = `seed-outer-${(i + 1) % 6}`;
    const pointId = `flower-mid-${i}`;
    rules.push(
      circleCircleIntersection({
        pointId,
        circleAId: a,
        circleBId: b,
        choose: "fartherFromOrigin",
        label: `mid-${i}`,
        justification: `Flower mid-ring: circle(${a}) ∩ circle(${b}), outer intersection.`,
        validateCentersAreNeighbors: true,
      })
    );
    rules.push(
      drawSphere({
        sphereId: `sphere-${pointId}`,
        centerId: pointId,
        justification: "Compass at mid-ring center — draw Flower of Life sphere.",
      })
    );
  }

  // Outer tips (2r): ray(O → petal_i) ∩ circle(petal_i), farther hit.
  for (let i = 0; i < 6; i += 1) {
    const petal = `seed-outer-${i}`;
    const pointId = `flower-tip-${i}`;
    rules.push(
      rayCircleIntersection({
        pointId,
        originId: "seed-center",
        circleCenterId: petal,
        throughPointId: petal,
        choose: "fartherFromOrigin",
        label: `tip-${i}`,
        justification: `Flower outer tip: ray(O→${petal}) ∩ circle(${petal}), farther intersection (distance 2r).`,
      })
    );
    rules.push(
      drawSphere({
        sphereId: `sphere-${pointId}`,
        centerId: pointId,
        justification: "Compass at outer tip — draw Flower of Life sphere.",
      })
    );
  }

  return rules;
}

/**
 * Canonical Flower of Life rule sequence (Seed + rings) — full 19-center history.
 * Sole source of Flower centers for generator, construction, evolution, discovery.
 */
export function buildFlowerOfLifeRules() {
  // Seed rules without connectCenters — Flower regenerates neighbor edges
  const seed = buildSeedOfLifeRules().filter((r) => r.type !== RULE.CONNECT_CENTERS);
  const rings = buildFlowerRingRules();
  const rules = [...seed, ...rings];

  for (let i = 0; i < 6; i += 1) {
    const mid = `flower-mid-${i}`;
    const a = `seed-outer-${i}`;
    const b = `seed-outer-${(i + 1) % 6}`;
    rules.push(connectCenters({ edgeId: `edge-${mid}-${a}`, from: mid, to: a }));
    rules.push(connectCenters({ edgeId: `edge-${mid}-${b}`, from: mid, to: b }));
  }
  for (let i = 0; i < 6; i += 1) {
    const tip = `flower-tip-${i}`;
    const petal = `seed-outer-${i}`;
    const midL = `flower-mid-${(i + 5) % 6}`;
    const midR = `flower-mid-${i}`;
    rules.push(connectCenters({ edgeId: `edge-${tip}-${petal}`, from: tip, to: petal }));
    rules.push(connectCenters({ edgeId: `edge-${tip}-${midL}`, from: tip, to: midL }));
    rules.push(connectCenters({ edgeId: `edge-${tip}-${midR}`, from: tip, to: midR }));
  }

  return rules;
}
