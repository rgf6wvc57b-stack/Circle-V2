/**
 * User-facing Renderer layers — independent, order-independent presentation toggles.
 * Legacy single-mode strings (spheres / circles / mixed / …) coerce into layer sets.
 */

/** @typedef {"spheres" | "circles" | "points" | "connections"} RenderLayerId */
/** @typedef {{ id: RenderLayerId, label: string }} UiRenderLayerOption */

/** Canonical layer ids (order-independent set membership). */
export const RENDER_LAYERS = Object.freeze({
  spheres: "spheres",
  circles: "circles",
  points: "points",
  connections: "connections",
});

/** Stable draw order — selection order must never change this. */
export const RENDER_LAYER_DRAW_ORDER = Object.freeze([
  RENDER_LAYERS.spheres,
  RENDER_LAYERS.circles,
  RENDER_LAYERS.connections,
  RENDER_LAYERS.points,
]);

/** Default appearance: Solid Spheres only. */
export const DEFAULT_ACTIVE_RENDER_LAYERS = Object.freeze([RENDER_LAYERS.spheres]);

/** Layers that render visible Volumetric Tree geometry (no circle overlays). */
export const VOLUMETRIC_TREE_VISIBLE_LAYERS = Object.freeze([
  RENDER_LAYERS.spheres,
  RENDER_LAYERS.connections,
]);

/** Safe default when the current selection cannot show a Volumetric Tree. */
export const VOLUMETRIC_TREE_DEFAULT_LAYERS = Object.freeze([
  RENDER_LAYERS.spheres,
  RENDER_LAYERS.connections,
]);

/** @type {readonly UiRenderLayerOption[]} */
export const UI_RENDER_LAYER_OPTIONS = Object.freeze([
  { id: RENDER_LAYERS.spheres, label: "Solid Spheres" },
  { id: RENDER_LAYERS.circles, label: "Circle Outlines" },
  { id: RENDER_LAYERS.points, label: "Point Markers" },
  { id: RENDER_LAYERS.connections, label: "Connection Lines" },
]);

const LAYER_IDS = new Set(UI_RENDER_LAYER_OPTIONS.map((o) => o.id));
const LABEL_BY_ID = Object.fromEntries(UI_RENDER_LAYER_OPTIONS.map((o) => [o.id, o.label]));

/** Modes removed from the Renderer control (code may still exist as specialty paths). */
export const HIDDEN_RENDER_MODES = Object.freeze([
  "constructionPlane",
  "traditionalTreeOfLife",
  "geometricTreeOfLife",
]);

/** @deprecated Use UI_RENDER_LAYER_OPTIONS — kept for older test imports. */
export const UI_RENDER_MODE_OPTIONS = UI_RENDER_LAYER_OPTIONS;

/**
 * Backward-compat map: legacy renderMode string → layer set.
 * Also accepts modern layer ids and aliases.
 */
const LEGACY_MODE_TO_LAYERS = Object.freeze({
  spheres: [RENDER_LAYERS.spheres],
  circles: [RENDER_LAYERS.circles],
  circleOutlines: [RENDER_LAYERS.circles],
  points: [RENDER_LAYERS.points],
  lines: [RENDER_LAYERS.connections],
  edges: [RENDER_LAYERS.connections],
  connectionLines: [RENDER_LAYERS.connections],
  connections: [RENDER_LAYERS.connections],
  mixed: [
    RENDER_LAYERS.spheres,
    RENDER_LAYERS.circles,
    RENDER_LAYERS.points,
    RENDER_LAYERS.connections,
  ],
});

export function listUiRenderLayerOptions() {
  return [...UI_RENDER_LAYER_OPTIONS];
}

/** @deprecated Prefer listUiRenderLayerOptions */
export function listUiRenderModeOptions() {
  return listUiRenderLayerOptions();
}

export function isRenderLayerId(id) {
  return LAYER_IDS.has(id);
}

/** True for a layer id or a known legacy single-mode string (including mixed). */
export function isUiRenderMode(mode) {
  return LAYER_IDS.has(mode) || Object.prototype.hasOwnProperty.call(LEGACY_MODE_TO_LAYERS, mode);
}

/**
 * Normalize any input into a sorted unique layer array (canonical form).
 * @param {Iterable<string> | string | null | undefined} input
 * @param {readonly string[]} [fallback]
 * @returns {string[]}
 */
export function normalizeRenderLayers(input, fallback = DEFAULT_ACTIVE_RENDER_LAYERS) {
  if (input == null) return [...fallback];
  if (typeof input === "string") {
    return layersFromLegacyMode(input, fallback);
  }
  const out = new Set();
  for (const raw of input) {
    if (LAYER_IDS.has(raw)) out.add(raw);
    else if (Object.prototype.hasOwnProperty.call(LEGACY_MODE_TO_LAYERS, raw)) {
      for (const id of LEGACY_MODE_TO_LAYERS[raw]) out.add(id);
    }
  }
  if (out.size === 0 && fallback?.length) return [...fallback];
  return RENDER_LAYER_DRAW_ORDER.filter((id) => out.has(id));
}

/**
 * @param {string} mode
 * @param {readonly string[]} [fallback]
 * @returns {string[]}
 */
export function layersFromLegacyMode(mode, fallback = DEFAULT_ACTIVE_RENDER_LAYERS) {
  if (LAYER_IDS.has(mode)) return [mode];
  if (Object.prototype.hasOwnProperty.call(LEGACY_MODE_TO_LAYERS, mode)) {
    return [...LEGACY_MODE_TO_LAYERS[mode]];
  }
  return normalizeRenderLayers(fallback, DEFAULT_ACTIVE_RENDER_LAYERS);
}

/**
 * Derive a legacy single-mode label for evolution / older APIs.
 * One layer → that id; all four → "mixed"; otherwise "mixed" when ≥2, or first layer.
 */
export function legacyModeFromLayers(layers) {
  const list = normalizeRenderLayers(layers, []);
  if (list.length === 0) return "spheres";
  if (list.length === 1) return list[0] === "connections" ? "lines" : list[0];
  if (list.length === 4) return "mixed";
  return "mixed";
}

/** Coerce any mode to a legacy single-mode label (compat for evolution / older calls). */
export function coerceToUiRenderMode(mode, fallback = "spheres") {
  const layers = layersFromLegacyMode(mode, layersFromLegacyMode(fallback));
  return legacyModeFromLayers(layers);
}

export function layersEqual(a, b) {
  const aa = normalizeRenderLayers(a, []);
  const bb = normalizeRenderLayers(b, []);
  if (aa.length !== bb.length) return false;
  return aa.every((id, i) => id === bb[i]);
}

/**
 * Closed-control summary text.
 * @param {Iterable<string>} layers
 */
export function summarizeRenderLayers(layers) {
  const list = normalizeRenderLayers(layers, []);
  if (list.length === 0) return "No layers";
  if (list.length === 4) return "All layers";
  if (list.length === 1) return LABEL_BY_ID[list[0]] || list[0];
  if (list.length === 3) return "3 layers active";
  // pairs — short friendly labels
  const short = {
    spheres: "Spheres",
    circles: "Circles",
    points: "Points",
    connections: "Lines",
  };
  return list.map((id) => short[id] || id).join(" + ");
}

export function labelForRenderLayer(id) {
  return LABEL_BY_ID[id] || id;
}

/**
 * Ensure a Volumetric Tree layer selection can render visible geometry.
 * Drops circle overlays (no circle centers in volumetric data) and adds
 * spheres + connections when the remaining selection would be empty.
 * @param {Iterable<string> | string | null | undefined} layers
 * @returns {string[]}
 */
export function ensureVolumetricTreeRenderLayers(layers) {
  const normalized = normalizeRenderLayers(layers, []);
  const withoutCircles = normalized.filter((id) => id !== RENDER_LAYERS.circles);
  const hasVisibleTreeGeometry = withoutCircles.some((id) =>
    VOLUMETRIC_TREE_VISIBLE_LAYERS.includes(id)
  );
  if (hasVisibleTreeGeometry) return withoutCircles;
  return [...VOLUMETRIC_TREE_DEFAULT_LAYERS];
}
