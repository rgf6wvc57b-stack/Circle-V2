import {
  vesicaPiscisConstruction,
  sqrt2Module,
  sqrt3Module,
  goldenRectangleModule,
} from "../../geometry/solids/catalog.js";

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
      vesica: vesicaPiscisConstruction(unit),
      sqrt2: sqrt2Module(unit * 0.85),
      sqrt3: sqrt3Module(unit * 0.75),
      sqrt5: goldenRectangleModule(unit * 0.65),
    };
  },
});
