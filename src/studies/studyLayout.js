/**
 * Study-mode poster layout: reserve space for the open control panel and
 * expose CSS custom properties for the HTML overlay.
 */
import { computeAvailableViewRect } from "../exploration/availableViewRect.js";

/**
 * @param {{
 *   fullWidth: number,
 *   fullHeight: number,
 *   panelEl?: HTMLElement | null,
 *   panelOpen?: boolean,
 *   posterMode?: boolean,
 *   safeArea?: { top: number, right: number, bottom: number, left: number },
 * }} opts
 * @returns {{
 *   insetRight: number,
 *   insetBottom: number,
 *   availableWidth: number,
 *   availableHeight: number,
 *   layout: "full" | "right" | "bottom",
 * }}
 */
export function computeStudyPosterInsets({
  fullWidth,
  fullHeight,
  panelEl = null,
  panelOpen = true,
  posterMode = false,
  safeArea = null,
} = {}) {
  const W = Math.max(1, fullWidth || 1);
  const H = Math.max(1, fullHeight || 1);

  if (posterMode) {
    return {
      insetRight: 0,
      insetBottom: 0,
      availableWidth: W,
      availableHeight: H,
      layout: "full",
    };
  }

  const rect = computeAvailableViewRect({
    fullWidth: W,
    fullHeight: H,
    panelEl,
    panelOpen,
    safeArea,
  });

  const insetRight = rect.layout === "right" ? Math.max(0, W - rect.x - rect.width) : 0;
  const insetBottom = rect.layout === "bottom" ? Math.max(0, H - rect.y - rect.height) : 0;

  return {
    insetRight,
    insetBottom,
    availableWidth: rect.width,
    availableHeight: rect.height,
    layout: rect.layout,
  };
}

/**
 * Apply poster inset CSS variables and layout classes on #app.
 *
 * @param {HTMLElement | null} appRoot
 * @param {ReturnType<typeof computeStudyPosterInsets>} insets
 */
export function applyStudyPosterInsets(appRoot, insets) {
  if (!appRoot) return;
  const { insetRight, insetBottom, layout } = insets;
  appRoot.style.setProperty("--study-panel-inset-right", `${Math.round(insetRight)}px`);
  appRoot.style.setProperty("--study-panel-inset-bottom", `${Math.round(insetBottom)}px`);
  appRoot.classList.toggle("study-panel-right", layout === "right" && insetRight > 8);
  appRoot.classList.toggle("study-panel-bottom", layout === "bottom" && insetBottom > 8);
}

/**
 * Clear study poster inset overrides (e.g. on study exit).
 * @param {HTMLElement | null} appRoot
 */
export function clearStudyPosterInsets(appRoot) {
  if (!appRoot) return;
  appRoot.style.removeProperty("--study-panel-inset-right");
  appRoot.style.removeProperty("--study-panel-inset-bottom");
  appRoot.classList.remove("study-panel-right", "study-panel-bottom");
}
