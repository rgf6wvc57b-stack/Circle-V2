import {
  buildFromRules,
  buildSeedOfLifeRules,
} from "../construction/kernel/index.js";

/**
 * Geometry Generator — Seed of Life.
 * Rebuilds entirely from construction rules (no hard-coded coordinates).
 *
 * @param {number} radius shared sphere/circle radius `r`
 * @returns {import('../schema.js').ConstructionData}
 */
export function generateSeedOfLife(radius) {
  const rules = buildSeedOfLifeRules();
  const { data } = buildFromRules(rules, radius, {
    id: "seedOfLife",
    name: "Seed of Life",
  });
  return data;
}

/** @deprecated Angles are not used — Seed is constructed by compass rules. */
export const SEED_OUTER_ANGLES_DEG = Object.freeze([0, 60, 120, 180, 240, 300]);
