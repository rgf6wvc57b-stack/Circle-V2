/** @typedef {[number, number, number]} Vec3 */

export function v3(x = 0, y = 0, z = 0) {
  return [x, y, z];
}

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function len(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a) {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : v3();
}

export function midpoint(a, b) {
  return scale(add(a, b), 0.5);
}

export function dist(a, b) {
  return len(sub(a, b));
}

export function cloneVecs(vertices) {
  return vertices.map((v) => v3(v[0], v[1], v[2]));
}
