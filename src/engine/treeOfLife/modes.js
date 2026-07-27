/**
 * Tree of Life viewing modes.
 * All three share the canonical 10 Sephirot + 22-path graph (Kircher connectivity).
 * Geometric adds construction scaffold around that graph — it never replaces it.
 */
export const TREE_VIEW_MODES = Object.freeze({
  TRADITIONAL: "traditional",
  SPATIAL: "spatial",
  GEOMETRIC: "geometric",
});

export const TREE_VIEW_MODE_LABELS = Object.freeze({
  traditional: "Traditional",
  spatial: "Spatial",
  geometric: "Geometric",
});

export function normalizeTreeViewMode(mode) {
  if (mode === TREE_VIEW_MODES.SPATIAL) return TREE_VIEW_MODES.SPATIAL;
  if (mode === TREE_VIEW_MODES.GEOMETRIC) return TREE_VIEW_MODES.GEOMETRIC;
  return TREE_VIEW_MODES.TRADITIONAL;
}
