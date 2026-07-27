/**
 * Construction rule constructors — pure declarations.
 * Coordinates appear only as free choices (origin, first ray direction).
 */

export const RULE = Object.freeze({
  PLACE_ORIGIN: "placeOrigin",
  RAY_CIRCLE_INTERSECTION: "rayCircleIntersection",
  CIRCLE_CIRCLE_INTERSECTION: "circleCircleIntersection",
  DRAW_SPHERE: "drawSphere",
  CONNECT_CENTERS: "connectCenters",
  ALIAS_POINT: "aliasPoint",
});

/** Step 0 — single point at the world origin. */
export function placeOrigin(pointId = "seed-center", label = "origin") {
  return {
    type: RULE.PLACE_ORIGIN,
    pointId,
    label,
    justification: "Choose the initial center at the world origin.",
  };
}

/**
 * Mark a point = ray(origin, direction) ∩ circle(center).
 * Used for the Vesica second center (distance must equal radius).
 */
export function rayCircleIntersection({
  pointId,
  originId,
  circleCenterId,
  direction,
  /** When set, direction is taken from origin → this constructed point. */
  throughPointId,
  label,
  justification,
  validateDistanceEqualsRadius = false,
  choose = "fartherFromOrigin",
}) {
  return {
    type: RULE.RAY_CIRCLE_INTERSECTION,
    pointId,
    originId,
    circleCenterId,
    throughPointId,
    direction: direction
      ? Array.isArray(direction)
        ? { x: direction[0], y: direction[1], z: direction[2] ?? 0 }
        : { x: direction.x, y: direction.y, z: direction.z ?? 0 }
      : undefined,
    choose,
    label,
    justification:
      justification ??
      `Mark ${pointId} = ray ∩ circle(${circleCenterId}) with opening r.`,
    validateDistanceEqualsRadius,
  };
}

/**
 * Mark a point = circle(A) ∩ circle(B) with a deterministic choice rule.
 * @param {'ccwUnused'|'fartherFromOrigin'|'nearerToOrigin'|'unused'} choose
 */
export function circleCircleIntersection({
  pointId,
  circleAId,
  circleBId,
  choose,
  label,
  justification,
  relativeToId,
  validateCentersAreNeighbors = false,
}) {
  return {
    type: RULE.CIRCLE_CIRCLE_INTERSECTION,
    pointId,
    circleAId,
    circleBId,
    choose,
    label,
    relativeToId,
    justification:
      justification ??
      `Mark ${pointId} = circle(${circleAId}) ∩ circle(${circleBId}) (${choose}).`,
    validateCentersAreNeighbors,
  };
}

export function drawSphere({ sphereId, centerId, justification }) {
  return {
    type: RULE.DRAW_SPHERE,
    sphereId: sphereId ?? `sphere-${centerId}`,
    centerId,
    justification: justification ?? `Compass at ${centerId} — draw sphere of radius r.`,
  };
}

export function connectCenters({ edgeId, from, to, label, meta, justification }) {
  return {
    type: RULE.CONNECT_CENTERS,
    edgeId: edgeId ?? `edge-${from}-${to}`,
    fromId: from,
    toId: to,
    from,
    to,
    label,
    meta,
    justification: justification ?? `Straightedge: connect ${from} to ${to}.`,
  };
}

/** Name an existing constructed point for a higher figure. */
export function aliasPoint({ aliasId, sourceId, label, meta, justification }) {
  return {
    type: RULE.ALIAS_POINT,
    aliasId,
    sourceId,
    label,
    meta,
    justification:
      justification ?? `Identify ${aliasId} with constructed point ${sourceId}.`,
  };
}
