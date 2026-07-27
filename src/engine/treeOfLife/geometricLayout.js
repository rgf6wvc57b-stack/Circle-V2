/**
 * Geometric Tree of Life — scaffold around the *traditional* Tree graph.
 *
 * Does NOT replace Sephirot coordinates with Flower-of-Life hex packing.
 * The 10 Sephirot + 22 paths come from {@link buildCanonicalTreeGraph}.
 * Construction circles, intersections, symmetry axes, and an optional
 * Flower-of-Life overlay are derived around that fixed structure.
 */
import { intersectCirclesEqualRadius } from "../construction/compass.js";
import { buildCanonicalTreeGraph } from "./graph.js";
import {
  buildFromRules,
  buildSeedOfLifeRules,
  RULE,
} from "../construction/kernel/index.js";

/** @typedef {{
 *   showTree?: boolean,
 *   showConstructionGeometry?: boolean,
 *   showFlowerOverlay?: boolean,
 *   showIntersections?: boolean,
 *   showSymmetryAxes?: boolean,
 * }} GeometricFlags */

export const DEFAULT_GEOMETRIC_FLAGS = Object.freeze({
  showTree: true,
  showConstructionGeometry: true,
  showFlowerOverlay: false,
  showIntersections: true,
  showSymmetryAxes: true,
});

export function normalizeGeometricFlags(flags = {}) {
  return { ...DEFAULT_GEOMETRIC_FLAGS, ...flags };
}

/**
 * @param {number} radius
 * @param {{ variant?: string, flags?: GeometricFlags }} [opts]
 */
export function buildGeometricTreeLayout(radius, opts = {}) {
  const flags = normalizeGeometricFlags(opts.flags);
  // Sephira display radius for the Tree itself (not packing R)
  const graph = buildCanonicalTreeGraph(radius, {
    variant: opts.variant ?? "kircher",
    sephiraRadiusRatio: 0.16,
  });

  const sephirot = graph.sephirot.map((s) => ({
    ...s,
    role: "sephirah",
    z: 0,
  }));

  // Construction radius: median of the 22 path lengths — equal-radius scaffold
  // that preserves Tree proportions while enabling compass intersections.
  const pathLengths = graph.paths.map((p) => {
    const a = graph.sephirotById.get(p.from);
    const b = graph.sephirotById.get(p.to);
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  });
  pathLengths.sort((a, b) => a - b);
  const constructionRadius = pathLengths[Math.floor(pathLengths.length / 2)];

  /** Construction circles centered on each Sephirah */
  const constructionCircles = sephirot.map((s) => ({
    id: `construct-circle-${s.id}`,
    centerId: s.id,
    x: s.x,
    y: s.y,
    z: 0,
    radius: constructionRadius,
    role: "construction",
  }));

  /** Intersection points of construction circles (deduped) */
  const intersections = [];
  if (flags.showIntersections || flags.showConstructionGeometry) {
    const seen = [];
    for (let i = 0; i < sephirot.length; i += 1) {
      for (let j = i + 1; j < sephirot.length; j += 1) {
        const a = sephirot[i];
        const b = sephirot[j];
        const hits = intersectCirclesEqualRadius(a, b, constructionRadius);
        hits.forEach((h, k) => {
          if (seen.some((s) => Math.hypot(s.x - h.x, s.y - h.y) < constructionRadius * 0.04)) {
            return;
          }
          // Skip if coincides with a Sephirah
          if (
            sephirot.some(
              (s) => Math.hypot(s.x - h.x, s.y - h.y) < constructionRadius * 0.04
            )
          ) {
            return;
          }
          const pt = {
            id: `ix-${a.id}-${b.id}-${k}`,
            x: h.x,
            y: h.y,
            z: 0,
            label: "",
            role: "intersection",
            parents: [a.id, b.id],
          };
          seen.push(pt);
          intersections.push(pt);
        });
      }
    }
  }

  /** Symmetry axes through the Tree (middle pillar + horizontal through Tiphereth) */
  const extent = Math.max(...sephirot.map((s) => Math.hypot(s.x, s.y)), radius) * 1.15;
  const tiphereth = graph.sephirotById.get("tiphereth");
  const symmetryAxes = [
    {
      id: "axis-middle-pillar",
      from: { x: 0, y: extent, z: 0 },
      to: { x: 0, y: -extent, z: 0 },
      label: "Middle Pillar",
      role: "symmetryAxis",
    },
    {
      id: "axis-horizontal-tiphereth",
      from: { x: -extent, y: tiphereth.y, z: 0 },
      to: { x: extent, y: tiphereth.y, z: 0 },
      label: "Tiphereth Horizon",
      role: "symmetryAxis",
    },
  ];

  /**
   * Optional Flower-of-Life overlay — Seed packing from construction rules,
   * translated to Tiphereth. Never relocates Sephirot.
   */
  const flowerOverlay = [];
  if (flags.showFlowerOverlay) {
    const fr = constructionRadius;
    const seedRules = buildSeedOfLifeRules().filter((r) => r.type !== RULE.CONNECT_CENTERS);
    const { state } = buildFromRules(seedRules, fr, {
      id: "overlay-seed",
      name: "Seed overlay",
    });
    const cx = tiphereth.x;
    const cy = tiphereth.y;
    [...state.points.values()].forEach((p, k) => {
      flowerOverlay.push({
        id: p.id === "seed-center" ? "flower-ov-center" : `flower-ov-${k - 1}`,
        x: cx + p.x,
        y: cy + p.y,
        z: 0,
        role: "flowerOverlay",
      });
    });
  }

  return {
    mode: "geometric",
    flags,
    graph,
    sephirot,
    paths: graph.paths,
    sephiraRadius: graph.sephiraRadius,
    constructionRadius,
    constructionCircles,
    intersections,
    symmetryAxes,
    flowerOverlay,
    origin: { x: 0, y: 0, z: 0 },
    meta: {
      packing: "traditionalTreeScaffold",
      foundation: true,
      preservesTraditionalGraph: true,
    },
  };
}
