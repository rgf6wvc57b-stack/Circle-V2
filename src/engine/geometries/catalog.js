/**
 * Geometry catalog — explicit complexity ordering (not alphabetical).
 * Future geometries register here with a complexity level to sort correctly.
 *
 * Point / Circle / Sphere remain registered for generators, renderers, Evolution,
 * and constructions, but are hidden from the Geometry dropdown
 * (`showInGeometryMenu: false`).
 */

/** @typedef {{
 * id: string,
 * label: string,
 * complexity: number,
 * defaultRenderer: string,
 * sphereBased: boolean,
 * showInGeometryMenu?: boolean,
 * }} GeometryDefinition */

/** Default Geometry dropdown selection (must be menu-visible). */
export const DEFAULT_UI_GEOMETRY_ID = "vesicaPiscis";

/** @type {GeometryDefinition[]} */
export const GEOMETRY_CATALOG = Object.freeze([
  {
    id: "point",
    label: "Point",
    complexity: 10,
    defaultRenderer: "points",
    sphereBased: false,
    showInGeometryMenu: false,
  },
  {
    id: "circle",
    label: "Circle",
    complexity: 20,
    defaultRenderer: "circles",
    sphereBased: false,
    showInGeometryMenu: false,
  },
  {
    id: "sphere",
    label: "Sphere",
    complexity: 30,
    defaultRenderer: "spheres",
    sphereBased: true,
    showInGeometryMenu: false,
  },
  {
    id: "singleSphere",
    label: "Single Sphere",
    complexity: 35,
    defaultRenderer: "spheres",
    sphereBased: true,
    showInGeometryMenu: true,
  },
  {
    id: "twoIntersectingSpheres",
    label: "Two Intersecting Spheres",
    complexity: 38,
    defaultRenderer: "spheres",
    sphereBased: true,
    showInGeometryMenu: true,
  },
  {
    id: "vesicaPiscis",
    label: "Vesica Piscis",
    complexity: 40,
    defaultRenderer: "spheres",
    sphereBased: true,
    showInGeometryMenu: true,
  },
  {
    id: "seedOfLife",
    label: "Seed of Life",
    complexity: 50,
    defaultRenderer: "spheres",
    sphereBased: true,
    showInGeometryMenu: true,
  },
  {
    id: "flowerOfLife",
    label: "Flower of Life",
    complexity: 60,
    defaultRenderer: "spheres",
    sphereBased: true,
    showInGeometryMenu: true,
  },
  {
    id: "endless",
    label: "Endless",
    complexity: 65,
    defaultRenderer: "spheres",
    sphereBased: true,
    showInGeometryMenu: true,
  },
  {
    id: "fruitOfLife",
    label: "Fruit of Life",
    complexity: 70,
    defaultRenderer: "spheres",
    sphereBased: true,
    showInGeometryMenu: true,
  },
  {
    id: "metatronCube",
    label: "Metatron's Cube",
    complexity: 80,
    defaultRenderer: "spheres",
    sphereBased: true,
    showInGeometryMenu: true,
  },
  {
    id: "treeOfLife",
    label: "Tree of Life",
    complexity: 90,
    /** Visible renderer — Tree view mode still drives geometry (Traditional/Spatial/Geometric). */
    defaultRenderer: "mixed",
    sphereBased: true,
    showInGeometryMenu: true,
  },
  {
    id: "platonicSolids",
    label: "Platonic Solids",
    complexity: 100,
    defaultRenderer: "spheres",
    sphereBased: true,
    showInGeometryMenu: true,
  },
  {
    id: "tesseract",
    label: "Tesseract",
    complexity: 110,
    defaultRenderer: "spheres",
    sphereBased: true,
    showInGeometryMenu: true,
  },
]);

const BY_ID = new Map(GEOMETRY_CATALOG.map((g) => [g.id, g]));

function isMenuVisible(def) {
  return def.showInGeometryMenu !== false;
}

/** All catalog geometries sorted by complexity (includes menu-hidden primitives). */
export function listGeometriesByComplexity() {
  return [...GEOMETRY_CATALOG].sort((a, b) => a.complexity - b.complexity);
}

/** User-facing Geometry dropdown entries only, simplest → most complex. */
export function listUiGeometryOptions() {
  return listGeometriesByComplexity().filter(isMenuVisible);
}

export function getGeometryDefinition(id) {
  return BY_ID.get(id) ?? null;
}

export function defaultRendererFor(id) {
  const def = getGeometryDefinition(id);
  if (!def) return "spheres";
  return def.defaultRenderer;
}

/**
 * True when a *menu-visible* render mode / layer set is usable for the geometry.
 * Hidden legacy modes are not treated as session-compatible defaults.
 * Accepts a legacy mode string or an iterable of layer ids.
 */
export function isRendererCompatible(geometryId, renderModeOrLayers) {
  const def = getGeometryDefinition(geometryId);
  if (!def) return true;
  const uiModes = ["spheres", "circles", "points", "lines", "connections", "mixed"];
  const asList = Array.isArray(renderModeOrLayers)
    ? renderModeOrLayers
    : typeof renderModeOrLayers === "string"
    ? [renderModeOrLayers]
    : renderModeOrLayers && typeof renderModeOrLayers[Symbol.iterator] === "function"
    ? [...renderModeOrLayers]
    : [];
  if (asList.length === 0) return true;
  for (const item of asList) {
    if (!uiModes.includes(item)) return false;
  }
  if (def.sphereBased) return true;
  if (geometryId === "point") {
    return asList.every((m) => ["points", "mixed"].includes(m));
  }
  if (geometryId === "circle") {
    return asList.every((m) => ["circles", "points", "mixed", "connections", "lines"].includes(m));
  }
  return true;
}

/** Default layer set for a geometry (from catalog defaultRenderer string). */
export function defaultRenderLayersFor(id) {
  const mode = defaultRendererFor(id);
  if (mode === "mixed") {
    return ["spheres", "circles", "points", "connections"];
  }
  if (mode === "lines") return ["connections"];
  if (mode === "circles" || mode === "points" || mode === "spheres") return [mode];
  return ["spheres"];
}
