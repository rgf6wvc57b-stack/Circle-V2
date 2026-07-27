/**
 * Mobile bottom-sheet panel states for phones (< 600 CSS px).
 * States: collapsed (peek) · half (~48% height) · expanded (~82% height)
 */

export const SHEET_STATE = Object.freeze({
  COLLAPSED: "collapsed",
  HALF: "half",
  EXPANDED: "expanded",
});

/** Dedicated mobile tutorial layout breakpoint (narrower than 600 CSS px). */
export const MOBILE_TUTORIAL_MQ = "(max-width: 599px)";

/** Broader phone/sheet layout (existing bottom sheet). */
export const MOBILE_SHEET_MQ = "(max-width: 720px)";

const ORDER = [SHEET_STATE.COLLAPSED, SHEET_STATE.HALF, SHEET_STATE.EXPANDED];

/**
 * @returns {boolean}
 */
export function isMobileTutorialLayout() {
  return Boolean(
    typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia(MOBILE_TUTORIAL_MQ).matches
  );
}

/**
 * @returns {boolean}
 */
export function isMobileSheetLayout() {
  return Boolean(
    typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia(MOBILE_SHEET_MQ).matches
  );
}

/**
 * @returns {string}
 */
export function getSheetState() {
  const app = document.getElementById("app");
  const raw = app?.getAttribute("data-sheet-state");
  if (raw === SHEET_STATE.COLLAPSED || raw === SHEET_STATE.HALF || raw === SHEET_STATE.EXPANDED) {
    return raw;
  }
  return SHEET_STATE.HALF;
}

/**
 * Apply a bottom-sheet state. Clears legacy panel-collapsed when showing a peek/half/expanded sheet.
 * @param {string} state
 * @param {{ syncCollapsedFlag?: boolean }} [opts]
 */
export function setSheetState(state, { syncCollapsedFlag = true } = {}) {
  const app = document.getElementById("app");
  const panel = document.getElementById("panel");
  if (!app || !panel) return;

  const next =
    state === SHEET_STATE.COLLAPSED || state === SHEET_STATE.EXPANDED || state === SHEET_STATE.HALF
      ? state
      : SHEET_STATE.HALF;

  app.setAttribute("data-sheet-state", next);
  panel.dataset.sheetState = next;

  if (syncCollapsedFlag) {
    // Collapsed peek stays visible; only fully hide via explicit non-sheet close on desktop.
    app.classList.toggle("panel-collapsed", false);
  }

  const toggle = document.getElementById("menuToggle");
  if (toggle) {
    const open = next !== SHEET_STATE.COLLAPSED;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Collapse controls" : "Show controls");
    toggle.title = open ? "Collapse controls" : "Show controls";
  }
}

/**
 * Cycle collapsed → half → expanded → collapsed.
 * @param {1 | -1} [dir]
 */
export function cycleSheetState(dir = 1) {
  const cur = getSheetState();
  const idx = ORDER.indexOf(cur);
  const next = ORDER[(idx + (dir >= 0 ? 1 : ORDER.length - 1)) % ORDER.length];
  setSheetState(next);
  return next;
}

/**
 * Bind drag / click on the sheet handle. Returns an unbind function.
 * @param {{ onChange?: (state: string) => void }} [opts]
 */
export function bindSheetHandle({ onChange } = {}) {
  const handle = document.getElementById("sheetHandle");
  const panel = document.getElementById("panel");
  if (!handle || !panel) return () => {};

  let dragging = false;
  let startY = 0;
  let startState = SHEET_STATE.HALF;

  const emit = () => onChange?.(getSheetState());

  const onPointerDown = (e) => {
    if (!isMobileSheetLayout()) return;
    dragging = true;
    startY = e.clientY;
    startState = getSheetState();
    handle.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    // Drag down → smaller sheet; drag up → larger.
    if (dy > 48) {
      if (startState === SHEET_STATE.EXPANDED) setSheetState(SHEET_STATE.HALF);
      else if (startState === SHEET_STATE.HALF) setSheetState(SHEET_STATE.COLLAPSED);
      emit();
      dragging = false;
    } else if (dy < -48) {
      if (startState === SHEET_STATE.COLLAPSED) setSheetState(SHEET_STATE.HALF);
      else if (startState === SHEET_STATE.HALF) setSheetState(SHEET_STATE.EXPANDED);
      emit();
      dragging = false;
    }
  };

  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    const dy = Math.abs(e.clientY - startY);
    // Tap / small move cycles upward.
    if (dy < 10) {
      cycleSheetState(1);
      emit();
    }
  };

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", onPointerUp);
  handle.addEventListener("pointercancel", () => {
    dragging = false;
  });

  document.getElementById("sheetCollapseBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const cur = getSheetState();
    if (cur === SHEET_STATE.EXPANDED) setSheetState(SHEET_STATE.HALF);
    else setSheetState(SHEET_STATE.COLLAPSED);
    emit();
  });
  document.getElementById("sheetExpandBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const cur = getSheetState();
    if (cur === SHEET_STATE.COLLAPSED) setSheetState(SHEET_STATE.HALF);
    else setSheetState(SHEET_STATE.EXPANDED);
    emit();
  });

  return () => {
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("pointermove", onPointerMove);
    handle.removeEventListener("pointerup", onPointerUp);
  };
}

/** Nominal half-open height fraction used during guided steps. */
export const SHEET_HALF_HEIGHT_FRACTION = 0.45;
