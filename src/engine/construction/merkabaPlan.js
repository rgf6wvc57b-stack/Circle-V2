import { dist, vec } from "./compass.js";
import { finalizePlan } from "./applyPlan.js";

/**
 * Merkaba construction plan.
 * Starts with origin sphere, then places dual-tetrahedron vertices at exact coordinates
 * derived from the constant radius (regular tetrahedron geometry). Existing points never move.
 */
export function buildMerkabaConstructionPlan(r) {
  const operations = [];
  const s = r * 0.75;

  const tetraA = [
    [s, s, s],
    [s, -s, -s],
    [-s, s, -s],
    [-s, -s, s],
  ];
  const tetraB = [
    [-s, -s, -s],
    [-s, s, s],
    [s, -s, s],
    [s, s, -s],
  ];

  const origin = vec(0, 0, 0);
  operations.push({
    type: "placePoint",
    pointId: "merkaba-origin",
    point: origin,
    label: "origin",
    justification: "Choose initial center O at the world origin.",
    determinedBy: { kind: "freeChoice", role: "origin" },
  });
  operations.push({
    type: "drawSphere",
    sphereId: "sphere-merkaba-origin",
    centerId: "merkaba-origin",
    pointId: "merkaba-origin",
    radius: r,
    justification: "Compass at O — draw the first sphere.",
    center: origin,
  });

  function addVertex(id, coords, label, justification, determinedBy) {
    const point = vec(coords[0], coords[1], coords[2]);
    operations.push({
      type: "placePoint",
      pointId: id,
      point,
      label,
      justification,
      determinedBy,
    });
    // Vertex marker spheres use a fixed fraction of r (construction nodes)
    const nodeR = r * 0.12;
    operations.push({
      type: "drawSphere",
      sphereId: `sphere-${id}`,
      centerId: id,
      pointId: id,
      radius: nodeR,
      justification: `Draw construction sphere at ${label}.`,
      center: point,
      normal: [0, 1, 0],
    });
  }

  tetraA.forEach((c, i) => {
    addVertex(
      `tetraA-${i}`,
      c,
      `tetraA-${i}`,
      `Regular tetrahedron A vertex ${i}: exact (±s,±s,±s) with s = (3/4)·r from origin-centered dual.`,
      { kind: "regularTetrahedronVertex", tetra: "A", index: i, s }
    );
  });
  tetraB.forEach((c, i) => {
    addVertex(
      `tetraB-${i}`,
      c,
      `tetraB-${i}`,
      `Regular tetrahedron B (dual) vertex ${i}: exact coordinates from dual of A.`,
      { kind: "regularTetrahedronVertex", tetra: "B", index: i, s }
    );
  });

  // Edges of both tetrahedra
  const faces = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 1],
    [1, 3, 2],
  ];
  ["tetraA", "tetraB"].forEach((prefix) => {
    faces.forEach((f, fi) => {
      const [i, j, k] = f;
      operations.push({
        type: "addEdge",
        edgeId: `${prefix}-e-${fi}-a`,
        from: `${prefix}-${i}`,
        to: `${prefix}-${j}`,
      });
      operations.push({
        type: "addEdge",
        edgeId: `${prefix}-e-${fi}-b`,
        from: `${prefix}-${j}`,
        to: `${prefix}-${k}`,
      });
      operations.push({
        type: "addEdge",
        edgeId: `${prefix}-e-${fi}-c`,
        from: `${prefix}-${k}`,
        to: `${prefix}-${i}`,
      });
      operations.push({
        type: "addFace",
        faceId: `${prefix}-f-${fi}`,
        pointIds: [`${prefix}-${i}`, `${prefix}-${j}`, `${prefix}-${k}`],
      });
    });
  });

  // Verify all dual vertices lie on a common sphere about the origin
  tetraA.concat(tetraB).forEach((c) => {
    const d = dist(vec(c[0], c[1], c[2]), origin);
    const expected = Math.sqrt(3 * s * s);
    if (Math.abs(d - expected) > 1e-9) {
      throw new Error("Merkaba vertex is not at the expected circumradius");
    }
  });

  return finalizePlan({
    id: "merkaba",
    name: "Merkaba",
    radius: r,
    originId: "merkaba-origin",
    operations,
  });
}
