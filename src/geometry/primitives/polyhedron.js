/**
 * @typedef {Object} PolyhedronSpec
 * @property {string} id
 * @property {string} label
 * @property {import("./vec3.js").Vec3[]} vertices
 * @property {[number, number][]} edges
 * @property {number[][]} [triFaces]
 * @property {number[][]} [quadFaces]
 * @property {Record<string, unknown>} [meta]
 */

/**
 * @param {Partial<PolyhedronSpec> & Pick<PolyhedronSpec, "id" | "vertices" | "edges">} spec
 * @returns {PolyhedronSpec}
 */
export function createPolyhedron(spec) {
  return {
    label: spec.id,
    triFaces: [],
    quadFaces: [],
    meta: {},
    ...spec,
  };
}

export function edgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function uniqueEdges(edgePairs) {
  const seen = new Set();
  const out = [];
  edgePairs.forEach(([a, b]) => {
    const key = edgeKey(a, b);
    if (seen.has(key)) return;
    seen.add(key);
    out.push([a, b]);
  });
  return out;
}
