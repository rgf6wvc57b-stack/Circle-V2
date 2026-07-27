/**
 * Synthesize a ConstructionPlayer plan from ConstructionData.
 * Coordinates are taken from generator output (already constructed).
 */
import { finalizePlan } from "./applyPlan.js";

export function dataToPlan(data, { originId } = {}) {
  const operations = [];
  const origin =
    originId ||
    data.points.find((p) => p.meta?.role === "origin")?.id ||
    data.points[0]?.id ||
    "origin";

  const pointIds = new Set();
  data.points.forEach((p) => {
    pointIds.add(p.id);
    operations.push({
      type: "placePoint",
      pointId: p.id,
      point: { x: p.x, y: p.y, z: p.z ?? 0 },
      label: p.label ?? p.id,
      justification: p.justification ?? `Place ${p.id}.`,
      determinedBy: p.determinedBy ?? { kind: "fromGenerator", role: p.meta?.role },
    });
  });

  data.sphereCenters.forEach((s) => {
    const p = data.points.find((pt) => pt.id === s.pointId);
    operations.push({
      type: "drawSphere",
      sphereId: s.id,
      centerId: s.pointId,
      pointId: s.pointId,
      radius: s.radius,
      justification: s.justification ?? `Draw sphere at ${s.pointId}.`,
      center: p ? { x: p.x, y: p.y, z: p.z ?? 0 } : { x: 0, y: 0, z: 0 },
    });
  });

  data.edges?.forEach((e) => {
    if (!pointIds.has(e.from) || !pointIds.has(e.to)) return;
    operations.push({
      type: "addEdge",
      edgeId: e.id,
      from: e.from,
      to: e.to,
      label: e.label,
      meta: e.meta,
    });
  });

  return finalizePlan({
    id: data.id,
    name: data.name,
    radius: data.radius,
    originId: origin,
    operations,
  });
}
