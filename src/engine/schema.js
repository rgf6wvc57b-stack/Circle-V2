/**
 * Pure mathematical construction data — no rendering.
 *
 * @typedef {{ id: string, x: number, y: number, z: number, label?: string, step: number }} ConstructionPoint
 * @typedef {{ id: string, pointId: string, radius: number }} SphereSpec
 * @typedef {{ id: string, pointId: string, radius: number, normal: [number, number, number] }} CircleSpec
 * @typedef {{ id: string, from: string, to: string, step: number, label?: string, meta?: object }} EdgeSpec
 * @typedef {{ id: string, pointIds: string[], step: number }} FaceSpec
 * @typedef {{
 *   id: string,
 *   name: string,
 *   radius: number,
 *   points: ConstructionPoint[],
 *   sphereCenters: SphereSpec[],
 *   circleCenters: CircleSpec[],
 *   edges: EdgeSpec[],
 *   faces: FaceSpec[],
 *   maxStep: number
 * }} ConstructionData
 */

/** @returns {ConstructionData} */
export function createEmptyConstruction(id, name, radius) {
  return {
    id,
    name,
    radius,
    points: [],
    sphereCenters: [],
    circleCenters: [],
    edges: [],
    faces: [],
    maxStep: 1,
  };
}

export function pointMap(data) {
  const map = new Map();
  data.points.forEach((p) => map.set(p.id, p));
  return map;
}

export function distance3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
