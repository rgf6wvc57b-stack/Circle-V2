/**
 * ConstructionKernel — rule-based mathematical construction engine.
 *
 * Every object is produced by applying construction rules to prior geometry.
 * History is sufficient to rebuild the complete model from Step 0.
 */

import {
  dist,
  intersectCirclesEqualRadius,
  nextSeedCenterFromIntersection,
  pointOnCircleAlongDirection,
  pointsEqual,
  rayCirclePoint,
  vec,
} from "../compass.js";
import { RULE } from "./rules.js";
import { validateAfterRule } from "./validate.js";

/**
 * @typedef {{
 *   radius: number,
 *   points: Map<string, { id: string, x: number, y: number, z: number, label?: string, meta?: object }>,
 *   spheres: Map<string, { id: string, centerId: string, cx: number, cy: number, cz: number, radius: number }>,
 *   spheresByCenter: Map<string, string>,
 *   edges: Map<string, { id: string, from: string, to: string, label?: string, meta?: object }>,
 *   history: object[],
 *   validations: Array<{ step: number, ruleType: string, ok: boolean, checks: object[], rule: object }>,
 *   throwOnFailure: boolean,
 * }} KernelState
 */

/**
 * @param {number} radius
 * @param {{ throwOnFailure?: boolean }} [opts]
 * @returns {KernelState}
 */
export function createKernel(radius, opts = {}) {
  if (!(radius > 0)) throw new Error("ConstructionKernel requires radius > 0");
  return {
    radius,
    points: new Map(),
    spheres: new Map(),
    spheresByCenter: new Map(),
    edges: new Map(),
    history: [],
    validations: [],
    throwOnFailure: opts.throwOnFailure !== false,
  };
}

function resolveCenter(state, id) {
  const p = state.points.get(id);
  if (!p) throw new Error(`Unknown point/center: ${id}`);
  return p;
}

function chooseIntersection(state, hits, choose, relativeToId, excludeIds = []) {
  const excluded = new Set(excludeIds);
  const placed = [...state.points.values()];
  let candidates = hits.filter(
    (h) =>
      !placed.some((p) => pointsEqual(p, h)) &&
      ![...excluded].some((id) => {
        const p = state.points.get(id);
        return p && pointsEqual(p, h);
      })
  );

  // If everything was "placed" but choose still needs a hit (e.g. origin is a hit),
  // fall back to hits not equal to excluded ids only.
  if (candidates.length === 0) {
    candidates = hits.filter((h) => {
      if (relativeToId) {
        const rel = state.points.get(relativeToId);
        if (rel && pointsEqual(h, rel)) return false;
      }
      return true;
    });
    // Prefer unused among those
    const unused = candidates.filter((h) => !placed.some((p) => pointsEqual(p, h)));
    if (unused.length) candidates = unused;
  }

  if (candidates.length === 0) {
    throw new Error(`No intersection candidates for choose=${choose}`);
  }

  const origin = state.points.get("seed-center") ?? [...state.points.values()][0];

  if (choose === "ccwUnused") {
    const rel = relativeToId ? resolveCenter(state, relativeToId) : null;
    if (!rel || !origin) {
      throw new Error("ccwUnused requires relativeToId and an origin");
    }
    return nextSeedCenterFromIntersection(origin, rel, state.radius, placed);
  }

  if (choose === "fartherFromOrigin") {
    if (!origin) throw new Error("fartherFromOrigin requires an origin point");
    return [...candidates].sort((a, b) => dist(b, origin) - dist(a, origin))[0];
  }

  if (choose === "nearerToOrigin") {
    if (!origin) throw new Error("nearerToOrigin requires an origin point");
    return [...candidates].sort((a, b) => dist(a, origin) - dist(b, origin))[0];
  }

  if (choose === "unused") {
    return candidates[0];
  }

  throw new Error(`Unknown intersection choose rule: ${choose}`);
}

/**
 * Apply one rule. Mutates state. Appends to history and validations.
 * @param {KernelState} state
 * @param {object} rule
 * @returns {{ kind: string, id?: string, data?: object, message?: string }}
 */
export function applyRule(state, rule) {
  let result = { kind: "ok" };

  try {
    switch (rule.type) {
      case RULE.PLACE_ORIGIN: {
        if (state.points.has(rule.pointId)) {
          throw new Error(`Point ${rule.pointId} already exists`);
        }
        const p = {
          id: rule.pointId,
          x: 0,
          y: 0,
          z: 0,
          label: rule.label ?? "origin",
          meta: { role: "origin" },
        };
        state.points.set(p.id, p);
        result = { kind: "point", id: p.id, data: p };
        break;
      }

      case RULE.DRAW_SPHERE: {
        const center = resolveCenter(state, rule.centerId);
        if (state.spheres.has(rule.sphereId)) {
          throw new Error(`Sphere ${rule.sphereId} already exists`);
        }
        const sphere = {
          id: rule.sphereId,
          centerId: rule.centerId,
          cx: center.x,
          cy: center.y,
          cz: center.z ?? 0,
          radius: state.radius,
        };
        state.spheres.set(sphere.id, sphere);
        state.spheresByCenter.set(rule.centerId, sphere.id);
        result = { kind: "sphere", id: sphere.id, data: sphere };
        break;
      }

      case RULE.RAY_CIRCLE_INTERSECTION: {
        if (state.points.has(rule.pointId)) {
          throw new Error(`Point ${rule.pointId} already exists`);
        }
        const origin = resolveCenter(state, rule.originId);
        const circleCenter = resolveCenter(state, rule.circleCenterId);
        // Circle must exist as a drawn sphere (parent construction)
        if (!state.spheresByCenter.has(rule.circleCenterId)) {
          throw new Error(
            `Parent sphere at ${rule.circleCenterId} must be drawn before ray intersection`
          );
        }
        let dir = rule.direction;
        if (rule.throughPointId) {
          const through = resolveCenter(state, rule.throughPointId);
          dir = {
            x: through.x - origin.x,
            y: through.y - origin.y,
            z: (through.z ?? 0) - (origin.z ?? 0),
          };
        }
        if (!dir) {
          throw new Error("rayCircleIntersection requires direction or throughPointId");
        }
        let pt;
        if (pointsEqual(origin, circleCenter)) {
          // Circumference mark on the same circle as the ray origin (Vesica step)
          pt = pointOnCircleAlongDirection(circleCenter, state.radius, [
            dir.x,
            dir.y,
            dir.z ?? 0,
          ]);
        } else {
          pt = rayCirclePoint(
            origin,
            dir,
            circleCenter,
            state.radius,
            rule.choose ?? "fartherFromOrigin"
          );
        }
        const p = {
          id: rule.pointId,
          x: pt.x,
          y: pt.y,
          z: pt.z ?? 0,
          label: rule.label ?? rule.pointId,
          meta: {
            determinedBy: {
              kind: "rayCircleIntersection",
              originId: rule.originId,
              circleCenterId: rule.circleCenterId,
              throughPointId: rule.throughPointId,
              direction: { x: dir.x, y: dir.y, z: dir.z ?? 0 },
              choose: rule.choose,
            },
          },
        };
        state.points.set(p.id, p);
        result = { kind: "point", id: p.id, data: p };
        break;
      }

      case RULE.CIRCLE_CIRCLE_INTERSECTION: {
        if (state.points.has(rule.pointId)) {
          throw new Error(`Point ${rule.pointId} already exists`);
        }
        const a = resolveCenter(state, rule.circleAId);
        const b = resolveCenter(state, rule.circleBId);
        if (!state.spheresByCenter.has(rule.circleAId)) {
          throw new Error(`Parent sphere at ${rule.circleAId} must be drawn first`);
        }
        if (!state.spheresByCenter.has(rule.circleBId)) {
          throw new Error(`Parent sphere at ${rule.circleBId} must be drawn first`);
        }
        const hits = intersectCirclesEqualRadius(a, b, state.radius);
        if (hits.length === 0) {
          throw new Error(
            `Circles ${rule.circleAId} and ${rule.circleBId} do not intersect at radius r`
          );
        }
        const pt = chooseIntersection(
          state,
          hits,
          rule.choose,
          rule.relativeToId,
          rule.relativeToId ? [rule.relativeToId] : []
        );
        const p = {
          id: rule.pointId,
          x: pt.x,
          y: pt.y,
          z: pt.z ?? 0,
          label: rule.label ?? rule.pointId,
          meta: {
            determinedBy: {
              kind: "circleCircleIntersection",
              circleAId: rule.circleAId,
              circleBId: rule.circleBId,
              choose: rule.choose,
              relativeToId: rule.relativeToId,
            },
          },
        };
        state.points.set(p.id, p);
        result = { kind: "point", id: p.id, data: p };
        break;
      }

      case RULE.CONNECT_CENTERS: {
        const fromId = rule.fromId ?? rule.from;
        const toId = rule.toId ?? rule.to;
        resolveCenter(state, fromId);
        resolveCenter(state, toId);
        if (state.edges.has(rule.edgeId)) {
          throw new Error(`Edge ${rule.edgeId} already exists`);
        }
        const edge = {
          id: rule.edgeId,
          from: fromId,
          to: toId,
          label: rule.label,
          meta: rule.meta,
        };
        state.edges.set(edge.id, edge);
        result = { kind: "edge", id: edge.id, data: edge };
        break;
      }

      case RULE.ALIAS_POINT: {
        const src = resolveCenter(state, rule.sourceId);
        if (state.points.has(rule.aliasId)) {
          throw new Error(`Point ${rule.aliasId} already exists`);
        }
        const p = {
          id: rule.aliasId,
          x: src.x,
          y: src.y,
          z: src.z ?? 0,
          label: rule.label ?? rule.aliasId,
          meta: {
            ...(rule.meta || {}),
            aliasOf: rule.sourceId,
            determinedBy: { kind: "aliasPoint", sourceId: rule.sourceId },
          },
        };
        state.points.set(p.id, p);
        result = { kind: "point", id: p.id, data: p };
        break;
      }

      default:
        throw new Error(`Unknown rule type: ${rule.type}`);
    }
  } catch (err) {
    result = { kind: "error", message: err.message };
  }

  const validation = validateAfterRule(state, rule, result);
  const record = {
    step: state.history.length,
    ruleType: rule.type,
    ok: validation.ok && result.kind !== "error",
    checks: validation.checks,
    rule: { ...rule },
    resultKind: result.kind,
    createdId: result.id,
  };
  state.history.push({ ...rule });
  state.validations.push(record);

  if (!record.ok && state.throwOnFailure) {
    const failed = validation.checks.filter((c) => !c.ok);
    const detail = failed.map((c) => `${c.name}: ${c.detail ?? "fail"}`).join("; ");
    throw new Error(
      `Construction validation failed at step ${record.step} (${rule.type}): ${detail || result.message}`
    );
  }

  return result;
}

/**
 * Replay a rule history from empty state through endIndex (inclusive).
 * @param {object[]} rules
 * @param {number} radius
 * @param {{ endIndex?: number, throwOnFailure?: boolean }} [opts]
 * @returns {KernelState}
 */
export function rebuild(rules, radius, opts = {}) {
  const state = createKernel(radius, { throwOnFailure: opts.throwOnFailure !== false });
  const end =
    opts.endIndex === undefined
      ? rules.length - 1
      : Math.max(-1, Math.min(opts.endIndex, rules.length - 1));
  for (let i = 0; i <= end; i += 1) {
    applyRule(state, rules[i]);
  }
  return state;
}

/**
 * Convert kernel state to ConstructionData for the renderer / discovery.
 * @param {KernelState} state
 * @param {{ id: string, name: string }} identity
 */
export function toConstructionData(state, identity) {
  const points = [];
  const sphereCenters = [];
  const circleCenters = [];
  const edges = [];

  let step = 0;
  // Preserve history order for points / spheres
  const seenPoints = new Set();
  const seenSpheres = new Set();

  state.history.forEach((rule, i) => {
    if (
      rule.type === RULE.PLACE_ORIGIN ||
      rule.type === RULE.RAY_CIRCLE_INTERSECTION ||
      rule.type === RULE.CIRCLE_CIRCLE_INTERSECTION ||
      rule.type === RULE.ALIAS_POINT
    ) {
      const id =
        rule.pointId ||
        rule.aliasId;
      if (id && state.points.has(id) && !seenPoints.has(id)) {
        step += 1;
        const p = state.points.get(id);
        points.push({
          id: p.id,
          x: p.x,
          y: p.y,
          z: p.z ?? 0,
          label: p.label,
          step,
          meta: p.meta,
          justification: rule.justification,
          determinedBy: p.meta?.determinedBy,
        });
        seenPoints.add(id);
      }
    }
    if (rule.type === RULE.DRAW_SPHERE && state.spheres.has(rule.sphereId)) {
      if (!seenSpheres.has(rule.sphereId)) {
        const s = state.spheres.get(rule.sphereId);
        const centerPoint = points.find((p) => p.id === s.centerId);
        const constructionStep = centerPoint?.step ?? sphereCenters.length + 1;
        sphereCenters.push({
          id: s.id,
          pointId: s.centerId,
          radius: s.radius,
          constructionStep,
          justification: rule.justification,
        });
        circleCenters.push({
          id: `circle-${s.centerId}`,
          pointId: s.centerId,
          radius: s.radius,
          normal: [0, 0, 1],
          constructionStep,
          justification: rule.justification,
        });
        seenSpheres.add(rule.sphereId);
      }
    }
    if (rule.type === RULE.CONNECT_CENTERS && state.edges.has(rule.edgeId)) {
      const e = state.edges.get(rule.edgeId);
      edges.push({
        id: e.id,
        from: e.from,
        to: e.to,
        step: sphereCenters.length || 1,
        label: e.label,
        meta: e.meta,
      });
    }
    void i;
  });

  // Ensure equal-radius neighbor lattice edges (constructible chords of length r)
  const edgeKeys = new Set(
    edges.map((e) => [e.from, e.to].sort().join("|"))
  );
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const d = dist(a, b);
      if (Math.abs(d - state.radius) > state.radius * 0.05) continue;
      const key = [a.id, b.id].sort().join("|");
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({
        id: `edge-${a.id}-${b.id}`,
        from: a.id,
        to: b.id,
        step: Math.max(a.step, b.step),
      });
    }
  }

  const allOk = state.validations.every((v) => v.ok);

  return {
    id: identity.id,
    name: identity.name,
    radius: state.radius,
    points,
    sphereCenters,
    circleCenters,
    edges,
    faces: [],
    maxStep: Math.max(1, ...points.map((p) => p.step), sphereCenters.length),
    meta: {
      procedural: true,
      constructionKernel: true,
      validated: allOk,
      historyLength: state.history.length,
      validations: state.validations.map((v) => ({
        step: v.step,
        ruleType: v.ruleType,
        ok: v.ok,
        checks: v.checks,
        createdId: v.createdId,
        justification: v.rule.justification,
        parents: parentsOfRule(v.rule),
      })),
    },
  };
}

function parentsOfRule(rule) {
  switch (rule.type) {
    case RULE.DRAW_SPHERE:
      return [rule.centerId];
    case RULE.RAY_CIRCLE_INTERSECTION:
      return [rule.originId, rule.circleCenterId];
    case RULE.CIRCLE_CIRCLE_INTERSECTION:
      return [rule.circleAId, rule.circleBId];
    case RULE.CONNECT_CENTERS:
      return [rule.fromId ?? rule.from, rule.toId ?? rule.to];
    case RULE.ALIAS_POINT:
      return [rule.sourceId];
    default:
      return [];
  }
}

/**
 * Export a legacy ConstructionPlayer plan from computed kernel state.
 * Operation coordinates are outputs of rules — not inputs.
 * @param {KernelState} state
 * @param {{ id: string, name: string, originId?: string }} identity
 */
export function toPlan(state, identity) {
  const operations = [];
  const originId = identity.originId ?? "seed-center";

  state.history.forEach((rule) => {
    if (rule.type === RULE.PLACE_ORIGIN) {
      const p = state.points.get(rule.pointId);
      operations.push({
        type: "placePoint",
        pointId: rule.pointId,
        point: vec(p.x, p.y, p.z ?? 0),
        label: rule.label,
        justification: rule.justification,
        determinedBy: { kind: "freeChoice", role: "origin" },
      });
    } else if (rule.type === RULE.RAY_CIRCLE_INTERSECTION) {
      const p = state.points.get(rule.pointId);
      const det = p.meta?.determinedBy;
      operations.push({
        type: "placePoint",
        pointId: rule.pointId,
        point: vec(p.x, p.y, p.z ?? 0),
        label: rule.label,
        justification: rule.justification,
        determinedBy: {
          kind: "rayCircleIntersection",
          circleCenterId: rule.circleCenterId,
          originId: rule.originId,
          throughPointId: rule.throughPointId,
          radius: state.radius,
          direction: det?.direction
            ? [det.direction.x, det.direction.y, det.direction.z ?? 0]
            : rule.direction
              ? [rule.direction.x, rule.direction.y, rule.direction.z ?? 0]
              : undefined,
          choose: rule.choose,
        },
      });
    } else if (rule.type === RULE.CIRCLE_CIRCLE_INTERSECTION) {
      const p = state.points.get(rule.pointId);
      operations.push({
        type: "placePoint",
        pointId: rule.pointId,
        point: vec(p.x, p.y, p.z ?? 0),
        label: rule.label,
        justification: rule.justification,
        determinedBy: {
          kind: "circleCircleIntersection",
          circleAId: rule.circleAId,
          circleBId: rule.circleBId,
          radius: state.radius,
          choose: rule.choose,
          relativeToId: rule.relativeToId,
        },
      });
    } else if (rule.type === RULE.ALIAS_POINT) {
      const p = state.points.get(rule.aliasId);
      operations.push({
        type: "placePoint",
        pointId: rule.aliasId,
        point: vec(p.x, p.y, p.z ?? 0),
        label: rule.label,
        justification: rule.justification,
        determinedBy: {
          kind: "aliasPoint",
          sourceId: rule.sourceId,
          role: rule.meta?.role,
          number: rule.meta?.number,
        },
      });
    } else if (rule.type === RULE.DRAW_SPHERE) {
      const p = state.points.get(rule.centerId);
      operations.push({
        type: "drawSphere",
        sphereId: rule.sphereId,
        centerId: rule.centerId,
        pointId: rule.centerId,
        radius: state.radius,
        justification: rule.justification,
        center: vec(p.x, p.y, p.z ?? 0),
      });
    } else if (rule.type === RULE.CONNECT_CENTERS) {
      operations.push({
        type: "addEdge",
        edgeId: rule.edgeId,
        from: rule.fromId ?? rule.from,
        to: rule.toId ?? rule.to,
        label: rule.label,
        meta: rule.meta,
        justification: rule.justification,
      });
    }
  });

  // finalizePlan-compatible shape
  const sphereOps = operations.filter((op) => op.type === "drawSphere");
  const plan = {
    id: identity.id,
    name: identity.name,
    radius: state.radius,
    originId,
    operations,
    sphereCount: sphereOps.length,
    rules: state.history.map((r) => ({ ...r })),
    validations: state.validations,
    operationIndexForSphereCount(count) {
      if (count <= 0) return -1;
      let seen = 0;
      for (let i = 0; i < operations.length; i += 1) {
        if (operations[i].type === "drawSphere") {
          seen += 1;
          if (seen >= count) return i;
        }
      }
      return operations.length - 1;
    },
  };
  return plan;
}

/**
 * Build construction data by replaying rules (canonical entry point for generators).
 */
export function buildFromRules(rules, radius, identity, opts = {}) {
  const state = rebuild(rules, radius, opts);
  return {
    state,
    data: toConstructionData(state, identity),
    plan: toPlan(state, identity),
  };
}
