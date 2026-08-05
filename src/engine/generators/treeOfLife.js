import { createEmptyConstruction } from "../schema.js";
import { buildCanonicalTreeGraph, treeConnectivityFingerprint } from "../treeOfLife/graph.js";
import {
  buildGeometricTreeLayout,
  normalizeGeometricFlags,
} from "../treeOfLife/geometricLayout.js";
import { normalizeTreeViewMode, TREE_VIEW_MODES } from "../treeOfLife/modes.js";
import {
  buildVolumetricTreeLayout,
  normalizeVolumetricOpts,
  volumetricZStats,
} from "../treeOfLife/volumetricLayout.js";

/**
 * Tree of Life generator — three viewing modes over one canonical graph.
 *
 * - traditional: 2D diagram — circles + 22 paths in one plane
 * - spatial: same coordinates — 3D spheres + path tubes
 * - geometric: same Tree graph + construction scaffold / optional FoL overlay
 * - volumetric: explicit (x,y,z) Sephirot across multiple Z layers — true 3D tree
 *
 * @param {number} radius
 * @param {{ variant?: string, viewMode?: string, geometricFlags?: object, volumetric?: object }} [opts]
 */
export function generateTreeOfLife(radius, opts = {}) {
  const viewMode = normalizeTreeViewMode(opts.viewMode ?? TREE_VIEW_MODES.TRADITIONAL);

  if (viewMode === TREE_VIEW_MODES.VOLUMETRIC) {
    return generateVolumetric(radius, opts);
  }
  if (viewMode === TREE_VIEW_MODES.GEOMETRIC) {
    return generateGeometric(radius, opts);
  }
  return generateDiagram(radius, viewMode, opts);
}

function generateVolumetric(radius, opts) {
  const volOpts = normalizeVolumetricOpts({
    ...opts.volumetric,
    variant: opts.variant,
  });
  const layout = buildVolumetricTreeLayout(radius, volOpts);
  const graph = {
    variant: layout.variant,
    sephirot: layout.sephirot,
    paths: layout.paths,
    sephiraRadius: layout.sephiraRadius,
  };

  const data = createEmptyConstruction("treeOfLife", "Tree of Life", radius);
  const zStats = volumetricZStats(layout.sephirot);
  data.meta = {
    kind: "treeOfLife",
    viewMode: TREE_VIEW_MODES.VOLUMETRIC,
    variant: layout.variant,
    connectivity: treeConnectivityFingerprint({
      sephirot: layout.sephirot,
      paths: layout.paths,
    }),
    foundation: false,
    volumetric: {
      zSpacing: layout.zSpacing,
      branchSpread: layout.branchSpread,
      layers: layout.layers,
      connectionThickness: layout.connectionThickness,
      zStats,
    },
  };

  layout.sephirot.forEach((s) => {
    pushSephirah(data, s, s.layer + 1, layout.sephiraRadius, {
      layer: s.layer,
      volumetric: true,
    }, { includeCircles: false });
  });

  pushTreePaths(data, layout.paths);
  assertTree(data, graph, { allowDepth: true });
  data.maxStep = layout.layers;
  return data;
}

function generateDiagram(radius, viewMode, opts) {
  const ratio = viewMode === TREE_VIEW_MODES.TRADITIONAL ? 0.11 : 0.2;
  const graph = buildCanonicalTreeGraph(radius, {
    variant: opts.variant ?? "kircher",
    sephiraRadiusRatio: ratio,
  });

  const data = createEmptyConstruction("treeOfLife", "Tree of Life", radius);
  data.meta = {
    kind: "treeOfLife",
    viewMode,
    variant: graph.variant,
    connectivity: treeConnectivityFingerprint(graph),
    foundation: false,
  };

  graph.sephirot.forEach((s, i) => {
    pushSephirah(data, s, i + 1, graph.sephiraRadius);
  });

  pushTreePaths(data, graph.paths);
  assertTree(data, graph);
  data.maxStep = 10;
  return data;
}

function generateGeometric(radius, opts) {
  const flags = normalizeGeometricFlags(opts.geometricFlags);
  const layout = buildGeometricTreeLayout(radius, {
    variant: opts.variant ?? "kircher",
    flags,
  });
  const graph = layout.graph;

  const data = createEmptyConstruction("treeOfLife", "Tree of Life", radius);
  data.meta = {
    kind: "treeOfLife",
    viewMode: TREE_VIEW_MODES.GEOMETRIC,
    variant: graph.variant,
    connectivity: treeConnectivityFingerprint(graph),
    foundation: true,
    preservesTraditionalGraph: true,
    geometricFlags: { ...flags },
    constructionRadius: layout.constructionRadius,
  };

  // Tree Sephirot — equal-radius spheres when construction geometry is on
  // (compass scaffold), otherwise smaller diagram spheres for the Tree itself.
  const treeSphereR = flags.showConstructionGeometry
    ? layout.constructionRadius
    : layout.sephiraRadius;
  layout.sephirot.forEach((s, i) => {
    pushSephirah(data, s, i + 1, treeSphereR);
  });
  // Always emit the 22 traditional paths — Geometric never abandons the Tree graph
  pushTreePaths(data, layout.paths);

  // Extra construction circle outlines (same centers, explicit scaffold role)
  if (flags.showConstructionGeometry) {
    layout.constructionCircles.forEach((c) => {
      data.circleCenters.push({
        id: c.id,
        pointId: c.centerId,
        radius: c.radius,
        normal: [0, 0, 1],
        meta: { role: "construction" },
      });
    });
  }

  // --- Intersection points ---
  if (flags.showIntersections) {
    layout.intersections.forEach((ix, i) => {
      data.points.push({
        id: ix.id,
        x: ix.x,
        y: ix.y,
        z: 0,
        label: "",
        step: 20 + i,
        meta: { role: "intersection", parents: ix.parents },
      });
    });
  }

  // --- Symmetry axes as edges between axis endpoint points ---
  if (flags.showSymmetryAxes) {
    layout.symmetryAxes.forEach((axis, i) => {
      const aId = `${axis.id}-a`;
      const bId = `${axis.id}-b`;
      data.points.push({
        id: aId,
        x: axis.from.x,
        y: axis.from.y,
        z: 0,
        label: "",
        step: 40 + i,
        meta: { role: "symmetryAxis" },
      });
      data.points.push({
        id: bId,
        x: axis.to.x,
        y: axis.to.y,
        z: 0,
        label: "",
        step: 41 + i,
        meta: { role: "symmetryAxis" },
      });
      data.edges.push({
        id: axis.id,
        from: aId,
        to: bId,
        step: 40 + i,
        label: axis.label,
        meta: { kind: "symmetryAxis", role: "symmetryAxis" },
      });
    });
  }

  // --- Optional Flower-of-Life overlay (never relocates Sephirot) ---
  if (flags.showFlowerOverlay) {
    layout.flowerOverlay.forEach((f, i) => {
      data.points.push({
        id: f.id,
        x: f.x,
        y: f.y,
        z: 0,
        label: "",
        step: 60 + i,
        meta: { role: "flowerOverlay" },
      });
      data.circleCenters.push({
        id: `flower-circle-${f.id}`,
        pointId: f.id,
        radius: layout.constructionRadius,
        normal: [0, 0, 1],
        meta: { role: "flowerOverlay" },
      });
    });
  }

  assertTree(data, graph);
  data.maxStep = Math.max(10, ...data.points.map((p) => p.step));
  return data;
}

function pushSephirah(data, s, step, sphereRadius, extraMeta = {}, { includeCircles = true } = {}) {
  data.points.push({
    id: s.id,
    x: s.x,
    y: s.y,
    z: s.z ?? 0,
    label: s.label || undefined,
    step,
    meta: { sephirahNumber: s.number, role: "sephirah", ...extraMeta },
  });
  data.sphereCenters.push({
    id: `sphere-${s.id}`,
    pointId: s.id,
    radius: sphereRadius,
    meta: { role: "sephirah" },
  });
  if (includeCircles) {
    data.circleCenters.push({
      id: `circle-${s.id}`,
      pointId: s.id,
      radius: sphereRadius,
      normal: [0, 0, 1],
      meta: { role: "sephirah" },
    });
  }
}

function pushTreePaths(data, paths) {
  const stepById = new Map(data.points.map((p) => [p.id, p.step]));
  paths.forEach((path) => {
    data.edges.push({
      id: path.id,
      from: path.from,
      to: path.to,
      step: Math.max(stepById.get(path.from) ?? 1, stepById.get(path.to) ?? 1),
      label: path.label,
      meta: {
        letter: path.letter,
        pathNumber: path.number,
        kind: "treePath",
      },
    });
  });
}

function assertTree(data, graph, { allowDepth = false } = {}) {
  const seph = data.points.filter((p) => p.meta?.role === "sephirah");
  if (seph.length !== 10) throw new Error(`Tree must have 10 Sephirot (got ${seph.length})`);
  const paths = data.edges.filter((e) => e.meta?.kind === "treePath");
  if (paths.length !== 22) throw new Error(`Tree must have 22 paths (got ${paths.length})`);
  const cx = seph.reduce((s, p) => s + p.x, 0) / 10;
  const cy = seph.reduce((s, p) => s + p.y, 0) / 10;
  const cz = seph.reduce((s, p) => s + p.z, 0) / 10;
  if (Math.hypot(cx, cy, cz) > 1e-5) {
    throw new Error("Tree of Life geometric center is not at the world origin");
  }
  if (!allowDepth) {
    const maxAbsZ = Math.max(...seph.map((p) => Math.abs(p.z)));
    if (maxAbsZ > 1e-9) {
      throw new Error("Planar Tree of Life Sephirot must remain coplanar (z=0)");
    }
  }
  if (treeConnectivityFingerprint(graph) !== data.meta.connectivity) {
    throw new Error("Tree connectivity fingerprint mismatch");
  }
}
