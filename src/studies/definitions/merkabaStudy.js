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

export const DIMENSIONAL_STUDY = Object.freeze({
  id: "dimensional-relationships",
  title: "Dimensional Relationships",
  subtitle: "From Vesica to Volume — √2, √3, and √5 expansions",
  summary:
    "Beginning with the vesica piscis — two equal circles whose overlap defines a lens — we inscribe the sacred square, then follow how planar diagonal (√2), spatial diagonal (√3), and golden-ratio diagonal (√5) emerge as successive dimensional steps.",
  symbolismNote:
    "Side labels such as “creative intersection” are interpretive framing. All measurements shown are standard Euclidean constructions.",
  callouts: [
    { id: "equilibrium", label: "Equilibrium point", anchor: "center" },
    { id: "sacred-square", label: "Sacred square", anchor: "square" },
    { id: "creative", label: "Creative intersection", anchor: "lens" },
    { id: "unity", label: "Unity field", anchor: "outer" },
  ],
  ratioPanels: [
    {
      id: "sqrt2",
      title: "√2 — Square Diagonal",
      ratio: Math.SQRT2,
      approximation: "1.414213562…",
      description: "Unit square: diagonal = √2 × edge",
      solid: "sqrt2",
    },
    {
      id: "sqrt3",
      title: "√3 — Cube Body Diagonal",
      ratio: Math.sqrt(3),
      approximation: "1.732050808…",
      description: "Unit cube: space diagonal = √3 × edge",
      solid: "sqrt3",
    },
    {
      id: "sqrt5",
      title: "√5 — Golden Extension",
      ratio: Math.sqrt(5),
      approximation: "2.236067977…",
      description: "Golden rectangle diagonal encodes √5 relative to unit height",
      solid: "sqrt5",
    },
  ],
  footer:
    "Progression: vesica lens → inscribed square → cube volume → irrational diagonal ratios as dimensional signatures",
  getSolids(unit = 1) {
    return {
      vesicaRadius: unit,
      sqrt2Unit: unit * 0.85,
      sqrt3Unit: unit * 0.75,
      sqrt5Height: unit * 0.65,
    };
  },
});
