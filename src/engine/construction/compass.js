/**
 * Compass-and-straightedge utilities.
 * All results are exact intersections / constructions — no approximation of centers.
 */

export function vec(x, y, z = 0) {
  return { x, y, z };
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Euclidean distance in the XY plane (ignores Z). */
export function distXY(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function nearlyEqual(a, b, eps = 1e-10) {
  return Math.abs(a - b) <= eps;
}

/** Z tolerance for treating two circle centers as lying on the same XY plane. */
export const CIRCLE_INTERSECTION_Z_EPS = 1e-9;

/**
 * @param {{ z?: number }} c0
 * @param {{ z?: number }} c1
 * @param {number} [eps]
 */
export function circlesCoplanar(c0, c1, eps = CIRCLE_INTERSECTION_Z_EPS) {
  return Math.abs((c0.z ?? 0) - (c1.z ?? 0)) <= eps;
}

export function pointsEqual(a, b, eps = 1e-10) {
  return dist(a, b) <= eps;
}

/**
 * Intersection of two circles in the XY plane, both with the same radius r.
 * Returns 0, 1, or 2 points.
 */
export function intersectCirclesEqualRadius(c0, c1, r) {
  if (!circlesCoplanar(c0, c1)) return [];
  const d = distXY(c0, c1);
  const z = c0.z ?? 0;
  if (d < 1e-12) return [];
  if (d > 2 * r + 1e-10) return [];
  if (nearlyEqual(d, 2 * r)) {
    return [
      vec(
        c0.x + ((c1.x - c0.x) * r) / d,
        c0.y + ((c1.y - c0.y) * r) / d,
        z
      ),
    ];
  }

  // Midpoint along c0→c1, then ± perpendicular offset.
  // For equal radii, the radical axis is the perpendicular bisector: h = sqrt(r^2 - (d/2)^2)
  const half = d / 2;
  const h = Math.sqrt(Math.max(0, r * r - half * half));
  const mx = c0.x + ((c1.x - c0.x) * half) / d;
  const my = c0.y + ((c1.y - c0.y) * half) / d;
  const ux = (c1.x - c0.x) / d;
  const uy = (c1.y - c0.y) / d;
  const px = -uy;
  const py = ux;

  return [vec(mx + px * h, my + py * h, z), vec(mx - px * h, my - py * h, z)];
}

/**
 * Choose the intersection of circle(origin) ∩ circle(prev) that continues
 * counter-clockwise around the origin (compass walk of the Seed of Life).
 */
export function nextSeedCenterFromIntersection(origin, previous, r, excludePoints = []) {
  const hits = intersectCirclesEqualRadius(origin, previous, r);
  const candidates = hits.filter(
    (p) => !excludePoints.some((ex) => pointsEqual(p, ex))
  );

  if (candidates.length === 0) {
    throw new Error("No unused circle–circle intersection for next Seed of Life center");
  }

  if (candidates.length === 1) return candidates[0];

  // Prefer the candidate whose polar angle from origin is CCW ahead of `previous`.
  const prevAngle = Math.atan2(previous.y - origin.y, previous.x - origin.x);
  let best = candidates[0];
  let bestDelta = Infinity;

  candidates.forEach((p) => {
    const ang = Math.atan2(p.y - origin.y, p.x - origin.x);
    let delta = ang - prevAngle;
    while (delta <= 1e-12) delta += Math.PI * 2;
    while (delta > Math.PI * 2 + 1e-12) delta -= Math.PI * 2;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = p;
    }
  });

  return best;
}

/**
 * Point on circle(center,r) along a given unit direction (ray ∩ circle).
 */
export function pointOnCircleAlongDirection(center, r, direction) {
  const len = Math.hypot(direction[0], direction[1], direction[2] ?? 0);
  if (len < 1e-12) throw new Error("Direction vector for circumference mark is zero");
  return vec(
    center.x + (direction[0] / len) * r,
    center.y + (direction[1] / len) * r,
    center.z + ((direction[2] ?? 0) / len) * r
  );
}

/**
 * Intersections of an infinite line through `origin` with direction `direction`
 * and circle(center, r) in the XY plane. Returns 0–2 points.
 */
export function intersectRayCircle(origin, direction, center, r) {
  const dx = direction.x ?? direction[0];
  const dy = direction.y ?? direction[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) throw new Error("Ray direction is zero");
  const ux = dx / len;
  const uy = dy / len;

  // Parametric: origin + t * u ; solve |p - center|^2 = r^2
  const fx = origin.x - center.x;
  const fy = origin.y - center.y;
  const b = 2 * (fx * ux + fy * uy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * c;
  if (disc < -1e-12) return [];
  const s = Math.sqrt(Math.max(0, disc));
  const t0 = (-b - s) / 2;
  const t1 = (-b + s) / 2;
  const pts = [];
  for (const t of [t0, t1]) {
    pts.push(vec(origin.x + ux * t, origin.y + uy * t, origin.z ?? 0));
  }
  // Dedup tangent
  if (pts.length === 2 && pointsEqual(pts[0], pts[1])) return [pts[0]];
  return pts;
}

/**
 * Preferred ray∩circle point: among intersections with t >= 0 (forward ray),
 * pick farther from origin (for 2r tips) or the only hit.
 */
export function rayCirclePoint(origin, direction, center, r, choose = "fartherFromOrigin") {
  const hits = intersectRayCircle(origin, direction, center, r);
  if (hits.length === 0) {
    throw new Error("Ray does not intersect circle");
  }
  const dx = direction.x ?? direction[0];
  const dy = direction.y ?? direction[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const forward = hits.filter((h) => {
    const tx = h.x - origin.x;
    const ty = h.y - origin.y;
    return tx * ux + ty * uy >= -1e-12;
  });
  const pool = forward.length ? forward : hits;
  if (choose === "nearerToOrigin") {
    return [...pool].sort((a, b) => dist(a, origin) - dist(b, origin))[0];
  }
  return [...pool].sort((a, b) => dist(b, origin) - dist(a, origin))[0];
}
