/**
 * Equal-radius hexagonal lattice used by Flower of Life / Endless.
 *
 * Orientation: flat-neighbor on +X so ring-1 cell (q=1,r=0) sits at (radius, 0),
 * matching Seed / Flower `seed-outer-0`.
 *
 * Cube distance k = (|q| + |r| + |s|) / 2 with s = -q - r.
 * Centers with max ring R: N(R) = 1 + 3R(R+1)
 * Centers on ring k (k ≥ 1): 6k
 */

/** @typedef {{ q: number, r: number, s: number, ring: number }} HexCell */

/**
 * @param {number} rings inclusive max cube-distance ring (R ≥ 0)
 * @returns {number}
 */
export function hexLatticeCenterCount(rings) {
  const R = Math.max(0, Math.floor(rings));
  return 1 + 3 * R * (R + 1);
}

/**
 * @param {number} ring k ≥ 1
 * @returns {number}
 */
export function hexRingCenterCount(ring) {
  const k = Math.max(0, Math.floor(ring));
  return k === 0 ? 1 : 6 * k;
}

/**
 * Pointy-top axial → Cartesian with size = radius / √3 so (1,0) → (radius, 0).
 * @param {number} q
 * @param {number} rAx
 * @param {number} radius neighbor spacing / compass opening
 */
export function hexAxialToCartesian(q, rAx, radius) {
  const sqrt3 = Math.sqrt(3);
  const size = radius / sqrt3;
  const x = size * (sqrt3 * q + (sqrt3 / 2) * rAx);
  const y = size * ((3 / 2) * rAx);
  return { x, y, z: 0 };
}

/**
 * Cube / axial ring index.
 * @param {number} q
 * @param {number} rAx
 */
export function hexRingIndex(q, rAx) {
  const s = -q - rAx;
  return Math.max(Math.abs(q), Math.abs(rAx), Math.abs(s));
}

/**
 * All hex cells with cube distance ≤ rings, stable order:
 * ring ascending, then angle atan2(y,x) ascending (ties by q,r).
 * @param {number} rings
 * @returns {HexCell[]}
 */
export function listHexCells(rings) {
  const R = Math.max(0, Math.floor(rings));
  /** @type {HexCell[]} */
  const cells = [];
  for (let q = -R; q <= R; q += 1) {
    for (let rAx = -R; rAx <= R; rAx += 1) {
      const s = -q - rAx;
      const ring = Math.max(Math.abs(q), Math.abs(rAx), Math.abs(s));
      if (ring > R) continue;
      cells.push({ q, r: rAx, s, ring });
    }
  }
  return cells;
}

/**
 * Six axial neighbor offsets.
 */
export const HEX_NEIGHBOR_OFFSETS = Object.freeze([
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
]);

/**
 * Canonical Flower-of-Life IDs for the first two rings (19 centers).
 * Keys: "q,r"
 */
export const FOL_HEX_ID_BY_KEY = Object.freeze({
  "0,0": "seed-center",
  "1,0": "seed-outer-0",
  "0,1": "seed-outer-1",
  "-1,1": "seed-outer-2",
  "-1,0": "seed-outer-3",
  "0,-1": "seed-outer-4",
  "1,-1": "seed-outer-5",
  "1,1": "flower-mid-0",
  "-1,2": "flower-mid-1",
  "-2,1": "flower-mid-2",
  "-1,-1": "flower-mid-3",
  "1,-2": "flower-mid-4",
  "2,-1": "flower-mid-5",
  "2,0": "flower-tip-0",
  "0,2": "flower-tip-1",
  "-2,2": "flower-tip-2",
  "-2,0": "flower-tip-3",
  "0,-2": "flower-tip-4",
  "2,-2": "flower-tip-5",
});

/**
 * @param {number} q
 * @param {number} rAx
 * @returns {string}
 */
export function hexCellId(q, rAx) {
  const key = `${q},${rAx}`;
  if (Object.prototype.hasOwnProperty.call(FOL_HEX_ID_BY_KEY, key)) {
    return FOL_HEX_ID_BY_KEY[key];
  }
  return `endless-q${q}-r${rAx}`;
}

/**
 * Construction / reveal order: FoL canonical order for rings ≤ 2, then
 * remaining cells by ring, then angle.
 * @param {HexCell[]} cells
 * @param {number} radius
 * @returns {HexCell[]}
 */
export function orderHexCellsForConstruction(cells, radius) {
  const folOrder = [
    "seed-center",
    "seed-outer-0",
    "seed-outer-1",
    "seed-outer-2",
    "seed-outer-3",
    "seed-outer-4",
    "seed-outer-5",
    "flower-mid-0",
    "flower-mid-1",
    "flower-mid-2",
    "flower-mid-3",
    "flower-mid-4",
    "flower-mid-5",
    "flower-tip-0",
    "flower-tip-1",
    "flower-tip-2",
    "flower-tip-3",
    "flower-tip-4",
    "flower-tip-5",
  ];
  const folIndex = new Map(folOrder.map((id, i) => [id, i]));
  return [...cells].sort((a, b) => {
    const idA = hexCellId(a.q, a.r);
    const idB = hexCellId(b.q, b.r);
    const fa = folIndex.has(idA) ? folIndex.get(idA) : Infinity;
    const fb = folIndex.has(idB) ? folIndex.get(idB) : Infinity;
    if (fa !== Infinity || fb !== Infinity) {
      if (fa !== fb) return fa - fb;
    }
    if (a.ring !== b.ring) return a.ring - b.ring;
    const pa = hexAxialToCartesian(a.q, a.r, radius);
    const pb = hexAxialToCartesian(b.q, b.r, radius);
    const angA = Math.atan2(pa.y, pa.x);
    const angB = Math.atan2(pb.y, pb.x);
    if (angA !== angB) return angA - angB;
    if (a.q !== b.q) return a.q - b.q;
    return a.r - b.r;
  });
}
