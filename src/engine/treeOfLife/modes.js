/**
 * Tree of Life viewing modes.
 * All three share the canonical 10 Sephirot + 22-path graph (Kircher connectivity).
 * Geometric adds construction scaffold around that graph — it never replaces it.
 */
export const TREE_VIEW_MODES = Object.freeze({
  TRADITIONAL: "traditional",
  SPATIAL: "spatial",
  GEOMETRIC: "geometric",
  VOLUMETRIC: "volumetric",
});

export const TREE_VIEW_MODE_LABELS = Object.freeze({
  traditional: "Planar Diagram",
  spatial: "Pillar Depth (shallow 3D)",
  geometric: "Scaffold Depth (layered 3D)",
  volumetric: "Volumetric 3D Tree",
});

export function normalizeTreeViewMode(mode) {
  if (mode === TREE_VIEW_MODES.SPATIAL) return TREE_VIEW_MODES.SPATIAL;
  if (mode === TREE_VIEW_MODES.GEOMETRIC) return TREE_VIEW_MODES.GEOMETRIC;
  if (mode === TREE_VIEW_MODES.VOLUMETRIC) return TREE_VIEW_MODES.VOLUMETRIC;
  return TREE_VIEW_MODES.TRADITIONAL;
}

export function isPlanarTreeViewMode(mode) {
  const m = normalizeTreeViewMode(mode);
  return (
    m === TREE_VIEW_MODES.TRADITIONAL ||
    m === TREE_VIEW_MODES.SPATIAL ||
    m === TREE_VIEW_MODES.GEOMETRIC
  );
}
