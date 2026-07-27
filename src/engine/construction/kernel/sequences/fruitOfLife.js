/**
 * Fruit of Life — Seed + 6 second-ring tips from adjacent petal intersections.
 * 13 equal-radius centers; skeleton for Metatron's Cube.
 *
 * Note: these outer tips lie at distance r√3 from the origin (vector sum of
 * adjacent Seed petals). Classical "2r hex tips" are the Flower outer tips.
 */

import { RULE, circleCircleIntersection, drawSphere, connectCenters } from "../rules.js";
import { buildSeedOfLifeRules } from "./seedOfLife.js";

export function buildFruitOfLifeRules() {
  const seed = buildSeedOfLifeRules().filter((r) => r.type !== RULE.CONNECT_CENTERS);
  const rules = [...seed];

  for (let i = 0; i < 6; i += 1) {
    const a = `seed-outer-${i}`;
    const b = `seed-outer-${(i + 1) % 6}`;
    const pointId = `fruit-ring2-${i}`;
    rules.push(
      circleCircleIntersection({
        pointId,
        circleAId: a,
        circleBId: b,
        choose: "fartherFromOrigin",
        label: `fruit-r2-${i}`,
        justification: `Fruit outer tip: circle(${a}) ∩ circle(${b}), farther from origin.`,
        validateCentersAreNeighbors: true,
      })
    );
    rules.push(
      drawSphere({
        sphereId: `sphere-${pointId}`,
        centerId: pointId,
        justification: "Compass at Fruit tip — draw equal-radius sphere.",
      })
    );
  }

  return rules;
}

/** Metatron's Cube: Fruit centers + complete straightedge graph. */
export function buildMetatronCubeRules() {
  const fruit = buildFruitOfLifeRules();
  const centerIds = [
    "seed-center",
    ...Array.from({ length: 6 }, (_, i) => `seed-outer-${i}`),
    ...Array.from({ length: 6 }, (_, i) => `fruit-ring2-${i}`),
  ];

  const rules = [...fruit];
  for (let i = 0; i < centerIds.length; i += 1) {
    for (let j = i + 1; j < centerIds.length; j += 1) {
      rules.push(
        connectCenters({
          edgeId: `metatron-${i}-${j}`,
          from: centerIds[i],
          to: centerIds[j],
          meta: { kind: "metatron" },
          justification: `Metatron straightedge: ${centerIds[i]} — ${centerIds[j]}.`,
        })
      );
    }
  }
  return rules;
}
