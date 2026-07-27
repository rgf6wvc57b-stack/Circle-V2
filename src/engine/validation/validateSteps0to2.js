/**
 * Layer 2 — validation of Steps 0–2.
 * Reads construction data; never modifies centers, radii, or relationships.
 */

import { EPS, distance3, nearlyEqual } from "../math/records.js";

/**
 * @param {ReturnType<import('../math/steps0to2.js').buildSteps0to2>} construction
 * @returns {{ ok: boolean, failures: string[], proof: object | null }}
 */
export function validateSteps0to2(construction) {
  const failures = [];
  const R = construction.radius;

  const origin = construction.points.find((p) => p.id === "origin");
  if (!origin) failures.push("missing point origin");
  else {
    if (!nearlyEqual(origin.x, 0) || !nearlyEqual(origin.y, 0) || !nearlyEqual(origin.z, 0)) {
      failures.push(`origin is not (0,0,0): (${origin.x},${origin.y},${origin.z})`);
    }
    if (origin.constructionStep !== 0) failures.push("origin.constructionStep !== 0");
  }

  if (construction.endStep >= 1) {
    const s0 = construction.spheres.find((s) => s.id === "sphere-0");
    if (!s0) failures.push("missing sphere-0");
    else {
      if (!nearlyEqual(s0.center.x, 0) || !nearlyEqual(s0.center.y, 0) || !nearlyEqual(s0.center.z, 0)) {
        failures.push(`sphere-0 center not origin: (${s0.center.x},${s0.center.y},${s0.center.z})`);
      }
      if (!nearlyEqual(s0.radius, R, EPS)) failures.push(`sphere-0.radius !== R (${s0.radius} vs ${R})`);
      if (s0.constructionStep !== 1) failures.push("sphere-0.constructionStep !== 1");
      if (!s0.parents?.includes("origin")) failures.push("sphere-0 missing parent origin");
      if (!s0.constructionRule) failures.push("sphere-0 missing constructionRule");
      if (!s0.validationStatus || typeof s0.validationStatus.ok !== "boolean") {
        failures.push("sphere-0 missing validationStatus");
      }
    }
  }

  let proof = null;
  if (construction.endStep >= 2) {
    const s0 = construction.spheres.find((s) => s.id === "sphere-0");
    const s1 = construction.spheres.find((s) => s.id === "sphere-1");
    const c1 = construction.points.find((p) => p.id === "center-1");
    if (!s1) failures.push("missing sphere-1");
    if (!c1) failures.push("missing center-1");
    if (s0 && s1) {
      if (!nearlyEqual(s1.radius, R, EPS)) failures.push(`sphere-1.radius !== R (${s1.radius} vs ${R})`);
      if (!nearlyEqual(s0.radius, s1.radius, EPS)) failures.push("sphere radii unequal");
      const d = distance3(s0.center, s1.center);
      if (!nearlyEqual(d, R, EPS)) {
        failures.push(`distance(center0,center1)=${d} !== R=${R}`);
      }
      if (s1.constructionStep !== 2) failures.push("sphere-1.constructionStep !== 2");
      requireSphereProvenance(s1, failures, "sphere-1");
      proof = {
        center0: { ...s0.center },
        center1: { ...s1.center },
        radius: R,
        centerToCenterDistance: d,
        epsilon: EPS,
        pass: nearlyEqual(d, R, EPS) && nearlyEqual(s1.radius, R, EPS),
      };
    }
    if (s1) requireSphereProvenance(s1, failures, "sphere-1");
  }

  if (construction.endStep >= 1) {
    const s0 = construction.spheres.find((s) => s.id === "sphere-0");
    if (s0) requireSphereProvenance(s0, failures, "sphere-0");
  }

  return { ok: failures.length === 0, failures, proof };
}

function requireSphereProvenance(sphere, failures, label) {
  const required = [
    "id",
    "center",
    "radius",
    "constructionStep",
    "parents",
    "constructionRule",
    "validationStatus",
  ];
  for (const key of required) {
    if (sphere[key] === undefined || sphere[key] === null) {
      failures.push(`${label} missing ${key}`);
    }
  }
  if (sphere.center) {
    for (const axis of ["x", "y", "z"]) {
      if (typeof sphere.center[axis] !== "number") {
        failures.push(`${label}.center.${axis} not a number`);
      }
    }
  }
  if (!Array.isArray(sphere.parents)) failures.push(`${label}.parents not an array`);
  if (sphere.validationStatus && typeof sphere.validationStatus.ok !== "boolean") {
    failures.push(`${label}.validationStatus.ok not boolean`);
  }
}
