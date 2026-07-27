/** @typedef {'point'|'sphere'|'circle'|'edge'|'face'|'intersection'} GraphNodeType */

/** @typedef {'intersects'|'tangent'|'concentric'|'equalRadius'|'equalLength'|'parallel'|'perpendicular'|'mirrorPair'|'rotationalEquivalent'|'incident'|'contains'} RelationKind */

export const NODE_TYPES = Object.freeze({
  POINT: "point",
  SPHERE: "sphere",
  CIRCLE: "circle",
  EDGE: "edge",
  FACE: "face",
  INTERSECTION: "intersection",
});

export const REL = Object.freeze({
  INTERSECTS: "intersects",
  TANGENT: "tangent",
  CONCENTRIC: "concentric",
  EQUAL_RADIUS: "equalRadius",
  EQUAL_LENGTH: "equalLength",
  PARALLEL: "parallel",
  PERPENDICULAR: "perpendicular",
  MIRROR_PAIR: "mirrorPair",
  ROTATIONAL_EQUIVALENT: "rotationalEquivalent",
  INCIDENT: "incident",
  CONTAINS: "contains",
});

export const DISCOVERY_TYPES = Object.freeze({
  EQUILATERAL_TRIANGLE: "equilateralTriangle",
  SQUARE: "square",
  RECTANGLE: "rectangle",
  REGULAR_POLYGON: "regularPolygon",
  HEXAGON: "hexagon",
  VESICA_PISCIS: "vesicaPiscis",
  REFLECTION_SYMMETRY: "reflectionSymmetry",
  ROTATIONAL_SYMMETRY: "rotationalSymmetry",
  EQUAL_LENGTH_GROUP: "equalLengthGroup",
  EQUAL_RADIUS_GROUP: "equalRadiusGroup",
  GOLDEN_RATIO: "goldenRatio",
});

export const DISCOVERY_LABELS = Object.freeze({
  equilateralTriangle: "Equilateral Triangles",
  square: "Squares",
  rectangle: "Rectangles",
  regularPolygon: "Regular Polygons",
  hexagon: "Hexagons",
  vesicaPiscis: "Vesica Piscis",
  reflectionSymmetry: "Reflection Symmetry",
  rotationalSymmetry: "Rotational Symmetry",
  equalLengthGroup: "Equal-Length Groups",
  equalRadiusGroup: "Equal-Radius Groups",
  goldenRatio: "Golden Ratio Relationships",
});

export const EPS = 1e-6;
export const REL_EPS = 0.04;
export const PHI = (1 + Math.sqrt(5)) / 2;
