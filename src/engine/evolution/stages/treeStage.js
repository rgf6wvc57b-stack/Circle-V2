import { generateTreeOfLife } from "../../generators/treeOfLife.js";
import { TREE_VIEW_MODES } from "../../treeOfLife/modes.js";

/** Step 11 — Tree of Life in Geometric Mode (equal-radius hex foundation) */
export function buildTreeOfLifeStage(radius) {
  const data = generateTreeOfLife(radius, { viewMode: TREE_VIEW_MODES.GEOMETRIC });
  data.id = "evolution-tree";
  data.name = "Tree of Life";
  data.meta = {
    ...(data.meta || {}),
    evolution: true,
    stageId: "tree",
    viewMode: TREE_VIEW_MODES.GEOMETRIC,
  };
  data.points.forEach((p) => {
    p.step = 1;
  });
  data.edges.forEach((e) => {
    e.step = 1;
  });
  data.maxStep = 1;
  return data;
}
