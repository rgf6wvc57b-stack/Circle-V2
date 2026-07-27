import { dist, vec } from "./compass.js";
import { finalizePlan } from "./applyPlan.js";

/**
 * Tesseract construction plan.
 * Starts with origin sphere, then places the 16 projected 4-cube vertices one at a time.
 * Each vertex coordinate is an exact perspective projection of a Boolean 4D hypercube corner.
 */
export function buildTesseractConstructionPlan(r) {
  const operations = [];
  const origin = vec(0, 0, 0);
  const distance = 3;
  const scale = r * 0.7;

  operations.push({
    type: "placePoint",
    pointId: "tess-origin",
    point: origin,
    label: "origin",
    justification: "Choose initial center O at the world origin.",
    determinedBy: { kind: "freeChoice", role: "origin" },
  });
  operations.push({
    type: "drawSphere",
    sphereId: "sphere-tess-origin",
    centerId: "tess-origin",
    pointId: "tess-origin",
    radius: r,
    justification: "Compass at O — draw the first sphere.",
    center: origin,
  });

  const verts4 = [];
  for (let i = 0; i < 16; i += 1) {
    verts4.push([
      i & 1 ? 1 : -1,
      i & 2 ? 1 : -1,
      i & 4 ? 1 : -1,
      i & 8 ? 1 : -1,
    ]);
  }

  const projected = verts4.map(([x, y, z, w], i) => {
    const p = 1 / (distance - w);
    const point = vec(x * p * scale, y * p * scale, z * p * scale);
    return { i, point, x4: [x, y, z, w], p };
  });

  projected.forEach(({ i, point, x4, p }) => {
    const id = `tess-${i}`;
    operations.push({
      type: "placePoint",
      pointId: id,
      point,
      label: `v${i}`,
      justification: `4-cube vertex (${x4.join(",")}) with perspective projection p = 1/(${distance}−w).`,
      determinedBy: {
        kind: "hypercubePerspectiveProjection",
        vertex4: x4,
        distance,
        scale,
        factor: p,
      },
    });
    const nodeR = r * 0.08;
    operations.push({
      type: "drawSphere",
      sphereId: `sphere-${id}`,
      centerId: id,
      pointId: id,
      radius: nodeR,
      justification: `Draw construction sphere at projected vertex ${i}.`,
      center: point,
      normal: [0, 1, 0],
    });
  });

  for (let i = 0; i < 16; i += 1) {
    for (let bit = 0; bit < 4; bit += 1) {
      const j = i ^ (1 << bit);
      if (i < j) {
        operations.push({
          type: "addEdge",
          edgeId: `tess-edge-${i}-${j}`,
          from: `tess-${i}`,
          to: `tess-${j}`,
        });
      }
    }
  }

  // Sanity: projections are finite and distinct from origin for all 16
  projected.forEach(({ point, i }) => {
    if (!Number.isFinite(point.x + point.y + point.z)) {
      throw new Error(`Tesseract vertex ${i} is not finite`);
    }
    if (dist(point, origin) < 1e-9) {
      throw new Error(`Tesseract vertex ${i} collapsed onto the origin`);
    }
  });

  return finalizePlan({
    id: "tesseract",
    name: "Tesseract",
    radius: r,
    originId: "tess-origin",
    operations,
  });
}
