/**
 * Seed of Life — pure construction rules (no baked coordinates).
 *
 * Step 0: origin point
 * Step 1: first sphere
 * Step 2: second center on circumference → Vesica (d == r)
 * Step 3+: CCW circle–circle intersections around the origin
 */

import {
  placeOrigin,
  drawSphere,
  rayCircleIntersection,
  circleCircleIntersection,
  connectCenters,
} from "../rules.js";

const OUTER_LABELS = Object.freeze([
  "east",
  "northeast",
  "northwest",
  "west",
  "southwest",
  "southeast",
]);

/**
 * @returns {object[]} ordered construction rules
 */
export function buildSeedOfLifeRules() {
  const rules = [];

  rules.push(placeOrigin("seed-center", "origin"));
  rules.push(
    drawSphere({
      sphereId: "sphere-seed-center",
      centerId: "seed-center",
      justification: "Compass at O with opening r — draw the first sphere.",
    })
  );

  // Vesica: second center exactly one radius from the first
  rules.push(
    rayCircleIntersection({
      pointId: "seed-outer-0",
      originId: "seed-center",
      circleCenterId: "seed-center",
      direction: [1, 0, 0],
      label: OUTER_LABELS[0],
      justification: "Mark A = ray(+X) ∩ circle(O). Requires distance(O,A) == r.",
      validateDistanceEqualsRadius: true,
    })
  );
  rules.push(
    drawSphere({
      sphereId: "sphere-seed-outer-0",
      centerId: "seed-outer-0",
      justification: "Compass at A (opening r) — draw the second sphere (Vesica Piscis).",
    })
  );

  let previousId = "seed-outer-0";
  for (let i = 1; i <= 5; i += 1) {
    const pointId = `seed-outer-${i}`;
    rules.push(
      circleCircleIntersection({
        pointId,
        circleAId: "seed-center",
        circleBId: previousId,
        choose: "ccwUnused",
        relativeToId: previousId,
        label: OUTER_LABELS[i],
        justification: `Mark circle(O) ∩ circle(${previousId}) — unused CCW intersection.`,
        validateCentersAreNeighbors: true,
      })
    );
    rules.push(
      drawSphere({
        sphereId: `sphere-${pointId}`,
        centerId: pointId,
        justification: `Compass at the new center — draw surrounding sphere ${i + 1} of 6.`,
      })
    );
    previousId = pointId;
  }

  // Explicit constructible edges (radials + ring)
  for (let i = 0; i < 6; i += 1) {
    rules.push(
      connectCenters({
        edgeId: `edge-seed-center-seed-outer-${i}`,
        from: "seed-center",
        to: `seed-outer-${i}`,
      })
    );
  }
  for (let i = 0; i < 6; i += 1) {
    const a = `seed-outer-${i}`;
    const b = `seed-outer-${(i + 1) % 6}`;
    rules.push(
      connectCenters({
        edgeId: `edge-ring-${i}`,
        from: a,
        to: b,
      })
    );
  }

  return rules;
}
