/**
 * Apply any compass construction plan up to operation index `endIndex` (inclusive).
 * Produces ConstructionData for the renderer — no interpolation of centers.
 */
function layerStepAtOp(plan, opIndex) {
  const ends = plan.layerEndOpIndices;
  if (!ends?.length) return 1;
  for (let layer = 0; layer < ends.length; layer += 1) {
    if (opIndex <= ends[layer]) return layer + 1;
  }
  return ends.length;
}

export function applyConstructionPlan(plan, endIndex) {
  const points = [];
  const sphereCenters = [];
  const circleCenters = [];
  const edges = [];
  const faces = [];
  const pointById = new Map();

  const end = Math.max(-1, Math.min(endIndex, plan.operations.length - 1));
  const useLayerSteps = plan.stepKind === "layer";
  const omitCircleCenters = useLayerSteps;

  for (let i = 0; i <= end; i += 1) {
    const op = plan.operations[i];
    if (op.type === "placePoint") {
      const role = op.determinedBy?.role;
      const p = {
        id: op.pointId,
        x: op.point.x,
        y: op.point.y,
        z: op.point.z,
        label: op.label ?? op.pointId,
        step: useLayerSteps ? layerStepAtOp(plan, i) : points.length + 1,
        justification: op.justification,
        determinedBy: op.determinedBy,
        meta: role
          ? {
              role,
              sephirahNumber: op.determinedBy?.number,
              q: op.determinedBy?.q,
              r: op.determinedBy?.r,
            }
          : undefined,
      };
      points.push(p);
      pointById.set(p.id, p);
    }
    if (op.type === "drawSphere") {
      const centerPoint = pointById.get(op.centerId);
      const constructionStep = useLayerSteps
        ? layerStepAtOp(plan, i)
        : centerPoint?.step ?? sphereCenters.length + 1;
      sphereCenters.push({
        id: op.sphereId,
        pointId: op.centerId,
        radius: op.radius,
        constructionStep,
        justification: op.justification,
      });
      if (!omitCircleCenters) {
        circleCenters.push({
          id: `circle-${op.centerId}`,
          pointId: op.centerId,
          radius: op.radius,
          normal: op.normal ?? [0, 0, 1],
          constructionStep,
          justification: op.justification,
        });
      }
    }
    if (op.type === "addEdge" && pointById.has(op.from) && pointById.has(op.to)) {
      edges.push({
        id: op.edgeId ?? `edge-${op.from}-${op.to}`,
        from: op.from,
        to: op.to,
        step: useLayerSteps ? layerStepAtOp(plan, i) : sphereCenters.length,
        label: op.label,
        meta: op.meta,
      });
    }
    if (op.type === "addFace") {
      if (op.pointIds.every((id) => pointById.has(id))) {
        faces.push({
          id: op.faceId ?? `face-${faces.length}`,
          pointIds: [...op.pointIds],
          step: useLayerSteps ? layerStepAtOp(plan, i) : sphereCenters.length,
        });
      }
    }
  }

  // Default radial edges from origin when present
  const origin = pointById.get(plan.originId ?? "origin") ?? pointById.get("seed-center");
  if (origin && edges.length === 0) {
    points.forEach((p) => {
      if (p.id === origin.id) return;
      if (!sphereCenters.some((s) => s.pointId === p.id)) return;
      edges.push({
        id: `edge-${origin.id}-${p.id}`,
        from: origin.id,
        to: p.id,
        step: p.step,
      });
    });
  }

  return {
    id: plan.id,
    name: plan.name,
    radius: plan.radius,
    points,
    sphereCenters,
    circleCenters,
    edges,
    faces,
    maxStep: plan.sphereCount,
    meta: {
      constructionMode: true,
      completedSpheres: sphereCenters.length,
      planId: plan.id,
    },
  };
}

export function finalizePlan(plan) {
  const sphereOps = plan.operations.filter((op) => op.type === "drawSphere");
  plan.sphereCount = sphereOps.length;
  plan.operationIndexForSphereCount = (count) => {
    if (count <= 0) return -1;
    let seen = 0;
    for (let i = 0; i < plan.operations.length; i += 1) {
      if (plan.operations[i].type === "drawSphere") {
        seen += 1;
        if (seen >= count) return i;
      }
    }
    return plan.operations.length - 1;
  };
  return plan;
}

/**
 * Finalize a plan whose construction steps are full Z-depth layers (not per-sphere).
 * @param {object} plan
 * @param {number[]} layerEndOpIndices last operation index per layer step
 */
export function finalizeLayerPlan(plan, layerEndOpIndices) {
  plan.sphereCount = layerEndOpIndices.length;
  plan.stepKind = "layer";
  plan.layerEndOpIndices = layerEndOpIndices;
  plan.operationIndexForSphereCount = (count) => {
    if (count <= 0) return -1;
    const idx = Math.min(count, layerEndOpIndices.length) - 1;
    return layerEndOpIndices[idx];
  };
  return plan;
}
