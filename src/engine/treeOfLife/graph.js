/**
 * Canonical Tree of Life graph — shared by Traditional, Spatial, and Geometric modes.
 * Exactly 10 Sephirot + 22 traditional paths. Layout variants change coordinates only.
 */
import { traditionalPaths, buildTreeLayout, listTreeOfLifeVariants } from "./layout.js";

export const SEPHIROT_IDS = Object.freeze([
  "kether",
  "chokmah",
  "binah",
  "chesed",
  "geburah",
  "tiphereth",
  "netzach",
  "hod",
  "yesod",
  "malkuth",
]);

/**
 * @param {number} radius
 * @param {{ variant?: string, sephiraRadiusRatio?: number }} [opts]
 */
export function buildCanonicalTreeGraph(radius, opts = {}) {
  const layout = buildTreeLayout(radius, {
    variant: opts.variant ?? "kircher",
    sephiraRadiusRatio: opts.sephiraRadiusRatio ?? 0.18,
  });
  const paths = traditionalPaths();
  const sephirotById = new Map(layout.sephirot.map((s) => [s.id, s]));

  // Validate graph integrity
  if (layout.sephirot.length !== 10) {
    throw new Error(`Canonical Tree requires 10 Sephirot (got ${layout.sephirot.length})`);
  }
  if (paths.length !== 22) {
    throw new Error(`Canonical Tree requires 22 paths (got ${paths.length})`);
  }
  for (const id of SEPHIROT_IDS) {
    if (!sephirotById.has(id)) throw new Error(`Missing Sephirah: ${id}`);
  }
  paths.forEach((p) => {
    if (!sephirotById.has(p.from) || !sephirotById.has(p.to)) {
      throw new Error(`Path ${p.id} connects invalid Sephirot: ${p.from}–${p.to}`);
    }
  });

  /** Adjacency from the 22 paths only */
  const adjacency = new Map(SEPHIROT_IDS.map((id) => [id, []]));
  paths.forEach((p) => {
    adjacency.get(p.from).push(p.to);
    adjacency.get(p.to).push(p.from);
  });

  return {
    variant: layout.variant,
    sephirot: layout.sephirot,
    sephirotById,
    paths,
    adjacency,
    sephiraRadius: layout.sephiraRadius,
    origin: layout.origin,
    scale: layout.scale,
    pathKeys: new Set(paths.map((p) => [p.from, p.to].sort().join("|"))),
  };
}

/** Connectivity fingerprint — identical for Traditional/Spatial/Geometric tree graph. */
export function treeConnectivityFingerprint(graph) {
  const nodes = graph.sephirot.map((s) => s.id).sort().join(",");
  const edges = graph.paths
    .map((p) => [p.from, p.to].sort().join("-"))
    .sort()
    .join("|");
  return `${nodes}::${edges}`;
}

export { listTreeOfLifeVariants, traditionalPaths };
