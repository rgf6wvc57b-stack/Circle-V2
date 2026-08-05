/**
 * Construction step clamping — keeps UI/state within [0, maxStep].
 *
 * Step semantics (static slider / showStaticStep):
 * - 0: empty visible geometry (nothing with step > 0 revealed)
 * - 1..max: reveal points/spheres/edges whose step <= current
 * - legacy MAX_SAFE_INTEGER: resolves to max (full geometry)
 */

/**
 * @param {number} step
 * @param {number} maxStep
 * @returns {number}
 */
export function clampConstructionStep(step, maxStep) {
  const max = Math.max(0, Math.round(Number(maxStep) || 0));
  if (max === 0) return 0;

  const raw = Number(step);
  if (isLegacyFullConstructionStep(raw)) {
    return max;
  }
  if (!Number.isFinite(raw)) {
    return max;
  }
  if (raw < 0) return 0;
  return Math.max(0, Math.min(max, Math.round(raw)));
}

/**
 * Legacy saved state used MAX_SAFE_INTEGER to mean "show full geometry".
 * @param {unknown} value
 */
export function isLegacyFullConstructionStep(value) {
  return Number(value) === Number.MAX_SAFE_INTEGER;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isInvalidConstructionStep(value) {
  if (isLegacyFullConstructionStep(value)) return false;
  const n = Number(value);
  return !Number.isFinite(n) || n < 0;
}

/**
 * Resolve a saved construction step once the engine max is known.
 * Maps the legacy full-geometry sentinel to max; clamps other values safely.
 * @param {number} step
 * @param {number} maxStep
 * @returns {number}
 */
export function resolveConstructionStep(step, maxStep) {
  const max = Math.max(0, Math.round(Number(maxStep) || 0));
  if (max === 0) return 0;
  if (isLegacyFullConstructionStep(step)) return max;
  return clampConstructionStep(step, max);
}

/**
 * Format step label as "current / total".
 * @param {number} step
 * @param {number} maxStep
 */
export function formatConstructionStepLabel(step, maxStep) {
  const max = Math.max(0, Math.round(Number(maxStep) || 0));
  const current = clampConstructionStep(step, max);
  return `${current} / ${max}`;
}

/**
 * Count sphere centers visible at a static construction step (mirrors ConstructionSystem).
 * @param {import('../schema.js').ConstructionData | null | undefined} fullData
 * @param {number} step
 */
export function countVisibleSpheresAtStep(fullData, step) {
  if (!fullData) return 0;
  const max = fullData.maxStep ?? 0;
  const clamped = clampConstructionStep(step, max);
  const points = fullData.points.filter((p) => p.step <= clamped);
  const visibleIds = new Set(points.map((p) => p.id));
  return fullData.sphereCenters.filter((s) => visibleIds.has(s.pointId)).length;
}
