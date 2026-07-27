/**
 * Primitive constructions: Point, Circle, Sphere, Vesica Piscis.
 * Built from mathematical steps — not display layouts.
 */
import { createEmptyConstruction } from "../schema.js";
import { buildSteps0to2 } from "../math/steps0to2.js";
import { pointOnCircleAlongDirection } from "../construction/compass.js";

export function generatePoint(radius) {
  const data = createEmptyConstruction("point", "Point", radius);
  data.points.push({
    id: "origin",
    x: 0,
    y: 0,
    z: 0,
    label: "origin",
    step: 1,
    meta: { role: "origin" },
  });
  data.maxStep = 1;
  data.meta = { sphereBased: false, primitive: "point" };
  return data;
}

export function generateCircle(radius) {
  const data = createEmptyConstruction("circle", "Circle", radius);
  data.points.push({
    id: "origin",
    x: 0,
    y: 0,
    z: 0,
    label: "center",
    step: 1,
    meta: { role: "origin" },
  });
  data.circleCenters.push({
    id: "circle-origin",
    pointId: "origin",
    radius,
    normal: [0, 0, 1],
  });
  // Mark one point on the circumference for construction identity
  const mark = pointOnCircleAlongDirection({ x: 0, y: 0, z: 0 }, radius, [1, 0, 0]);
  data.points.push({
    id: "circle-mark",
    x: mark.x,
    y: mark.y,
    z: mark.z ?? 0,
    label: "east",
    step: 2,
  });
  data.maxStep = 2;
  data.meta = { sphereBased: false, primitive: "circle" };
  return data;
}

export function generateSphere(radius) {
  const data = createEmptyConstruction("sphere", "Sphere", radius);
  data.points.push({
    id: "origin",
    x: 0,
    y: 0,
    z: 0,
    label: "center",
    step: 1,
    meta: { role: "origin" },
  });
  data.sphereCenters.push({ id: "sphere-0", pointId: "origin", radius });
  data.circleCenters.push({
    id: "circle-origin",
    pointId: "origin",
    radius,
    normal: [0, 0, 1],
  });
  data.maxStep = 1;
  data.meta = { sphereBased: true, primitive: "sphere" };
  return data;
}

export function generateVesicaPiscis(radius) {
  const doc = buildSteps0to2(radius, { endStep: 2, freeze: false });
  const data = createEmptyConstruction("vesicaPiscis", "Vesica Piscis", radius);
  doc.points.forEach((p, i) => {
    data.points.push({
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      label: p.id,
      step: i + 1,
      meta: { role: p.id === "origin" ? "origin" : undefined },
      justification: p.constructionRule,
    });
  });
  doc.spheres.forEach((s) => {
    data.sphereCenters.push({
      id: s.id,
      pointId: s.centerId,
      radius: s.radius,
      justification: s.constructionRule,
    });
    data.circleCenters.push({
      id: `circle-${s.centerId}`,
      pointId: s.centerId,
      radius: s.radius,
      normal: [0, 0, 1],
    });
  });
  data.maxStep = 2;
  data.meta = {
    sphereBased: true,
    primitive: "vesicaPiscis",
    validated: doc.meta?.validated,
    vesica: doc.meta?.vesica,
  };
  return data;
}

export function generateSingleSphere(radius) {
  const data = createEmptyConstruction("singleSphere", "Single Sphere", radius);
  data.points.push({
    id: "origin",
    x: 0,
    y: 0,
    z: 0,
    label: "center",
    step: 1,
    meta: { role: "origin" },
  });
  data.sphereCenters.push({ id: "sphere-origin", pointId: "origin", radius });
  data.maxStep = 1;
  data.meta = { sphereBased: true, primitive: "singleSphere" };
  return data;
}

export function generateTwoIntersectingSpheres(radius) {
  const data = createEmptyConstruction("twoIntersectingSpheres", "Two Intersecting Spheres", radius);
  data.points.push(
    {
      id: "origin",
      x: 0,
      y: 0,
      z: 0,
      label: "center-a",
      step: 1,
      meta: { role: "origin" },
    },
    {
      id: "east",
      x: radius,
      y: 0,
      z: 0,
      label: "center-b",
      step: 2,
    }
  );
  data.sphereCenters.push(
    { id: "sphere-origin", pointId: "origin", radius },
    { id: "sphere-east", pointId: "east", radius }
  );
  data.maxStep = 2;
  data.meta = { sphereBased: true, primitive: "twoIntersectingSpheres" };
  return data;
}
