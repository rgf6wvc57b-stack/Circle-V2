import { generateSeedOfLife } from "./seedOfLife.js";
import { generateFlowerOfLife } from "./flowerOfLife.js";
import { generateEndlessGeometry } from "./endless.js";
import { generateMerkaba } from "./merkaba.js";
import { generateTesseract } from "./tesseract.js";
import { generateTreeOfLife } from "./treeOfLife.js";
import {
  generatePoint,
  generateSingleSphere,
  generateTwoIntersectingSpheres,
  generateCircle,
  generateSphere,
  generateVesicaPiscis,
} from "./primitives.js";
import { generateFruitOfLife } from "./fruitOfLife.js";
import { generateMetatronCube } from "./metatronCube.js";
import { generatePlatonicSolids } from "./platonicSolids.js";
import {
  listGeometriesByComplexity,
  listUiGeometryOptions,
  getGeometryDefinition,
} from "../geometries/catalog.js";

/**
 * Geometry Generator registry.
 * Each generator returns ConstructionData only — never meshes or materials.
 */
const GENERATORS = {
  point: generatePoint,
  circle: generateCircle,
  sphere: generateSphere,
  singleSphere: generateSingleSphere,
  twoIntersectingSpheres: generateTwoIntersectingSpheres,
  vesicaPiscis: generateVesicaPiscis,
  seedOfLife: generateSeedOfLife,
  flowerOfLife: generateFlowerOfLife,
  endless: generateEndlessGeometry,
  fruitOfLife: generateFruitOfLife,
  metatronCube: generateMetatronCube,
  treeOfLife: generateTreeOfLife,
  platonicSolids: generatePlatonicSolids,
  tesseract: generateTesseract,
  // Kept for tests / evolution; not listed in complexity catalog UI
  merkaba: generateMerkaba,
};

/** All registered geometry ids (includes menu-hidden primitives). */
export function listGeometries() {
  return listGeometriesByComplexity().map((g) => g.id);
}

/** Geometry dropdown options only (excludes Point / Circle / Sphere). */
export function listGeometryOptions() {
  return listUiGeometryOptions();
}

export { getGeometryDefinition, listGeometriesByComplexity, listUiGeometryOptions };

/**
 * @param {string} id
 * @param {number} radius
 * @param {object} [opts]
 */
export function generateGeometry(id, radius, opts = {}) {
  const fn = GENERATORS[id];
  if (!fn) {
    throw new Error(`Unknown geometry generator: ${id}`);
  }
  if (id === "treeOfLife" || id === "endless") {
    return fn(radius, opts);
  }
  return fn(radius);
}

export {
  generatePoint,
  generateSingleSphere,
  generateTwoIntersectingSpheres,
  generateCircle,
  generateSphere,
  generateVesicaPiscis,
  generateSeedOfLife,
  generateFlowerOfLife,
  generateEndlessGeometry,
  generateFruitOfLife,
  generateMetatronCube,
  generatePlatonicSolids,
  generateMerkaba,
  generateTesseract,
  generateTreeOfLife,
};
