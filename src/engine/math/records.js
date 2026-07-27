/**
 * Layer 1 — mathematical construction records.
 * These are the source of truth. Validation and rendering must not mutate them.
 */

export const EPS = 1e-9;

/**
 * @typedef {{
 *   id: string,
 *   x: number,
 *   y: number,
 *   z: number,
 *   constructionStep: number,
 *   parents: string[],
 *   constructionRule: string,
 *   validationStatus: { ok: boolean, checks: Array<{ name: string, ok: boolean, detail?: string }> },
 * }} ConstructionPointRecord
 */

/**
 * @typedef {{
 *   id: string,
 *   center: { x: number, y: number, z: number },
 *   centerId: string,
 *   radius: number,
 *   constructionStep: number,
 *   parents: string[],
 *   constructionRule: string,
 *   validationStatus: { ok: boolean, checks: Array<{ name: string, ok: boolean, detail?: string }> },
 * }} ConstructionSphereRecord
 */

/**
 * Deep-freeze a construction document so Layer 2/3 cannot silently mutate it.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function freezeConstruction(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      freezeConstruction(value[key]);
    }
  }
  return value;
}

/** Structural clone for renderer snapshots (Layer 3 may own a copy; Layer 1 stays frozen). */
export function cloneConstruction(value) {
  return structuredClone(value);
}

export function distance3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function nearlyEqual(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}
