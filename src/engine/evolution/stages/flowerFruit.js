/**
 * Flower of Life and Fruit of Life evolution stages.
 * Both rebuild from the construction kernel — no hard-coded centers.
 */
import { generateFlowerOfLife } from "../../generators/flowerOfLife.js";
import {
  buildFromRules,
  buildFruitOfLifeRules,
} from "../../construction/kernel/index.js";

/** Step 7 — Flower of Life (full hex packing from rules) */
export function buildFlowerOfLifeStage(radius) {
  const data = generateFlowerOfLife(radius);
  data.id = "evolution-flower";
  data.name = "Flower of Life";
  data.meta = { ...(data.meta || {}), evolution: true, stageId: "flower" };
  data.points.forEach((p) => {
    p.step = 1;
  });
  data.edges.forEach((e) => {
    e.step = 1;
  });
  data.maxStep = 1;
  return data;
}

/** Step 8 — Fruit of Life (13 spheres from Seed + outer tips) */
export function buildFruitOfLifeStage(radius) {
  const { data } = buildFromRules(buildFruitOfLifeRules(), radius, {
    id: "evolution-fruit",
    name: "Fruit of Life",
  });
  if (data.sphereCenters.length !== 13) {
    throw new Error(`Fruit of Life must have 13 spheres (got ${data.sphereCenters.length})`);
  }
  data.meta = { ...(data.meta || {}), evolution: true, stageId: "fruit" };
  return data;
}

/**
 * Fruit centers for dependent stages (Metatron / Platonics).
 * Computed via kernel rebuild — not closed-form angles.
 */
export function fruitCenters(r) {
  const { state } = buildFromRules(buildFruitOfLifeRules(), r, {
    id: "fruit",
    name: "Fruit of Life",
  });
  const seed = [
    state.points.get("seed-center"),
    ...Array.from({ length: 6 }, (_, i) => state.points.get(`seed-outer-${i}`)),
  ];
  const outer = Array.from({ length: 6 }, (_, i) =>
    state.points.get(`fruit-ring2-${i}`)
  );
  return { seed, outer };
}

export { buildSeedOfLifeStage } from "./earlySeed.js";
