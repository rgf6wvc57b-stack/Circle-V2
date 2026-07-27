/**
 * Metatron's Cube and Platonic Solids evolution stages.
 * Metatron = Fruit of Life centers with straightedge connections.
 * Platonics emerge at the Fruit / Metatron scale as true 3D solids.
 */
import { dist } from "../../construction/compass.js";
import { snapshot, addPoint, addSphereAt, addEdge, addFace } from "../buildHelpers.js";
import { fruitCenters, buildFruitOfLifeStage } from "./flowerFruit.js";

/** Step 9 — Metatron's Cube: Fruit centers + lines between every pair */
export function buildMetatronCubeStage(radius) {
  const fruit = buildFruitOfLifeStage(radius);
  const data = snapshot("evolution-metatron", "Metatron's Cube", radius);

  // Carry Fruit centers as points (smaller marker spheres so edges read clearly)
  const nodeR = radius * 0.12;
  fruit.points.forEach((p) => {
    addPoint(data, {
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      label: p.label,
    });
    addSphereAt(data, p.id, nodeR);
  });

  // Complete graph on the 13 centers — the classical Metatron wireframe
  for (let i = 0; i < data.points.length; i += 1) {
    for (let j = i + 1; j < data.points.length; j += 1) {
      addEdge(data, {
        id: `metatron-${i}-${j}`,
        from: data.points[i].id,
        to: data.points[j].id,
        meta: { kind: "metatron" },
      });
    }
  }

  return data;
}

/**
 * Step 10 — Platonic Solids at Fruit scale.
 * Cube / octahedron / dual tetrahedra (Merkaba) with circumradius tied to Fruit geometry.
 */
export function buildPlatonicSolidsStage(radius) {
  const { outer } = fruitCenters(radius);
  // Outer ring lies at distance 2R from origin — use as Platonic circumradius scale
  const circum = dist(outer[0], { x: 0, y: 0, z: 0 });
  const data = snapshot("evolution-platonics", "Platonic Solids", radius);

  // Keep Fruit center points as faint reference (tiny spheres)
  const fruit = buildFruitOfLifeStage(radius);
  fruit.points.forEach((p) => {
    addPoint(data, {
      id: `ref-${p.id}`,
      x: p.x,
      y: p.y,
      z: p.z,
      label: "",
      meta: { role: "scaffold" },
    });
    addSphereAt(data, `ref-${p.id}`, radius * 0.04);
  });

  const s = circum / Math.sqrt(3); // cube vertex distance from origin = circum

  // --- Cube (±s,±s,±s) ---
  const cubeVerts = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        cubeVerts.push([sx * s, sy * s, sz * s]);
      }
    }
  }
  const cubeIds = cubeVerts.map((v, i) => {
    const id = `cube-${i}`;
    addPoint(data, { id, x: v[0], y: v[1], z: v[2], label: `C${i}` });
    addSphereAt(data, id, radius * 0.1);
    return id;
  });
  // Cube edges: Hamming distance 1 in sign space
  for (let i = 0; i < 8; i += 1) {
    for (let j = i + 1; j < 8; j += 1) {
      let diff = 0;
      for (let k = 0; k < 3; k += 1) {
        if (cubeVerts[i][k] !== cubeVerts[j][k]) diff += 1;
      }
      if (diff === 1) {
        addEdge(data, {
          id: `cube-e-${i}-${j}`,
          from: cubeIds[i],
          to: cubeIds[j],
          meta: { solid: "cube" },
        });
      }
    }
  }

  // --- Octahedron (axis-aligned) ---
  const octR = circum;
  const octVerts = [
    [octR, 0, 0],
    [-octR, 0, 0],
    [0, octR, 0],
    [0, -octR, 0],
    [0, 0, octR],
    [0, 0, -octR],
  ];
  const octIds = octVerts.map((v, i) => {
    const id = `oct-${i}`;
    addPoint(data, { id, x: v[0], y: v[1], z: v[2], label: `O${i}` });
    addSphereAt(data, id, radius * 0.1);
    return id;
  });
  // Connect vertices at distance octR * √2
  const octEdgeLen = octR * Math.SQRT2;
  for (let i = 0; i < 6; i += 1) {
    for (let j = i + 1; j < 6; j += 1) {
      const d = Math.hypot(
        octVerts[i][0] - octVerts[j][0],
        octVerts[i][1] - octVerts[j][1],
        octVerts[i][2] - octVerts[j][2]
      );
      if (Math.abs(d - octEdgeLen) < 1e-6) {
        addEdge(data, {
          id: `oct-e-${i}-${j}`,
          from: octIds[i],
          to: octIds[j],
          meta: { solid: "octahedron" },
        });
      }
    }
  }

  // --- Dual tetrahedra (Merkaba) on the cube's alternating vertices ---
  const tA = [
    [s, s, s],
    [s, -s, -s],
    [-s, s, -s],
    [-s, -s, s],
  ];
  const tB = [
    [-s, -s, -s],
    [-s, s, s],
    [s, -s, s],
    [s, s, -s],
  ];
  const facesIdx = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 1],
    [1, 3, 2],
  ];

  function addTetra(verts, prefix) {
    const ids = verts.map((v, i) => {
      const id = `${prefix}-${i}`;
      addPoint(data, {
        id,
        x: v[0],
        y: v[1],
        z: v[2],
        label: `${prefix}${i}`,
      });
      addSphereAt(data, id, radius * 0.1);
      return id;
    });
    facesIdx.forEach((f, fi) => {
      const [a, b, c] = f;
      addEdge(data, {
        id: `${prefix}-e-${fi}-a`,
        from: ids[a],
        to: ids[b],
        meta: { solid: "tetrahedron" },
      });
      addEdge(data, {
        id: `${prefix}-e-${fi}-b`,
        from: ids[b],
        to: ids[c],
        meta: { solid: "tetrahedron" },
      });
      addEdge(data, {
        id: `${prefix}-e-${fi}-c`,
        from: ids[c],
        to: ids[a],
        meta: { solid: "tetrahedron" },
      });
      addFace(data, { id: `${prefix}-f-${fi}`, pointIds: [ids[a], ids[b], ids[c]] });
    });
  }

  addTetra(tA, "tetraA");
  addTetra(tB, "tetraB");

  return data;
}
