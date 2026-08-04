import {
  regularTetrahedron,
  regularTetrahedronInverted,
  cubeSolid,
  octahedronSolid,
  stellatedOctahedron,
  cuboctahedron,
} from "../../geometry/solids/catalog.js";

export const MERKABA_STUDY = Object.freeze({
  id: "merkaba-stellated-octahedron",
  title: "Merkaba / Stellated Octahedron",
  subtitle: "Two interpenetrating tetrahedra on a cubic scaffold",
  summary:
    "A stellated octahedron is the compound of two regular tetrahedra whose eight vertices coincide with the corners of a cube. The shared center forms an octahedral core; the outward triangular faces create the six-point star familiar in many geometric traditions. This study maps the solid relationships without asserting metaphysical proof.",
  symbolismNote:
    "Traditional and interpretive readings associate the form with directional balance and complementary tetrahedral fields. Here it is presented strictly as constructed 3D geometry.",
  stats: {
    vertices: 8,
    edges: 12,
    triFaces: 8,
    squareFaces: 6,
    totalFaces: 14,
  },
  callouts: [
    { id: "up-tetra", label: "Upward tetrahedron", anchor: "top" },
    { id: "down-tetra", label: "Downward tetrahedron", anchor: "bottom" },
    { id: "octa-core", label: "Octahedral intersection", anchor: "center" },
    { id: "cube-frame", label: "Cube vertex frame", anchor: "corner" },
  ],
  miniDiagrams: [
    { id: "mini-tetra", title: "Tetrahedron", solid: "tetrahedron" },
    { id: "mini-octa", title: "Octahedron", solid: "octahedron" },
    { id: "mini-cube", title: "Cube relationship", solid: "cube" },
    { id: "mini-ve", title: "Cuboctahedron / VE", solid: "cuboctahedron" },
  ],
  blueprintSteps: [
    { id: "step-up", label: "Upward tetrahedron" },
    { id: "step-down", label: "Downward tetrahedron" },
    { id: "step-intersect", label: "Intersection" },
    { id: "step-final", label: "Stellated octahedron" },
  ],
  footer:
    "Geometry: compound of two regular tetrahedra · 8 vertices · 12 edges · 8 triangular star faces",
  getSolids(scale = 1) {
    return {
      centerpiece: stellatedOctahedron(scale),
      tetrahedron: regularTetrahedron(scale),
      tetrahedronInverted: regularTetrahedronInverted(scale),
      octahedron: octahedronSolid(scale * 0.85),
      cube: cubeSolid(scale * 0.72),
      cuboctahedron: cuboctahedron(scale * 0.78),
    };
  },
});
