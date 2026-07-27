import { createEmptyConstruction } from "../schema.js";

/**
 * Merkaba — dual tetrahedra vertices + edges. Pure math only.
 */
export function generateMerkaba(radius) {
  const s = radius * 0.75;
  const data = createEmptyConstruction("merkaba", "Merkaba", radius);

  const tetraA = [
    [s, s, s],
    [s, -s, -s],
    [-s, s, -s],
    [-s, -s, s],
  ];
  const tetraB = [
    [-s, -s, -s],
    [-s, s, s],
    [s, -s, s],
    [s, s, -s],
  ];

  const facesIdx = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 1],
    [1, 3, 2],
  ];

  function addTetra(verts, prefix, stepBase) {
    const ids = verts.map((v, i) => {
      const id = `${prefix}-${i}`;
      data.points.push({
        id,
        x: v[0],
        y: v[1],
        z: v[2],
        label: `${prefix}-${i}`,
        step: stepBase + i,
      });
      data.sphereCenters.push({ id: `sphere-${id}`, pointId: id, radius: radius * 0.12 });
      data.circleCenters.push({
        id: `circle-${id}`,
        pointId: id,
        radius: radius * 0.12,
        normal: [0, 0, 1],
      });
      return id;
    });

    facesIdx.forEach((f, fi) => {
      const [i, j, k] = f;
      const step = Math.max(
        data.points.find((p) => p.id === ids[i]).step,
        data.points.find((p) => p.id === ids[j]).step,
        data.points.find((p) => p.id === ids[k]).step
      );
      data.edges.push({ id: `${prefix}-e-${fi}-a`, from: ids[i], to: ids[j], step });
      data.edges.push({ id: `${prefix}-e-${fi}-b`, from: ids[j], to: ids[k], step });
      data.edges.push({ id: `${prefix}-e-${fi}-c`, from: ids[k], to: ids[i], step });
      data.faces.push({ id: `${prefix}-f-${fi}`, pointIds: [ids[i], ids[j], ids[k]], step });
    });
  }

  addTetra(tetraA, "tetraA", 1);
  addTetra(tetraB, "tetraB", 5);
  data.maxStep = Math.max(...data.points.map((p) => p.step));
  return data;
}
