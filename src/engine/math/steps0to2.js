/**
 * Layer 1 — Steps 0 through 2 only.
 *
 * Step 0: one point at the world origin.
 * Step 1: one sphere centered on that point, radius R.
 * Step 2: second equal-radius sphere whose center is exactly one radius from the first
 *         (Vesica Piscis construction).
 *
 * No Seed / Flower / Tree. No display transforms. No approximate layouts.
 */

import { pointOnCircleAlongDirection } from "../construction/compass.js";
import {
  EPS,
  cloneConstruction,
  distance3,
  freezeConstruction,
  nearlyEqual,
} from "./records.js";

/**
 * Construct Steps 0..endStep inclusive.
 *
 * @param {number} radius R > 0
 * @param {{ endStep?: 0|1|2, freeze?: boolean }} [opts]
 */
export function buildSteps0to2(radius, opts = {}) {
  const R = radius;
  if (!(R > 0) || !Number.isFinite(R)) {
    throw new Error(`Steps 0–2 require finite radius > 0 (got ${radius})`);
  }
  const endStep = opts.endStep ?? 2;
  if (![0, 1, 2].includes(endStep)) {
    throw new Error(`endStep must be 0, 1, or 2 (got ${endStep})`);
  }

  /** @type {import('./records.js').ConstructionPointRecord[]} */
  const points = [];
  /** @type {import('./records.js').ConstructionSphereRecord[]} */
  const spheres = [];
  const history = [];

  // --- Step 0: point at origin ---
  const origin = {
    id: "origin",
    x: 0,
    y: 0,
    z: 0,
    constructionStep: 0,
    parents: [],
    constructionRule: "placePoint at world origin (free choice of initial center)",
    validationStatus: {
      ok: true,
      checks: [{ name: "origin_is_zero", ok: true, detail: "(0, 0, 0)" }],
    },
  };
  points.push(origin);
  history.push({
    step: 0,
    rule: origin.constructionRule,
    created: ["origin"],
    parents: [],
    validationStatus: origin.validationStatus,
  });

  if (endStep === 0) {
    return finalize(R, points, spheres, history, endStep, opts.freeze !== false);
  }

  // --- Step 1: sphere centered on origin ---
  const sphere0 = {
    id: "sphere-0",
    center: { x: origin.x, y: origin.y, z: origin.z },
    centerId: "origin",
    radius: R,
    constructionStep: 1,
    parents: ["origin"],
    constructionRule: "drawSphere: compass at origin with opening R",
    validationStatus: { ok: false, checks: [] },
  };
  const sphere0Checks = [
    {
      name: "center_equals_origin",
      ok:
        nearlyEqual(sphere0.center.x, 0) &&
        nearlyEqual(sphere0.center.y, 0) &&
        nearlyEqual(sphere0.center.z, 0),
      detail: `(${sphere0.center.x}, ${sphere0.center.y}, ${sphere0.center.z})`,
    },
    {
      name: "radius_equals_R",
      ok: nearlyEqual(sphere0.radius, R, EPS),
      detail: `R=${R}`,
    },
    {
      name: "parent_is_origin",
      ok: sphere0.parents.includes("origin"),
      detail: sphere0.parents.join(","),
    },
  ];
  sphere0.validationStatus = {
    ok: sphere0Checks.every((c) => c.ok),
    checks: sphere0Checks,
  };
  if (!sphere0.validationStatus.ok) {
    throw new Error("Step 1 validation failed");
  }
  spheres.push(sphere0);
  history.push({
    step: 1,
    rule: sphere0.constructionRule,
    created: ["sphere-0"],
    parents: ["origin"],
    validationStatus: sphere0.validationStatus,
  });

  if (endStep === 1) {
    return finalize(R, points, spheres, history, endStep, opts.freeze !== false);
  }

  // --- Step 2: Vesica — second center from ray ∩ circle(sphere-0) ---
  // Free choice: first ray direction (+X). Constrained: distance to origin must equal R.
  const RAY_DIRECTION = [1, 0, 0];
  const mark = pointOnCircleAlongDirection(
    { x: origin.x, y: origin.y, z: origin.z },
    R,
    RAY_DIRECTION
  );

  const center1 = {
    id: "center-1",
    x: mark.x,
    y: mark.y,
    z: mark.z ?? 0,
    constructionStep: 2,
    parents: ["origin", "sphere-0"],
    constructionRule:
      "rayCircleIntersection: ray(origin, +X) ∩ circle(origin, R) — requires distance(origin, center-1) = R",
    validationStatus: { ok: false, checks: [] },
  };

  const dOriginToCenter1 = distance3(origin, center1);
  const center1Checks = [
    {
      name: "lies_on_circle_of_sphere_0",
      ok: nearlyEqual(dOriginToCenter1, R, EPS),
      detail: `distance(origin, center-1)=${dOriginToCenter1}, R=${R}`,
    },
    {
      name: "distance_equals_radius",
      ok: nearlyEqual(dOriginToCenter1, R, EPS),
      detail: `d=${dOriginToCenter1}`,
    },
  ];
  center1.validationStatus = {
    ok: center1Checks.every((c) => c.ok),
    checks: center1Checks,
  };
  if (!center1.validationStatus.ok) {
    throw new Error(
      `Step 2 point validation failed: ${center1Checks
        .filter((c) => !c.ok)
        .map((c) => `${c.name}: ${c.detail}`)
        .join("; ")}`
    );
  }
  points.push(center1);

  const sphere1 = {
    id: "sphere-1",
    center: { x: center1.x, y: center1.y, z: center1.z },
    centerId: "center-1",
    radius: R,
    constructionStep: 2,
    parents: ["center-1", "sphere-0", "origin"],
    constructionRule:
      "drawSphere: compass at center-1 with the same opening R (Vesica Piscis)",
    validationStatus: { ok: false, checks: [] },
  };

  const dCenters = distance3(sphere0.center, sphere1.center);
  const sphere1Checks = [
    {
      name: "radius_equals_R",
      ok: nearlyEqual(sphere1.radius, R, EPS),
      detail: `sphere-1.radius=${sphere1.radius}, R=${R}`,
    },
    {
      name: "equal_radii",
      ok: nearlyEqual(sphere0.radius, sphere1.radius, EPS),
      detail: `r0=${sphere0.radius}, r1=${sphere1.radius}`,
    },
    {
      name: "center_distance_equals_R",
      ok: nearlyEqual(dCenters, R, EPS),
      detail: `distance(sphere-0.center, sphere-1.center)=${dCenters}, R=${R}`,
    },
    {
      name: "center_matches_center_1",
      ok:
        nearlyEqual(sphere1.center.x, center1.x) &&
        nearlyEqual(sphere1.center.y, center1.y) &&
        nearlyEqual(sphere1.center.z, center1.z),
      detail: `(${sphere1.center.x}, ${sphere1.center.y}, ${sphere1.center.z})`,
    },
  ];
  sphere1.validationStatus = {
    ok: sphere1Checks.every((c) => c.ok),
    checks: sphere1Checks,
  };
  if (!sphere1.validationStatus.ok) {
    throw new Error(
      `Step 2 sphere validation failed: ${sphere1Checks
        .filter((c) => !c.ok)
        .map((c) => `${c.name} (${c.detail})`)
        .join("; ")}`
    );
  }
  spheres.push(sphere1);
  history.push({
    step: 2,
    rule: sphere1.constructionRule,
    created: ["center-1", "sphere-1"],
    parents: ["origin", "sphere-0"],
    validationStatus: {
      ok: center1.validationStatus.ok && sphere1.validationStatus.ok,
      checks: [...center1Checks, ...sphere1Checks],
      proof: {
        center0: { ...sphere0.center },
        center1: { ...sphere1.center },
        radius: R,
        centerToCenterDistance: dCenters,
        epsilon: EPS,
      },
    },
  });

  return finalize(R, points, spheres, history, endStep, opts.freeze !== false);
}

function finalize(R, points, spheres, history, endStep, freeze) {
  const allOk =
    points.every((p) => p.validationStatus.ok) &&
    spheres.every((s) => s.validationStatus.ok);

  const doc = {
    id: "steps0to2",
    name: "Vesica Piscis (Steps 0–2)",
    layer: 1,
    radius: R,
    endStep,
    points,
    spheres,
    history,
    meta: {
      sourceOfTruth: "src/engine/math/steps0to2.js",
      epsilon: EPS,
      validated: allOk,
      vesica:
        endStep >= 2
          ? {
              center0: { ...spheres[0].center },
              center1: { ...spheres[1].center },
              radius: R,
              centerToCenterDistance: distance3(spheres[0].center, spheres[1].center),
            }
          : null,
    },
  };

  return freeze ? freezeConstruction(doc) : doc;
}

/** Rebuild from radius and endStep only (coordinates are outputs, never inputs). */
export function rebuildSteps0to2(radius, endStep = 2) {
  return buildSteps0to2(radius, { endStep, freeze: true });
}

/** Plain snapshot for Layer 3 (clone; Layer 1 document stays frozen). */
export function snapshotForRenderer(construction) {
  return cloneConstruction(construction);
}
