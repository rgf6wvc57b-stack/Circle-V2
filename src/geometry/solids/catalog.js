import { createPolyhedron } from "../primitives/polyhedron.js";
import { v3 } from "../primitives/vec3.js";

const TETRA_FACES = [
  [0, 1, 2],
  [0, 2, 3],
  [0, 3, 1],
  [1, 3, 2],
];

export function regularTetrahedron(scale = 1) {
  const s = scale;
  const vertices = [
    v3(s, s, s),
    v3(s, -s, -s),
    v3(-s, s, -s),
    v3(-s, -s, s),
  ];
  const edges = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ];
  return createPolyhedron({
    id: "tetrahedron",
    label: "Tetrahedron",
    vertices,
    edges,
    triFaces: TETRA_FACES,
    meta: { vertices: 4, edges: 6, faces: 4 },
  });
}

export function regularTetrahedronInverted(scale = 1) {
  const s = scale;
  const vertices = [
    v3(-s, -s, -s),
    v3(-s, s, s),
    v3(s, -s, s),
    v3(s, s, -s),
  ];
  return createPolyhedron({
    id: "tetrahedron-inverted",
    label: "Inverted Tetrahedron",
    vertices,
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ],
    triFaces: TETRA_FACES,
    meta: { vertices: 4, edges: 6, faces: 4 },
  });
}

export function cubeSolid(half = 1) {
  const h = half;
  const vertices = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        vertices.push(v3(x * h, y * h, z * h));
      }
    }
  }
  const edges = [];
  for (let i = 0; i < 8; i += 1) {
    for (let j = i + 1; j < 8; j += 1) {
      const diff = i ^ j;
      if (diff && (diff & (diff - 1)) === 0) edges.push([i, j]);
    }
  }
  const quadFaces = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
  ];
  return createPolyhedron({
    id: "cube",
    label: "Cube",
    vertices,
    edges,
    quadFaces,
    meta: { vertices: 8, edges: 12, faces: 6 },
  });
}

export function octahedronSolid(radius = 1) {
  const r = radius;
  const vertices = [
    v3(r, 0, 0),
    v3(-r, 0, 0),
    v3(0, r, 0),
    v3(0, -r, 0),
    v3(0, 0, r),
    v3(0, 0, -r),
  ];
  const edges = [
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
    [2, 4],
    [2, 5],
    [3, 4],
    [3, 5],
    [4, 5],
  ];
  const triFaces = [
    [0, 2, 4],
    [0, 4, 3],
    [0, 3, 5],
    [0, 5, 2],
    [1, 4, 2],
    [1, 3, 4],
    [1, 5, 3],
    [1, 2, 5],
  ];
  return createPolyhedron({
    id: "octahedron",
    label: "Octahedron",
    vertices,
    edges,
    triFaces,
    meta: { vertices: 6, edges: 12, faces: 8 },
  });
}

/** Stellated octahedron = two interpenetrating tetrahedra (Merkaba). */
export function stellatedOctahedron(scale = 1) {
  const up = regularTetrahedron(scale);
  const down = regularTetrahedronInverted(scale);
  const vertices = [...up.vertices, ...down.vertices];
  const offset = up.vertices.length;
  const edges = [
    ...up.edges,
    ...down.edges.map(([a, b]) => [a + offset, b + offset]),
  ];
  const triFaces = [
    ...up.triFaces,
    ...down.triFaces.map(([a, b, c]) => [a + offset, b + offset, c + offset]),
  ];
  return createPolyhedron({
    id: "stellated-octahedron",
    label: "Stellated Octahedron (Merkaba)",
    vertices,
    edges,
    triFaces,
    meta: {
      vertices: 8,
      edges: 12,
      triFaces: 8,
      description: "Compound of two regular tetrahedra on cube diagonals",
    },
  });
}

/** Cuboctahedron / vector equilibrium (edge-centered Archimedean solid). */
export function cuboctahedron(radius = 1) {
  const r = radius;
  const vertices = [
    v3(r, r, 0),
    v3(r, -r, 0),
    v3(-r, r, 0),
    v3(-r, -r, 0),
    v3(r, 0, r),
    v3(r, 0, -r),
    v3(-r, 0, r),
    v3(-r, 0, -r),
    v3(0, r, r),
    v3(0, r, -r),
    v3(0, -r, r),
    v3(0, -r, -r),
  ];
  const edges = [
    [0, 4],
    [0, 5],
    [0, 8],
    [0, 9],
    [1, 4],
    [1, 5],
    [1, 10],
    [1, 11],
    [2, 6],
    [2, 7],
    [2, 8],
    [2, 9],
    [3, 6],
    [3, 7],
    [3, 10],
    [3, 11],
    [4, 8],
    [4, 10],
    [5, 9],
    [5, 11],
    [6, 8],
    [6, 10],
    [7, 9],
    [7, 11],
    [8, 6],
    [9, 7],
    [10, 3],
    [11, 2],
  ];
  const triFaces = [
    [0, 8, 4],
    [0, 5, 9],
    [1, 4, 10],
    [1, 11, 5],
    [2, 6, 8],
    [2, 9, 7],
    [3, 10, 6],
    [3, 7, 11],
  ];
  const quadFaces = [
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [8, 9, 5, 4],
    [10, 11, 7, 6],
    [0, 2, 8, 9],
    [1, 3, 10, 11],
  ];
  return createPolyhedron({
    id: "cuboctahedron",
    label: "Cuboctahedron (Vector Equilibrium)",
    vertices,
    edges: [
      [0, 1],
      [0, 2],
      [0, 4],
      [0, 5],
      [0, 8],
      [0, 9],
      [1, 3],
      [1, 4],
      [1, 5],
      [1, 10],
      [1, 11],
      [2, 3],
      [2, 6],
      [2, 7],
      [2, 8],
      [2, 9],
      [3, 6],
      [3, 7],
      [3, 10],
      [3, 11],
      [4, 8],
      [4, 10],
      [5, 9],
      [5, 11],
      [6, 8],
      [6, 10],
      [7, 9],
      [7, 11],
      [8, 9],
      [10, 11],
    ],
    triFaces,
    quadFaces,
    meta: { vertices: 12, edges: 24, faces: 14 },
  });
}

export function vesicaPiscisConstruction(radius = 1) {
  const r = radius;
  const d = r;
  const left = v3(-d * 0.5, 0, 0);
  const right = v3(d * 0.5, 0, 0);
  const lensTop = v3(0, Math.sqrt(3) * 0.5 * r, 0);
  const lensBottom = v3(0, -Math.sqrt(3) * 0.5 * r, 0);
  const squareHalf = (r * Math.sqrt(2)) / 2;
  const squareVerts = [
    v3(-squareHalf, -squareHalf, 0),
    v3(squareHalf, -squareHalf, 0),
    v3(squareHalf, squareHalf, 0),
    v3(-squareHalf, squareHalf, 0),
  ];
  return {
    id: "vesica-piscis",
    label: "Vesica Piscis",
    circleCenters: [left, right],
    circleRadius: r,
    lensTop,
    lensBottom,
    squareVerts,
    width: r,
    height: Math.sqrt(3) * r,
    meta: {
      sqrt2Diagonal: Math.SQRT2,
      sqrt3Height: Math.sqrt(3),
    },
  };
}

export function sqrt2Module(unit = 1) {
  const u = unit;
  const vertices = [
    v3(0, 0, 0),
    v3(u, 0, 0),
    v3(u, u, 0),
    v3(0, u, 0),
  ];
  return createPolyhedron({
    id: "sqrt2-square",
    label: "√2 Square Diagonal",
    vertices,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 2],
    ],
    quadFaces: [[0, 1, 2, 3]],
    meta: { diagonal: u * Math.SQRT2, ratio: Math.SQRT2 },
  });
}

export function sqrt3Module(unit = 1) {
  const u = unit;
  const vertices = [
    v3(0, 0, 0),
    v3(u, 0, 0),
    v3(u, u, 0),
    v3(0, u, 0),
    v3(0, 0, u),
    v3(u, 0, u),
    v3(u, u, u),
    v3(0, u, u),
  ];
  const edges = [];
  for (let i = 0; i < 8; i += 1) {
    for (let j = i + 1; j < 8; j += 1) {
      const diff = i ^ j;
      if (diff && (diff & (diff - 1)) === 0) edges.push([i, j]);
    }
  }
  edges.push([0, 6]);
  return createPolyhedron({
    id: "sqrt3-cube",
    label: "√3 Body Diagonal",
    vertices,
    edges,
    quadFaces: [
      [0, 1, 2, 3],
      [4, 6, 7, 5],
      [0, 4, 5, 1],
      [2, 6, 7, 3],
    ],
    meta: { bodyDiagonal: u * Math.sqrt(3), ratio: Math.sqrt(3) },
  });
}

export function goldenRectangleModule(height = 1) {
  const h = height;
  const w = h * ((1 + Math.sqrt(5)) / 2);
  const cx = w * 0.5;
  const vertices = [
    v3(0, 0, 0),
    v3(w, 0, 0),
    v3(w, h, 0),
    v3(0, h, 0),
    v3(cx, 0, 0),
  ];
  return createPolyhedron({
    id: "sqrt5-golden",
    label: "√5 Golden Rectangle",
    vertices,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 2],
    ],
    quadFaces: [[0, 1, 2, 3]],
    meta: {
      phi: (1 + Math.sqrt(5)) / 2,
      diagonal: Math.sqrt(w * w + h * h),
      sqrt5: Math.sqrt(5),
    },
  });
}
