import { createEmptyConstruction } from "../schema.js";

/**
 * Tesseract — 16 vertices of a 4-cube, perspective-projected to 3D. Pure math only.
 */
export function generateTesseract(radius) {
  const data = createEmptyConstruction("tesseract", "Tesseract", radius);
  const verts4 = [];
  for (let i = 0; i < 16; i += 1) {
    verts4.push([
      i & 1 ? 1 : -1,
      i & 2 ? 1 : -1,
      i & 4 ? 1 : -1,
      i & 8 ? 1 : -1,
    ]);
  }

  const distance = 3;
  const scale = radius * 0.7;
  const projected = verts4.map(([x, y, z, w]) => {
    const p = 1 / (distance - w);
    return [x * p * scale, y * p * scale, z * p * scale];
  });

  projected.forEach((v, i) => {
    const id = `tess-${i}`;
    const step = 1 + Math.floor(i / 2);
    data.points.push({ id, x: v[0], y: v[1], z: v[2], label: `v${i}`, step });
    data.sphereCenters.push({ id: `sphere-${id}`, pointId: id, radius: radius * 0.08 });
    data.circleCenters.push({
      id: `circle-${id}`,
      pointId: id,
      radius: radius * 0.08,
      normal: [0, 1, 0],
    });
  });

  for (let i = 0; i < 16; i += 1) {
    for (let bit = 0; bit < 4; bit += 1) {
      const j = i ^ (1 << bit);
      if (i < j) {
        const a = data.points[i];
        const b = data.points[j];
        data.edges.push({
          id: `tess-edge-${i}-${j}`,
          from: a.id,
          to: b.id,
          step: Math.max(a.step, b.step),
        });
      }
    }
  }

  data.maxStep = Math.max(...data.points.map((p) => p.step));
  return data;
}
