import { buildPlatonicSolidsStage } from "../evolution/stages/metatronPlatonics.js";

export function generatePlatonicSolids(radius) {
  const data = buildPlatonicSolidsStage(radius);
  data.id = "platonicSolids";
  data.name = "Platonic Solids";
  data.meta = { ...(data.meta || {}), sphereBased: true, kind: "platonicSolids" };
  return data;
}
