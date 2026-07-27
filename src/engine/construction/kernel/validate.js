/**
 * Per-step geometric validation for the construction kernel.
 * Failures are reported immediately by the kernel when throwOnFailure is set.
 */

import { dist, nearlyEqual } from "../compass.js";

const EPS = 1e-9;

/**
 * @param {import('./ConstructionKernel.js').KernelState} state
 * @param {object} rule
 * @param {{ kind: string, message?: string }} result
 * @returns {{ ok: boolean, checks: Array<{ name: string, ok: boolean, detail?: string }> }}
 */
export function validateAfterRule(state, rule, result) {
  const checks = [];

  if (result?.kind === "error") {
    checks.push({
      name: "rule_application",
      ok: false,
      detail: result.message || "unknown error",
    });
    return { ok: false, checks };
  }

  if (rule.type === "placeOrigin") {
    const p = state.points.get(rule.pointId);
    checks.push({
      name: "origin_at_zero",
      ok: !!p && Math.hypot(p.x, p.y, p.z ?? 0) <= EPS,
      detail: p ? `(${p.x}, ${p.y}, ${p.z ?? 0})` : "missing",
    });
  }

  if (rule.type === "drawSphere") {
    const sphere = state.spheres.get(rule.sphereId);
    const center = state.points.get(rule.centerId);
    checks.push({ name: "sphere_exists", ok: !!sphere });
    checks.push({ name: "center_exists", ok: !!center });
    if (sphere && center) {
      checks.push({
        name: "center_matches",
        ok:
          nearlyEqual(sphere.cx, center.x, EPS) &&
          nearlyEqual(sphere.cy, center.y, EPS) &&
          nearlyEqual(sphere.cz ?? 0, center.z ?? 0, EPS),
        detail: `sphere=(${sphere.cx},${sphere.cy}) point=(${center.x},${center.y})`,
      });
      checks.push({
        name: "radius_matches",
        ok: nearlyEqual(sphere.radius, state.radius, EPS),
        detail: `sphere.r=${sphere.radius} kernel.r=${state.radius}`,
      });
      checks.push({
        name: "parent_center",
        ok: sphere.centerId === rule.centerId,
        detail: sphere.centerId,
      });
    }
  }

  if (rule.type === "rayCircleIntersection") {
    const p = state.points.get(rule.pointId);
    const origin = state.points.get(rule.originId);
    const circleCenter = state.points.get(rule.circleCenterId);
    checks.push({ name: "point_created", ok: !!p });
    checks.push({ name: "parent_origin", ok: !!origin });
    checks.push({ name: "parent_circle_center", ok: !!circleCenter });
    if (p && origin && circleCenter) {
      const dCircle = dist(p, circleCenter);
      checks.push({
        name: "lies_on_circle",
        ok: nearlyEqual(dCircle, state.radius, EPS * 10),
        detail: `dist=${dCircle} r=${state.radius}`,
      });
      let dir = rule.direction;
      if (rule.throughPointId) {
        const through = state.points.get(rule.throughPointId);
        if (through) {
          dir = {
            x: through.x - origin.x,
            y: through.y - origin.y,
          };
        }
      }
      if (dir) {
        const dx = p.x - origin.x;
        const dy = p.y - origin.y;
        const len = Math.hypot(dx, dy);
        if (len > EPS) {
          const ux = dx / len;
          const uy = dy / len;
          const dirLen = Math.hypot(dir.x, dir.y);
          const rdx = dir.x / dirLen;
          const rdy = dir.y / dirLen;
          const align = ux * rdx + uy * rdy;
          checks.push({
            name: "on_ray_direction",
            ok: align > 1 - 1e-6,
            detail: `align=${align}`,
          });
        }
      }
      if (rule.validateDistanceEqualsRadius) {
        const d = dist(origin, p);
        checks.push({
          name: "distance_equals_radius",
          ok: nearlyEqual(d, state.radius, EPS * 10),
          detail: `d=${d} r=${state.radius}`,
        });
      }
    }
  }

  if (rule.type === "circleCircleIntersection") {
    const p = state.points.get(rule.pointId);
    const a = state.points.get(rule.circleAId);
    const b = state.points.get(rule.circleBId);
    checks.push({ name: "point_created", ok: !!p });
    checks.push({ name: "parent_circle_a", ok: !!a });
    checks.push({ name: "parent_circle_b", ok: !!b });
    if (p && a && b) {
      const da = dist(p, a);
      const db = dist(p, b);
      checks.push({
        name: "on_circle_a",
        ok: nearlyEqual(da, state.radius, EPS * 10),
        detail: `d=${da} r=${state.radius}`,
      });
      checks.push({
        name: "on_circle_b",
        ok: nearlyEqual(db, state.radius, EPS * 10),
        detail: `d=${db} r=${state.radius}`,
      });
      if (rule.validateCentersAreNeighbors) {
        const dCenters = dist(a, b);
        checks.push({
          name: "parent_centers_distance_equals_radius",
          ok: nearlyEqual(dCenters, state.radius, EPS * 10),
          detail: `d=${dCenters} r=${state.radius}`,
        });
      }
    }
  }

  if (rule.type === "connectCenters") {
    const edge = state.edges.get(rule.edgeId);
    const a = state.points.get(rule.fromId ?? rule.from);
    const b = state.points.get(rule.toId ?? rule.to);
    checks.push({ name: "edge_created", ok: !!edge });
    checks.push({ name: "endpoint_a", ok: !!a });
    checks.push({ name: "endpoint_b", ok: !!b });
  }

  if (rule.type === "aliasPoint") {
    const p = state.points.get(rule.aliasId);
    const src = state.points.get(rule.sourceId);
    checks.push({ name: "alias_exists", ok: !!p });
    checks.push({ name: "source_exists", ok: !!src });
    if (p && src) {
      checks.push({
        name: "alias_equals_source",
        ok: dist(p, src) <= EPS,
        detail: `alias=(${p.x},${p.y}) src=(${src.x},${src.y})`,
      });
    }
  }

  const ok = checks.length > 0 ? checks.every((c) => c.ok) : true;
  return { ok, checks };
}
