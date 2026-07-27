import { createEmptyConstruction } from "../schema.js";

/**
 * Helpers for evolution snapshots — every object is immediately visible (step 1).
 */

export function snapshot(id, name, radius) {
  const data = createEmptyConstruction(id, name, radius);
  data.meta = { evolution: true, stageId: id };
  data.maxStep = 1;
  return data;
}

export function addPoint(data, { id, x, y, z = 0, label, meta }) {
  data.points.push({
    id,
    x,
    y,
    z,
    label,
    step: 1,
    meta,
  });
}

export function addSphereAt(data, pointId, radius, { sphereId, circleId } = {}) {
  const sid = sphereId ?? `sphere-${pointId}`;
  const cid = circleId ?? `circle-${pointId}`;
  data.sphereCenters.push({ id: sid, pointId, radius });
  data.circleCenters.push({
    id: cid,
    pointId,
    radius,
    normal: [0, 0, 1],
  });
  return { sphereId: sid, circleId: cid };
}

export function addEdge(data, { id, from, to, label, meta }) {
  data.edges.push({
    id,
    from,
    to,
    step: 1,
    label,
    meta,
  });
}

export function addFace(data, { id, pointIds }) {
  data.faces.push({
    id,
    pointIds: [...pointIds],
    step: 1,
  });
}

/** Collect object ids for highlight-diffing. */
export function collectObjectIds(data) {
  if (!data) return new Set();
  const ids = new Set();
  data.points?.forEach((p) => ids.add(p.id));
  data.sphereCenters?.forEach((s) => ids.add(s.id));
  data.circleCenters?.forEach((c) => ids.add(c.id));
  data.edges?.forEach((e) => ids.add(e.id));
  data.faces?.forEach((f) => ids.add(f.id));
  return ids;
}

export function diffNewIds(prev, next) {
  const a = collectObjectIds(prev);
  const b = collectObjectIds(next);
  const added = [];
  b.forEach((id) => {
    if (!a.has(id)) added.push(id);
  });
  return added;
}
