/**
 * Introduction “show on open” preference — shared checkbox + persistence.
 * Run: node scripts/verify-intro-preference.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  INTRO_PREF_KEY,
  getShowIntroOnOpen,
  setShowIntroOnOpen,
  syncIntroCheckboxes,
} from "../src/app/introPreference.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const mainSrc = readFileSync(join(root, "src/main.js"), "utf8");
const resetSrc = mainSrc.match(/function resetControlsToDefaults\(\)[\s\S]*?\n\}/)?.[0] || "";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

// --- Markup: shared checkboxes ---
{
  assert(/id="showIntroOnOpenDialog"/.test(html), "intro panel has preference checkbox");
  assert(/id="showIntroOnOpen"/.test(html), "Help settings has preference checkbox");
  assert(
    /Show introduction when the app opens/.test(html),
    "checkbox label text matches requirement"
  );
  const prefBoxes = [...html.matchAll(/data-intro-pref/g)];
  assert(prefBoxes.length === 2, `exactly two shared intro pref checkboxes (got ${prefBoxes.length})`);
  assert(/id="openTutorial"/.test(html), "Tutorial / Help button present");
  assert(/id="introOverlay"/.test(html), "introduction overlay present");
  assert(
    !/first.?visit|hasSeenIntro|introSeen/i.test(html + mainSrc),
    "no conflicting first-visit flag system"
  );
}

// --- Reset Controls must not touch intro preference ---
{
  assert(
    !/setShowIntroOnOpen|INTRO_PREF|showIntroOnOpen|intro-pref/.test(resetSrc),
    "resetControlsToDefaults does not modify intro preference"
  );
  assert(
    /Reset Controls must not change the intro-on-open preference/.test(mainSrc),
    "Reset Controls documents that intro preference is preserved"
  );
}

// --- Persistence API (mock localStorage) ---
{
  const store = Object.create(null);
  globalThis.localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
  };

  delete store[INTRO_PREF_KEY];
  assert(getShowIntroOnOpen() === true, "new user default: intro preference checked (true)");

  setShowIntroOnOpen(false);
  assert(store[INTRO_PREF_KEY] === "0", "unchecked preference persists as '0'");
  assert(getShowIntroOnOpen() === false, "getShowIntroOnOpen reads unchecked");

  setShowIntroOnOpen(true);
  assert(store[INTRO_PREF_KEY] === "1", "checked preference persists as '1'");
  assert(getShowIntroOnOpen() === true, "getShowIntroOnOpen reads checked");

  // Closing/completing intro must not auto-uncheck — there is no such side effect in the API.
  assert(
    !/setShowIntroOnOpen\s*\(\s*false\s*\)/.test(
      mainSrc.match(/const closeIntro[\s\S]*?openTutorial[\s\S]*?\n  \}\);/)?.[0] ||
        mainSrc.match(/introDone[\s\S]{0,400}/)?.[0] ||
        ""
    ),
    "closing intro does not force preference off"
  );

  // syncIntroCheckboxes updates every data-intro-pref control
  const a = { type: "checkbox", checked: false };
  const b = { type: "checkbox", checked: false };
  const fakeDoc = {
    querySelectorAll() {
      return [a, b];
    },
  };
  const realDoc = globalThis.document;
  globalThis.document = fakeDoc;
  syncIntroCheckboxes(true);
  assert(a.checked && b.checked, "syncIntroCheckboxes sets all shared checkboxes");
  syncIntroCheckboxes(false);
  assert(!a.checked && !b.checked, "syncIntroCheckboxes clears all shared checkboxes");
  globalThis.document = realDoc;
}

// --- Startup wiring ---
{
  assert(/getShowIntroOnOpen\(\)/.test(mainSrc), "startup reads shared intro preference");
  assert(
    /guidedTutorial\.start|setIntroOpen\(true\)/.test(mainSrc),
    "startup can open intro when preferred"
  );
  assert(/openTutorial/.test(mainSrc), "Tutorial button can open intro manually");
  assert(
    /data-intro-pref[\s\S]*onIntroPrefChange|onIntroPrefChange[\s\S]*data-intro-pref/.test(mainSrc),
    "both checkboxes share one change handler / preference value"
  );
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll intro-preference checks passed.");
