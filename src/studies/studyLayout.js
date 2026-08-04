/**
 * Study-mode poster layout: reserve space for the open control panel and
 * keep camera framing + HTML overlay in sync.
 */
import {
  computeAvailableViewRect,
} from "../exploration/availableViewRect.js";

/**
 * Whether study layout should use the full viewport (poster mode / export).
 * @param {{ posterMode?: boolean, exporting?: boolean }} opts
 */
export function isStudyFullFrameLayout({ posterMode = false, exporting = false } = {}) {
  return Boolean(posterMode || exporting);
}

/**
 * @param {{
 *   fullWidth: number,
 *   fullHeight: number,
 *   panelEl?: HTMLElement | null,
 *   panelOpen?: boolean,
 *   posterMode?: boolean,
 *   exporting?: boolean,
 *   safeArea?: { top: number, right: number, bottom: number, left: number },
 *   topOccluderEl?: HTMLElement | null,
 * }} opts
 * @returns {{
 *   rect: ReturnType<typeof computeAvailableViewRect>,
 *   insets: {
 *     insetRight: number,
 *     insetBottom: number,
 *     availableWidth: number,
 *     availableHeight: number,
 *     layout: "full" | "right" | "bottom",
 *   },
 *   fullFrame: boolean,
 * }}
 */
export function computeStudyViewLayout({
  fullWidth,
  fullHeight,
  panelEl = null,
  panelOpen = true,
  posterMode = false,
  exporting = false,
  safeArea = null,
  topOccluderEl = null,
} = {}) {
  const W = Math.max(1, fullWidth || 1);
  const H = Math.max(1, fullHeight || 1);
  const fullFrame = isStudyFullFrameLayout({ posterMode, exporting });

  if (fullFrame) {
    return {
      rect: {
        x: 0,
        y: 0,
        width: W,
        height: H,
        fullWidth: W,
        fullHeight: H,
        panelOpen: false,
        layout: "full",
      },
      insets: {
        insetRight: 0,
        insetBottom: 0,
        availableWidth: W,
        availableHeight: H,
        layout: "full",
      },
      fullFrame: true,
    };
  }

  const rect = computeAvailableViewRect({
    fullWidth: W,
    fullHeight: H,
    panelEl,
    panelOpen,
    safeArea,
    topOccluderEl,
  });

  const insetRight = rect.layout === "right" ? Math.max(0, W - rect.x - rect.width) : 0;
  const insetBottom = rect.layout === "bottom" ? Math.max(0, H - rect.y - rect.height) : 0;

  return {
    rect,
    insets: {
      insetRight,
      insetBottom,
      availableWidth: rect.width,
      availableHeight: rect.height,
      layout: rect.layout,
    },
    fullFrame: false,
  };
}

/** @deprecated Use computeStudyViewLayout */
export function computeStudyPosterInsets(opts) {
  return computeStudyViewLayout(opts).insets;
}

/**
 * Apply poster inset CSS variables and layout classes on #app.
 *
 * @param {HTMLElement | null} appRoot
 * @param {ReturnType<typeof computeStudyViewLayout>["insets"]} insets
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
  appRoot.classList.remove("study-panel-right", "study-panel-bottom", "study-full-frame", "study-poster-exporting");
}
