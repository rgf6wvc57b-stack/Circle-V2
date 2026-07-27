import { buildFromRules, buildFruitOfLifeRules } from "../construction/kernel/index.js";

export function generateFruitOfLife(radius) {
  const { data } = buildFromRules(buildFruitOfLifeRules(), radius, {
    id: "fruitOfLife",
    name: "Fruit of Life",
  });
  data.meta = { ...(data.meta || {}), sphereBased: true };
  return data;
}
