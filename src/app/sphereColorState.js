/**
 * Application-level sphere color state (not geometry definitions).
 */

/** Startup / Reset Controls default sphere & circle presentation color. */
export const DEFAULT_SPHERE_COLOR = "#FFD84D";
/** Startup / Reset Controls default opacity (45%). */
export const DEFAULT_SPHERE_OPACITY = 0.45;

export const COLOR_MODE = Object.freeze({
  GLOBAL: "global",
  INDIVIDUAL: "individual",
});

export const OPACITY_PRESETS = Object.freeze({
  solid: 1,
  transparent: 0.45,
  watercolor: 0.28,
});

export function createSphereColorState() {
  return {
    mode: COLOR_MODE.GLOBAL,
    global: { hex: DEFAULT_SPHERE_COLOR, opacity: DEFAULT_SPHERE_OPACITY },
    /** @type {Record<string, { hex: string, opacity: number }>} */
    bySphereId: {},
    selectedSphereId: null,
    /** @type {{ hex: string, opacity: number } | null} */
    clipboard: null,
  };
}

export function resetSphereColorState(state) {
  state.mode = COLOR_MODE.GLOBAL;
  state.global = { hex: DEFAULT_SPHERE_COLOR, opacity: DEFAULT_SPHERE_OPACITY };
  state.bySphereId = {};
  state.selectedSphereId = null;
  state.clipboard = null;
  return state;
}

export function resolveSphereColor(state, sphereId, fallbackIndex = 0) {
  if (state.mode === COLOR_MODE.INDIVIDUAL && state.bySphereId[sphereId]) {
    return { ...state.bySphereId[sphereId] };
  }
  return { ...state.global };
}

export function setGlobalColor(state, hex, opacity) {
  state.global = {
    hex,
    opacity: clampOpacity(opacity),
  };
}

export function setIndividualColor(state, sphereId, hex, opacity) {
  if (!sphereId) return;
  state.bySphereId[sphereId] = {
    hex,
    opacity: clampOpacity(opacity),
  };
}

export function resetSphereColor(state, sphereId) {
  if (!sphereId) return;
  delete state.bySphereId[sphereId];
}

export function resetAllIndividualColors(state) {
  state.bySphereId = {};
}

export function copySphereColor(state, sphereId) {
  const color = resolveSphereColor(state, sphereId);
  state.clipboard = { ...color };
  return state.clipboard;
}

export function pasteSphereColor(state, sphereId) {
  if (!sphereId || !state.clipboard) return false;
  state.bySphereId[sphereId] = { ...state.clipboard };
  return true;
}

export function clampOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SPHERE_OPACITY;
  return Math.min(1, Math.max(0, n));
}

export function opacityPercent(opacity) {
  return Math.round(clampOpacity(opacity) * 100);
}

export function materialFlagsForOpacity(opacity) {
  const o = clampOpacity(opacity);
  if (o >= 0.999) {
    return {
      transparent: false,
      opacity: 1,
      depthWrite: true,
      solid: true,
    };
  }
  return {
    transparent: true,
    opacity: o,
    depthWrite: false,
    solid: false,
  };
}
