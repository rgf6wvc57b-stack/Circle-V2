/**
 * Shared preference: whether the introduction opens automatically on startup.
 * Persists on-device via localStorage. Default for a new user is ON (checked).
 */

export const INTRO_PREF_KEY = "geometry-explor:show-intro-on-open";

/**
 * @returns {boolean} true when the intro should auto-open (default for new users)
 */
export function getShowIntroOnOpen() {
  try {
    const raw = localStorage.getItem(INTRO_PREF_KEY);
    if (raw === null || raw === undefined) return true;
    if (raw === "0" || raw === "false") return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * @param {boolean} on
 */
export function setShowIntroOnOpen(on) {
  try {
    localStorage.setItem(INTRO_PREF_KEY, on ? "1" : "0");
  } catch {
    /* private mode / blocked storage — ignore */
  }
}

/** @param {boolean} on */
export function syncIntroCheckboxes(on) {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-intro-pref]").forEach((el) => {
    if (el && el.type === "checkbox" && "checked" in el) {
      el.checked = Boolean(on);
    }
  });
}
