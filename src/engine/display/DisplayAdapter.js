/**
 * Layer 3 — display adapter.
 * May clone construction data for mesh building, but must never mutate Layer 1.
 * Contains no construction logic (no intersections, no layout tables).
 */

import { cloneConstruction } from "../math/records.js";

/**
 * Prepare a display snapshot from frozen Layer 1 data.
 * @param {object} construction frozen Layer 1 document
 * @param {{ rotationY?: number, zoom?: number, projection?: string, overlaysEnabled?: boolean }} [view]
 */
export function prepareDisplaySnapshot(construction, view = {}) {
  const snapshot = cloneConstruction(construction);
  // View parameters affect only this adapter's metadata — never sphere centers/radii.
  snapshot.display = {
    rotationY: view.rotationY ?? 0,
    zoom: view.zoom ?? 1,
    projection: view.projection ?? "perspective",
    overlaysEnabled: Boolean(view.overlaysEnabled),
  };
  return snapshot;
}

/**
 * Assert Layer 1 construction centers/radii unchanged vs a prior JSON fingerprint.
 * @returns {{ ok: boolean, detail?: string }}
 */
export function assertConstructionUnchanged(before, after) {
  const pick = (doc) =>
    JSON.stringify({
      radius: doc.radius,
      points: doc.points.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z })),
      spheres: doc.spheres.map((s) => ({
        id: s.id,
        center: s.center,
        radius: s.radius,
        parents: s.parents,
        constructionStep: s.constructionStep,
        constructionRule: s.constructionRule,
      })),
    });
  const a = pick(before);
  const b = pick(after);
  if (a !== b) {
    return { ok: false, detail: "construction geometry changed" };
  }
  return { ok: true };
}
