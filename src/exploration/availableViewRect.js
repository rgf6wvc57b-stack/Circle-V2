/**
 * Compute the unobstructed canvas rectangle used for camera framing.
 * Coordinates are CSS pixels with origin at the top-left of the viewport.
 *
 * Does not hard-code a left shift — the rect is derived from the live panel
 * bounds, layout mode (right vs bottom), and safe-area insets.
 */

const MOBILE_MQ = "(max-width: 720px)";

/**
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export function readSafeAreaInsets() {
  if (typeof window === "undefined" || typeof getComputedStyle === "undefined") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const cs = getComputedStyle(document.documentElement);
  const num = (prop) => {
    const v = cs.getPropertyValue(prop).trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  // Prefer env() via CSS variables when present; fall back to 0.
  return {
    top: num("--sat") || num("--safe-area-inset-top") || 0,
    right: num("--sar") || num("--safe-area-inset-right") || 0,
    bottom: num("--sab") || num("--safe-area-inset-bottom") || 0,
    left: num("--sal") || num("--safe-area-inset-left") || 0,
  };
}

/**
 * Detect whether the panel is acting as a bottom sheet vs a right sidebar.
 * Prefers measured geometry; falls back to the mobile media query.
 * @param {DOMRectReadOnly | null} panelRect
 * @param {number} fullWidth
 * @param {number} fullHeight
 */
export function isBottomSheetPanel(panelRect, fullWidth, fullHeight) {
  if (panelRect && panelRect.width > 0 && panelRect.height > 0) {
    const coversWidth = panelRect.width >= fullWidth * 0.7;
    const sitsLow = panelRect.top >= fullHeight * 0.35;
    if (coversWidth && sitsLow) return true;
    const sitsRight = panelRect.left >= fullWidth * 0.45;
    if (sitsRight && !coversWidth) return false;
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia(MOBILE_MQ).matches;
  }
  return false;
}

/**
 * @param {{
 *   fullWidth: number,
 *   fullHeight: number,
 *   panelEl?: HTMLElement | null,
 *   panelOpen?: boolean,
 *   safeArea?: { top: number, right: number, bottom: number, left: number },
 *   topOccluderEl?: HTMLElement | null,
 * }} opts
 *   topOccluderEl — optional element (e.g. tutorial card) whose top edge further
 *   clips the usable geometry area above a bottom sheet.
 * @returns {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   fullWidth: number,
 *   fullHeight: number,
 *   panelOpen: boolean,
 *   layout: "full" | "right" | "bottom",
 * }}
 */
export function computeAvailableViewRect({
  fullWidth,
  fullHeight,
  panelEl = null,
  panelOpen = true,
  safeArea = null,
  topOccluderEl = null,
} = {}) {
  const W = Math.max(1, fullWidth || 1);
  const H = Math.max(1, fullHeight || 1);
  const safe = safeArea || readSafeAreaInsets();

  let x = Math.max(0, safe.left);
  let y = Math.max(0, safe.top);
  let width = Math.max(1, W - safe.left - safe.right);
  let height = Math.max(1, H - safe.top - safe.bottom);

  if (!panelOpen || !panelEl) {
    return {
      x,
      y,
      width,
      height,
      fullWidth: W,
      fullHeight: H,
      panelOpen: false,
      layout: "full",
    };
  }

  // Ignore transform-offscreen panels (fully hidden).
  const style = typeof getComputedStyle === "function" ? getComputedStyle(panelEl) : null;
  if (style && (style.visibility === "hidden" || style.display === "none")) {
    return {
      x,
      y,
      width,
      height,
      fullWidth: W,
      fullHeight: H,
      panelOpen: false,
      layout: "full",
    };
  }

  const pr = panelEl.getBoundingClientRect();
  if (pr.width < 8 || pr.height < 8) {
    return {
      x,
      y,
      width,
      height,
      fullWidth: W,
      fullHeight: H,
      panelOpen: false,
      layout: "full",
    };
  }

  // If the panel is translated fully off-screen, treat as closed for framing.
  if (pr.left >= W - 2 || pr.top >= H - 2 || pr.right <= 2 || pr.bottom <= 2) {
    return {
      x,
      y,
      width,
      height,
      fullWidth: W,
      fullHeight: H,
      panelOpen: false,
      layout: "full",
    };
  }

  const bottomSheet = isBottomSheetPanel(pr, W, H);
  if (bottomSheet) {
    let bottomLimit = Math.min(H, Math.max(y, pr.top));
    // Tutorial card (or other chrome) docked above the sheet further reduces
    // the usable geometry band: screen − safe − sheet − card.
    if (topOccluderEl && !topOccluderEl.hidden) {
      const ocStyle =
        typeof getComputedStyle === "function" ? getComputedStyle(topOccluderEl) : null;
      if (!ocStyle || (ocStyle.visibility !== "hidden" && ocStyle.display !== "none")) {
        const cr = topOccluderEl.getBoundingClientRect();
        if (cr.height > 8 && cr.top > y) {
          bottomLimit = Math.min(bottomLimit, cr.top);
        }
      }
    }
    height = Math.max(48, bottomLimit - y);
    return {
      x,
      y,
      width,
      height,
      fullWidth: W,
      fullHeight: H,
      panelOpen: true,
      layout: "bottom",
    };
  }

  // Right-side (or overlapping) panel — use the free region to its left.
  const panelLeft = Math.min(W, Math.max(x, pr.left));
  width = Math.max(48, panelLeft - x);
  return {
    x,
    y,
    width,
    height,
    fullWidth: W,
    fullHeight: H,
    panelOpen: true,
    layout: "right",
  };
}
