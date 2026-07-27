import { buildMetatronCubeStage } from "../evolution/stages/metatronPlatonics.js";

export function generateMetatronCube(radius) {
  const data = buildMetatronCubeStage(radius);
  data.id = "metatronCube";
  data.name = "Metatron's Cube";
  data.meta = { ...(data.meta || {}), sphereBased: true, kind: "metatronCube" };
  return data;
}
