import { buildSeedOfLifeConstructionPlan, buildFlowerOfLifeConstructionPlan } from "./seedOfLifePlan.js";
import { buildMerkabaConstructionPlan } from "./merkabaPlan.js";
import { buildTesseractConstructionPlan } from "./tesseractPlan.js";
import { buildTreeOfLifeConstructionPlan } from "./treeOfLifePlan.js";
import { applyConstructionPlan } from "./applyPlan.js";
import { dataToPlan } from "./dataToPlan.js";
import { generateGeometry } from "../generators/index.js";
import { buildFromRules, buildFruitOfLifeRules } from "./kernel/index.js";

function planFromGenerator(id, radius, opts = {}) {
  return dataToPlan(generateGeometry(id, radius, opts));
}

const BUILDERS = {
  point: (r) => planFromGenerator("point", r),
  circle: (r) => planFromGenerator("circle", r),
  sphere: (r) => planFromGenerator("sphere", r),
  concentricShells: (r, opts = {}) => planFromGenerator("concentricShells", r, opts),
  vesicaPiscis: (r) => planFromGenerator("vesicaPiscis", r),
  seedOfLife: buildSeedOfLifeConstructionPlan,
  flowerOfLife: buildFlowerOfLifeConstructionPlan,
  endless: (r, opts = {}) => planFromGenerator("endless", r, opts),
  fruitOfLife: (r) => {
    const { plan } = buildFromRules(buildFruitOfLifeRules(), r, {
      id: "fruitOfLife",
      name: "Fruit of Life",
      originId: "seed-center",
    });
    return plan;
  },
  metatronCube: (r) => planFromGenerator("metatronCube", r),
  platonicSolids: (r) => planFromGenerator("platonicSolids", r),
  merkaba: buildMerkabaConstructionPlan,
  tesseract: buildTesseractConstructionPlan,
  treeOfLife: buildTreeOfLifeConstructionPlan,
};

/**
 * @param {string} geometryId
 * @param {number} radius
 * @param {object} [opts]
 */
export function buildConstructionPlan(geometryId, radius, opts = {}) {
  const fn = BUILDERS[geometryId];
  if (!fn) {
    throw new Error(`No construction plan for geometry: ${geometryId}`);
  }
  if (
    geometryId === "treeOfLife" ||
    geometryId === "endless" ||
    geometryId === "concentricShells"
  ) {
    return fn(radius, opts);
  }
  return fn(radius);
}

export {
  applyConstructionPlan,
  buildSeedOfLifeConstructionPlan,
  buildFlowerOfLifeConstructionPlan,
  buildMerkabaConstructionPlan,
  buildTesseractConstructionPlan,
  buildTreeOfLifeConstructionPlan,
};
