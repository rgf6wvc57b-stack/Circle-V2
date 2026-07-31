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

/** Complete graph edges for n vertices. */
export function completeEdges(count) {
  const edges = [];
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      edges.push([i, j]);
    }
  }
  return edges;
}

/** Cube edge pairs by Hamming distance 1 on bit index. */
export function cubeEdges(count = 8) {
  const edges = [];
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      if ((i ^ j) && !(i ^ j) & (i ^ j - 1)) {
        // single bit flip
      }
      const diff = i ^ j;
      if (diff && (diff & diff - 1) === 0) edges.push([i, j]);
    }
  }
  return edges;
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
