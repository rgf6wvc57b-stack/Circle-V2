import { finalizePlan } from "./applyPlan.js";
import {
  buildFromRules,
  buildSeedOfLifeRules,
  buildFlowerOfLifeRules,
} from "./kernel/index.js";

/**
 * Classical Seed of Life compass plan — rebuilt from rule history.
 * Coordinates in operations are outputs of the kernel, never inputs.
 */
export function buildSeedOfLifeConstructionPlan(r) {
  const { plan } = buildFromRules(buildSeedOfLifeRules(), r, {
    id: "seedOfLife",
    name: "Seed of Life",
    originId: "seed-center",
  });
  return finalizePlan(plan);
}

/**
 * Flower of Life construction plan — canonical full 19-center history.
 * Construction Mode reveals this history incrementally (1 → 2 → … → 7 Seed →
 * 13 mid-ring → 19 complete). There is no separate 13-circle Flower model.
 */
export function buildFlowerOfLifeConstructionPlan(r) {
  const { plan } = buildFromRules(buildFlowerOfLifeRules(), r, {
    id: "flowerOfLife",
    name: "Flower of Life",
    originId: "seed-center",
  });
  return finalizePlan(plan);
}
