/**
 * Per-renderer-layer presentation styles (color / opacity / thickness / size).
 * Separate from activeRenderLayers visibility — toggling a layer never resets these.
 */

import { DEFAULT_SPHERE_COLOR, DEFAULT_SPHERE_OPACITY, clampOpacity } from "./sphereColorState.js";

/** @typedef {{ color: string, opacity: number, thickness?: number, size?: number }} LayerStyle */

/** Recommended defaults — spheres keep the soft yellow 45% look. */
export const DEFAULT_RENDER_LAYER_STYLES = Object.freeze({
  spheres: Object.freeze({
    color: DEFAULT_SPHERE_COLOR,
    opacity: DEFAULT_SPHERE_OPACITY,
  }),
  circles: Object.freeze({
    color: "#7FD6FF",
    opacity: 0.9,
    thickness: 1,
  }),
  points: Object.freeze({
    color: "#FFD166",
    opacity: 1,
    size: 1,
  }),
  connections: Object.freeze({
    color: "#7AE7C7",
    opacity: 0.9,
    thickness: 1,
  }),
});

const LAYER_IDS = Object.freeze(["spheres", "circles", "points", "connections"]);

function clampPositive(value, fallback = 1, min = 0.15, max = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeHex(hex, fallback) {
  if (typeof hex !== "string") return fallback;
  const t = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const r = t[1];
    const g = t[2];
    const b = t[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

/**
 * @returns {{
 *   spheres: LayerStyle,
 *   circles: LayerStyle,
 *   points: LayerStyle,
 *   connections: LayerStyle,
 * }}
 */
export function createRenderLayerStyles() {
  return {
    spheres: { ...DEFAULT_RENDER_LAYER_STYLES.spheres },
    circles: { ...DEFAULT_RENDER_LAYER_STYLES.circles },
    points: { ...DEFAULT_RENDER_LAYER_STYLES.points },
    connections: { ...DEFAULT_RENDER_LAYER_STYLES.connections },
  };
}

/** Reset Controls — restore every layer's visual defaults. */
export function resetRenderLayerStyles(styles) {
  const fresh = createRenderLayerStyles();
  for (const id of LAYER_IDS) {
    styles[id] = { ...fresh[id] };
  }
  return styles;
}

/**
 * @param {ReturnType<typeof createRenderLayerStyles>} styles
 * @param {string} layerId
 * @param {Partial<LayerStyle>} patch
 */
export function patchRenderLayerStyle(styles, layerId, patch) {
  if (!LAYER_IDS.includes(layerId) || !styles[layerId]) return styles[layerId];
  const base = DEFAULT_RENDER_LAYER_STYLES[layerId];
  const next = { ...styles[layerId] };
  if (patch.color != null) next.color = normalizeHex(patch.color, base.color);
  if (patch.opacity != null) next.opacity = clampOpacity(patch.opacity);
  if (patch.thickness != null && "thickness" in base) {
    next.thickness = clampPositive(patch.thickness, base.thickness);
  }
  if (patch.size != null && "size" in base) {
    next.size = clampPositive(patch.size, base.size);
  }
  styles[layerId] = next;
  return next;
}

export function getRenderLayerStyle(styles, layerId) {
  return styles?.[layerId] ? { ...styles[layerId] } : { ...DEFAULT_RENDER_LAYER_STYLES[layerId] };
}

/** Snapshot for tests / fingerprints (order-stable). */
export function snapshotRenderLayerStyles(styles) {
  const out = {};
  for (const id of LAYER_IDS) {
    const s = styles[id] || DEFAULT_RENDER_LAYER_STYLES[id];
    out[id] = {
      color: String(s.color).toUpperCase(),
      opacity: Number(s.opacity),
      ...(s.thickness != null ? { thickness: Number(s.thickness) } : {}),
      ...(s.size != null ? { size: Number(s.size) } : {}),
    };
  }
  return out;
}

export function listRenderLayerStyleIds() {
  return [...LAYER_IDS];
}
