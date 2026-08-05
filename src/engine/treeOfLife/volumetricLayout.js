/**
 * Volumetric 3D Tree of Life layout — explicit (x, y, z) node coordinates.
 * Preserves the canonical 10 Sephirot + 22-path graph; assigns depth across Z layers.
 */
import { buildTreeLayout } from "./layout.js";

/** Canonical layer index per Sephirah (0 = lowest / Malkuth world). */
const SEPHIRAH_LAYER_INDEX = Object.freeze({
  malkuth: 0,
  yesod: 0,
  netzach: 1,
  hod: 1,
  tiphereth: 2,
  chesed: 2,
  geburah: 2,
  chokmah: 3,
  binah: 3,
  kether: 4,
});

/**
 * @param {object} [opts]
 * @returns {{
 *   zSpacing: number,
 *   branchSpread: number,
 *   layers: number,
 *   sphereRadiusRatio: number,
 *   connectionThickness: number,
 *   variant: string,
 * }}
 */
export function normalizeVolumetricOpts(opts = {}) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    zSpacing: clamp(num(opts.zSpacing, 0.42), 0.15, 1.2),
    branchSpread: clamp(num(opts.branchSpread, 1.0), 0.45, 2.0),
    layers: Math.round(clamp(num(opts.layers, 5), 3, 8)),
    sphereRadiusRatio: clamp(num(opts.sphereRadiusRatio, 0.14), 0.06, 0.35),
    connectionThickness: clamp(num(opts.connectionThickness, 1.2), 0.3, 2.5),
    variant: typeof opts.variant === "string" && opts.variant ? opts.variant : "kircher",
  };
}

/**
 * Build a centered volumetric Tree layout with explicit Z depth per Sephirah.
 *
 * @param {number} radius Construction radius (overall scale)
 * @param {ReturnType<typeof normalizeVolumetricOpts>} [opts]
 */
export function buildVolumetricTreeLayout(radius, opts = {}) {
  const vol = normalizeVolumetricOpts(opts);
  const planar = buildTreeLayout(radius, {
    variant: vol.variant,
    sephiraRadiusRatio: vol.sphereRadiusRatio,
  });

  const maxLayer = vol.layers - 1;
  const sephirot = planar.sephirot.map((s) => {
    const rawLayer = SEPHIRAH_LAYER_INDEX[s.id] ?? 0;
    const layer = Math.round((rawLayer / 4) * maxLayer);
    const z = (layer - maxLayer / 2) * vol.zSpacing * radius;
    return {
      ...s,
      x: s.x * vol.branchSpread,
      y: s.y * vol.branchSpread,
      z,
      layer,
    };
  });

  const cx = sephirot.reduce((sum, p) => sum + p.x, 0) / sephirot.length;
  const cy = sephirot.reduce((sum, p) => sum + p.y, 0) / sephirot.length;
  const cz = sephirot.reduce((sum, p) => sum + p.z, 0) / sephirot.length;

  const centered = sephirot.map((s) => ({
    ...s,
    x: s.x - cx,
    y: s.y - cy,
    z: s.z - cz,
  }));

  const layerGroups = Array.from({ length: vol.layers }, () => []);
  centered.forEach((s) => {
    const idx = clamp(s.layer, 0, vol.layers - 1);
    layerGroups[idx].push(s);
  });

  const sphereRadius = radius * vol.sphereRadiusRatio;

  return {
    variant: planar.variant,
    sephirot: centered,
    paths: planar.paths,
    sephiraRadius: sphereRadius,
    zSpacing: vol.zSpacing,
    branchSpread: vol.branchSpread,
    layers: vol.layers,
    connectionThickness: vol.connectionThickness,
    layerGroups,
    origin: { x: 0, y: 0, z: 0 },
  };
}

/**
 * Z-axis statistics for volumetric node centers (Sephirot only).
 * @param {{ z: number }[]} sephirot
 */
export function volumetricZStats(sephirot) {
  const zValues = sephirot.map((s) => s.z);
  const min = Math.min(...zValues);
  const max = Math.max(...zValues);
  const distinct = [
    ...new Set(zValues.map((z) => Math.round(z * 1000) / 1000)),
  ].sort((a, b) => a - b);
  return {
    min,
    max,
    range: max - min,
    distinctLevels: distinct.length,
    distinctZ: distinct,
    zValues,
  };
}

/**
 * Non-empty Z layers mapped to 1-based construction steps (one layer per step).
 * @param {object[][]} layerGroups
 * @returns {{ layerIdx: number, step: number }[]}
 */
export function buildVolumetricLayerSteps(layerGroups) {
  const steps = [];
  layerGroups.forEach((nodes, layerIdx) => {
    if (!nodes.length) return;
    steps.push({ layerIdx, step: steps.length + 1 });
  });
  return steps;
}

/**
 * Map volumetric layer index → 1-based construction step.
 * @param {object[][]} layerGroups
 */
export function buildVolumetricLayerToStep(layerGroups) {
  const map = new Map();
  buildVolumetricLayerSteps(layerGroups).forEach(({ layerIdx, step }) => {
    map.set(layerIdx, step);
  });
  return map;
}

/** Count of active construction steps (non-empty layers only). */
export function countVolumetricConstructionSteps(layerGroups) {
  return buildVolumetricLayerSteps(layerGroups).length;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
