import {
  FOL_HEX_ID_BY_KEY,
  HEX_NEIGHBOR_OFFSETS,
  hexAxialToCartesian,
  hexCellId,
  hexLatticeCenterCount,
  hexRingCenterCount,
  listHexCells,
  orderHexCellsForConstruction,
} from "../math/hexLattice.js";

/** Safe browser limits for Endless expansion. */
export const ENDLESS_MIN_RINGS = 1;
export const ENDLESS_DEFAULT_RINGS = 4;
export const ENDLESS_MAX_RINGS = 8;

/**
 * @param {number} rings
 * @returns {number}
 */
export function clampEndlessRings(rings) {
  const n = Math.round(Number(rings));
  if (!Number.isFinite(n)) return ENDLESS_DEFAULT_RINGS;
  return Math.min(ENDLESS_MAX_RINGS, Math.max(ENDLESS_MIN_RINGS, n));
}

/**
 * Visible expansion depth (ring scrubber), clamped to [1, rings].
 * @param {number} step
 * @param {number} rings
 */
export function clampEndlessExpansionStep(step, rings) {
  const R = clampEndlessRings(rings);
  const s = Math.round(Number(step));
  if (!Number.isFinite(s)) return R;
  return Math.min(R, Math.max(1, s));
}

/**
 * Endless — Flower-of-Life hexagonal lattice expanded ring-by-ring.
 *
 * rings=2 reproduces the canonical Flower of Life (19 centers, same IDs/coords).
 * Higher rings continue the same equal-radius lattice outward.
 *
 * @param {number} radius
 * @param {{ rings?: number, expansionStep?: number }} [opts]
 */
export function generateEndlessGeometry(radius, opts = {}) {
  const rings = clampEndlessRings(opts.rings ?? ENDLESS_DEFAULT_RINGS);
  const expansionStep = clampEndlessExpansionStep(
    opts.expansionStep ?? rings,
    rings
  );
  const r = Number(radius);
  if (!Number.isFinite(r) || r <= 0) {
    throw new Error(`Endless geometry requires a positive radius (got ${radius})`);
  }

  const allCells = listHexCells(rings);
  const ordered = orderHexCellsForConstruction(allCells, r);
  const visible = ordered.filter((c) => c.ring <= expansionStep);

  const points = [];
  const sphereCenters = [];
  const circleCenters = [];
  const idToCell = new Map();

  visible.forEach((cell, index) => {
    const id = hexCellId(cell.q, cell.r);
    const { x, y, z } = hexAxialToCartesian(cell.q, cell.r, r);
    const step = index + 1;
    idToCell.set(id, cell);
    points.push({
      id,
      x,
      y,
      z,
      label: id,
      step,
      meta: {
        role: cell.ring === 0 ? "center" : "lattice",
        hex: { q: cell.q, r: cell.r, s: cell.s, ring: cell.ring },
        endlessRing: cell.ring,
      },
    });
    sphereCenters.push({
      id: `sphere-${id}`,
      pointId: id,
      radius: r,
      constructionStep: step,
      meta: { hexRing: cell.ring },
    });
    circleCenters.push({
      id: `circle-${id}`,
      pointId: id,
      radius: r,
      constructionStep: step,
      meta: { hexRing: cell.ring },
    });
  });

  const visibleIds = new Set(points.map((p) => p.id));
  const edges = [];
  const edgeKeys = new Set();
  for (const p of points) {
    const cell = idToCell.get(p.id);
    if (!cell) continue;
    for (const [dq, dr] of HEX_NEIGHBOR_OFFSETS) {
      const nq = cell.q + dq;
      const nr = cell.r + dr;
      const nid = hexCellId(nq, nr);
      if (!visibleIds.has(nid)) continue;
      const a = p.id;
      const b = nid;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({
        id: `edge-${a}-${b}`,
        from: a,
        to: b,
        step: Math.max(p.step, points.find((x) => x.id === b)?.step ?? p.step),
        meta: { kind: "latticeNeighbor" },
      });
    }
  }

  return {
    id: "endless",
    name: "Endless",
    radius: r,
    points,
    sphereCenters,
    circleCenters,
    edges,
    faces: [],
    maxStep: sphereCenters.length,
    meta: {
      endless: true,
      rings,
      expansionStep,
      lattice: "flowerOfLifeHex",
      centerCountFormula: "1 + 3R(R+1)",
      centersAtMaxRings: hexLatticeCenterCount(rings),
      centersVisible: sphereCenters.length,
      folParityRings: 2,
    },
  };
}

export {
  hexLatticeCenterCount,
  hexRingCenterCount,
  FOL_HEX_ID_BY_KEY,
};
