import { vec } from "./compass.js";
import { finalizePlan } from "./applyPlan.js";
import { buildCanonicalTreeGraph } from "../treeOfLife/graph.js";
import {
  buildGeometricTreeLayout,
  normalizeGeometricFlags,
} from "../treeOfLife/geometricLayout.js";
import { normalizeTreeViewMode, TREE_VIEW_MODES } from "../treeOfLife/modes.js";
import {
  buildVolumetricTreeLayout,
  normalizeVolumetricOpts,
} from "../treeOfLife/volumetricLayout.js";

/**
 * Tree of Life construction plan — all modes share the canonical 10+22 graph.
 *
 * @param {number} r
 * @param {{ variant?: string, viewMode?: string, geometricFlags?: object }} [opts]
 */
export function buildTreeOfLifeConstructionPlan(r, opts = {}) {
  const viewMode = normalizeTreeViewMode(opts.viewMode ?? TREE_VIEW_MODES.TRADITIONAL);
  if (viewMode === TREE_VIEW_MODES.VOLUMETRIC) {
    return buildVolumetricPlan(r, opts);
  }
  if (viewMode === TREE_VIEW_MODES.GEOMETRIC) {
    return buildGeometricPlan(r, opts);
  }
  return buildDiagramPlan(r, viewMode, opts);
}

function buildVolumetricPlan(r, opts) {
  const volOpts = normalizeVolumetricOpts({
    ...opts.volumetric,
    variant: opts.variant,
  });
  const layout = buildVolumetricTreeLayout(r, volOpts);
  const operations = [];
  const placed = new Set();
  const pathOpsDone = new Set();

  const addReadyPaths = () => {
    layout.paths.forEach((path) => {
      if (!placed.has(path.from) || !placed.has(path.to)) return;
      if (pathOpsDone.has(path.id)) return;
      pathOpsDone.add(path.id);
      operations.push({
        type: "addEdge",
        edgeId: path.id,
        from: path.from,
        to: path.to,
        label: path.label,
        meta: { letter: path.letter, pathNumber: path.number, kind: "treePath" },
      });
    });
  };

  layout.layerGroups.forEach((layerNodes, layerIdx) => {
    layerNodes.forEach((s) => {
      const point = vec(s.x, s.y, s.z);
      operations.push({
        type: "placePoint",
        pointId: s.id,
        point,
        label: s.label,
        justification: `Volumetric layer ${layerIdx + 1}: place Sephirah ${s.number} (${s.label}) at (${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)}).`,
        determinedBy: {
          kind: "treeOfLifeSephirah",
          variant: layout.variant,
          viewMode: TREE_VIEW_MODES.VOLUMETRIC,
          number: s.number,
          id: s.id,
          role: "sephirah",
          layer: layerIdx,
        },
      });
      operations.push({
        type: "drawSphere",
        sphereId: `sphere-${s.id}`,
        centerId: s.id,
        pointId: s.id,
        radius: layout.sephiraRadius,
        justification: `Draw 3D Sephirah sphere for ${s.label} on volumetric layer ${layerIdx + 1}.`,
        center: point,
      });
      placed.add(s.id);
    });
    addReadyPaths();
  });

  return finalizePlan({
    id: "treeOfLife",
    name: "Tree of Life (Volumetric)",
    radius: r,
    originId: "kether",
    viewMode: TREE_VIEW_MODES.VOLUMETRIC,
    variant: layout.variant,
    volumetric: volOpts,
    operations,
  });
}

function buildDiagramPlan(r, viewMode, opts) {
  const ratio = viewMode === TREE_VIEW_MODES.TRADITIONAL ? 0.11 : 0.2;
  const graph = buildCanonicalTreeGraph(r, {
    variant: opts.variant ?? "kircher",
    sephiraRadiusRatio: ratio,
  });
  const operations = [];
  const placed = new Set();

  const origin = vec(0, 0, 0);
  operations.push({
    type: "placePoint",
    pointId: "tree-origin",
    point: origin,
    label: "origin",
    justification: "Geometric center of the Tree — world origin and camera pivot.",
    determinedBy: { kind: "freeChoice", role: "origin" },
  });
  operations.push({
    type: "drawSphere",
    sphereId: "sphere-tree-origin",
    centerId: "tree-origin",
    pointId: "tree-origin",
    radius: r,
    justification: "Compass at the geometric center — establish the Tree's bounding radius.",
    center: origin,
  });
  placed.add("tree-origin");

  const addReadyPaths = () => {
    graph.paths.forEach((path) => {
      if (!placed.has(path.from) || !placed.has(path.to)) return;
      if (operations.some((op) => op.type === "addEdge" && op.edgeId === path.id)) return;
      operations.push({
        type: "addEdge",
        edgeId: path.id,
        from: path.from,
        to: path.to,
        label: path.label,
        meta: { letter: path.letter, pathNumber: path.number, kind: "treePath" },
      });
    });
  };

  graph.sephirot.forEach((s) => {
    const point = vec(s.x, s.y, s.z);
    operations.push({
      type: "placePoint",
      pointId: s.id,
      point,
      label: s.label,
      justification: `Place Sephirah ${s.number} (${s.label}) at ${viewMode} Kircher coordinates.`,
      determinedBy: {
        kind: "treeOfLifeSephirah",
        variant: graph.variant,
        viewMode,
        number: s.number,
        id: s.id,
        role: "sephirah",
      },
    });
    operations.push({
      type: "drawSphere",
      sphereId: `sphere-${s.id}`,
      centerId: s.id,
      pointId: s.id,
      radius: graph.sephiraRadius,
      justification: `Draw Sephirah sphere for ${s.label}.`,
      center: point,
      normal: [0, 0, 1],
    });
    placed.add(s.id);
    addReadyPaths();
  });

  return finalizePlan({
    id: "treeOfLife",
    name: "Tree of Life",
    radius: r,
    originId: "tree-origin",
    viewMode,
    variant: graph.variant,
    operations,
  });
}

function buildGeometricPlan(r, opts) {
  const flags = normalizeGeometricFlags(opts.geometricFlags);
  const layout = buildGeometricTreeLayout(r, {
    variant: opts.variant ?? "kircher",
    flags,
  });
  const graph = layout.graph;
  const operations = [];
  const placed = new Set();

  const origin = vec(0, 0, 0);
  operations.push({
    type: "placePoint",
    pointId: "tree-origin",
    point: origin,
    label: "origin",
    justification:
      "Geometric Tree scaffold — world origin is the Sephirot centroid (orbit pivot).",
    determinedBy: { kind: "freeChoice", role: "origin" },
  });
  operations.push({
    type: "drawSphere",
    sphereId: "sphere-tree-origin",
    centerId: "tree-origin",
    pointId: "tree-origin",
    radius: r,
    justification: "Establish the Tree's bounding radius at the geometric center.",
    center: origin,
  });
  placed.add("tree-origin");

  const pathOpsDone = new Set();
  const addReadyPaths = () => {
    graph.paths.forEach((path) => {
      if (!placed.has(path.from) || !placed.has(path.to)) return;
      if (pathOpsDone.has(path.id)) return;
      pathOpsDone.add(path.id);
      operations.push({
        type: "addEdge",
        edgeId: path.id,
        from: path.from,
        to: path.to,
        label: path.label,
        meta: { letter: path.letter, pathNumber: path.number, kind: "treePath" },
      });
    });
  };

  const sphereR = flags.showConstructionGeometry
    ? layout.constructionRadius
    : layout.sephiraRadius;

  layout.sephirot.forEach((s) => {
    const point = vec(s.x, s.y, s.z);
    operations.push({
      type: "placePoint",
      pointId: s.id,
      point,
      label: s.label,
      justification: `Place Sephirah ${s.number} (${s.label}) at traditional Kircher coordinates — Geometric mode preserves the Tree graph.`,
      determinedBy: {
        kind: "treeOfLifeSephirah",
        variant: graph.variant,
        viewMode: TREE_VIEW_MODES.GEOMETRIC,
        number: s.number,
        id: s.id,
        role: "sephirah",
      },
    });
    operations.push({
      type: "drawSphere",
      sphereId: `sphere-${s.id}`,
      centerId: s.id,
      pointId: s.id,
      radius: sphereR,
      justification: flags.showConstructionGeometry
        ? `Draw equal-radius construction sphere (median path length) at ${s.label}.`
        : `Draw Sephirah sphere for ${s.label}.`,
      center: point,
      normal: [0, 0, 1],
    });
    placed.add(s.id);
    addReadyPaths();
  });

  return finalizePlan({
    id: "treeOfLife",
    name: "Tree of Life",
    radius: r,
    originId: "tree-origin",
    viewMode: TREE_VIEW_MODES.GEOMETRIC,
    variant: graph.variant,
    geometricFlags: flags,
    operations,
  });
}
