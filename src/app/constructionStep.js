/**
 * Construction step clamping — keeps UI/state within [0, maxStep].
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
  if (!Number.isFinite(raw) || raw === Number.MAX_SAFE_INTEGER) {
    return max;
  }
  if (raw < 0) return 0;
  return Math.max(0, Math.min(max, Math.round(raw)));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isInvalidConstructionStep(value) {
  const n = Number(value);
  return !Number.isFinite(n) || n === Number.MAX_SAFE_INTEGER || n < 0;
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
