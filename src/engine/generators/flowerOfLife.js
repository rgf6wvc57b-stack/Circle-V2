import {
  buildFromRules,
  buildFlowerOfLifeRules,
  FLOWER_OF_LIFE_CENTER_IDS,
} from "../construction/kernel/index.js";

/**
 * Flower of Life — full hexagonal lattice (19 centers) from the canonical rules.
 * Pure math only; no hard-coded coordinates. Sole Flower center source.
 */
export function generateFlowerOfLife(radius) {
  const rules = buildFlowerOfLifeRules();
  const { data } = buildFromRules(rules, radius, {
    id: "flowerOfLife",
    name: "Flower of Life",
  });
  return data;
}

/**
 * Step filter / snapshot of the canonical 19-center history.
 * Not a separate Flower model — only a prefix of {@link buildFlowerOfLifeRules}.
 *
 * @param {number} radius
 * @param {{ sphereCount?: number }} [opts] omit for full 19; use 13 for mid-ring complete
 */
export function snapshotFlowerOfLifeHistory(radius, opts = {}) {
  const data = generateFlowerOfLife(radius);
  const sphereCount = opts.sphereCount;
  if (sphereCount == null || sphereCount >= data.sphereCenters.length) {
    return data;
  }
  const keep = new Set(
    data.sphereCenters.slice(0, sphereCount).map((s) => s.pointId)
  );
  return {
    ...data,
    points: data.points.filter((p) => keep.has(p.id)),
    sphereCenters: data.sphereCenters.filter((s) => keep.has(s.pointId)),
    circleCenters: data.circleCenters.filter((c) => keep.has(c.pointId)),
    edges: data.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    maxStep: sphereCount,
    meta: {
      ...(data.meta || {}),
      snapshotSphereCount: sphereCount,
      canonicalHistory: true,
    },
  };
}

/**
 * Canonical geometry fingerprint for Flower construction data.
 * Presentation (circle vs sphere renderer) must not change this value.
 */
export function flowerGeometryFingerprint(data) {
  const pointsById = new Map((data.points || []).map((p) => [p.id, p]));
  const centers = (data.sphereCenters || [])
    .map((s) => {
      const p = pointsById.get(s.pointId);
      return {
        id: s.pointId,
        sphereId: s.id,
        x: p?.x ?? null,
        y: p?.y ?? null,
        z: p?.z ?? 0,
        radius: s.radius,
        constructionStep: s.constructionStep ?? p?.step ?? null,
      };
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify({
    radius: data.radius,
    count: centers.length,
    centers,
  });
}

export { FLOWER_OF_LIFE_CENTER_IDS };
