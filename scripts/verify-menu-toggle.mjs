/**
 * Compact Menu toggle layout (not a full-width bar).
 * Run: node scripts/verify-menu-toggle.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeAvailableViewRect,
  isBottomSheetPanel,
} from "../src/exploration/availableViewRect.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const css = readFileSync(join(root, "src/styles.css"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

// --- Markup: real button + a11y ---
{
  const btn = html.match(/<button[^>]*id="menuToggle"[^>]*>[\s\S]*?<\/button>/);
  assert(btn, "menuToggle is a real <button>");
  assert(/aria-controls="panel"/.test(btn[0]), "aria-controls=panel");
  assert(/aria-expanded=/.test(btn[0]), "aria-expanded present");
  assert(/aria-label=/.test(btn[0]), "aria-label present");
  assert(/menu-toggle-label">\s*Menu\s*</.test(btn[0]), "button label text is Menu");
  assert(/menu-toggle-bars/.test(btn[0]), "menu icon element present");
  const menuButtons = [...html.matchAll(/id="menuToggle"/g)];
  assert(menuButtons.length === 1, "exactly one menuToggle control");
}

// --- CSS: compact, upper-left, overrides width:100% ---
{
  const block = css.match(/\.menu-toggle\s*\{[\s\S]*?\n\}/);
  assert(block, ".menu-toggle rule exists");
  assert(/width:\s*auto/.test(block[0]), "menu-toggle sets width: auto (overrides button 100%)");
  assert(/max-width:\s*max-content/.test(block[0]), "menu-toggle max-width: max-content");
  assert(/min-width:\s*44px/.test(block[0]), "min touch width ~44px");
  assert(/min-height:\s*44px/.test(block[0]), "min touch height ~44px");
  assert(/left:\s*max\(/.test(block[0]), "menu-toggle anchored to the left (upper-left)");
  assert(/top:\s*max\(/.test(block[0]), "menu-toggle anchored to the top");
  assert(/right:\s*auto/.test(block[0]), "menu-toggle right: auto (not stretched from right)");
  assert(
    !/^\s*width:\s*100%\s*;/m.test(block[0]),
    "menu-toggle rule has no width: 100% property"
  );

  // Mobile must not relocate into a full-width strip above the sheet
  assert(
    !/#app:not\(\.panel-collapsed\)\s*\.menu-toggle\s*\{[\s\S]*?bottom:\s*calc\(46vh/.test(css),
    "removed mobile rule that parked a full-width toggle above the bottom sheet"
  );
  assert(
    /Keep the compact Menu button upper-left on phones/.test(css) ||
      /\.menu-toggle\s*\{[\s\S]*?left:\s*max\(12px/.test(css),
    "phone layout keeps menu toggle upper-left"
  );
}

// --- Available rect ignores the compact button (panel only) ---
{
  // Desktop / iPad: right panel
  const panelRect = {
    left: 700,
    right: 1020,
    top: 16,
    bottom: 700,
    width: 320,
    height: 684,
  };
  assert(!isBottomSheetPanel(panelRect, 1024, 768), "iPad/desktop panel is right-side");
  const rect = computeAvailableViewRect({
    fullWidth: 1024,
    fullHeight: 768,
    panelEl: { getBoundingClientRect: () => panelRect },
    panelOpen: true,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  assert(rect.layout === "right", "available rect layout is right");
  assert(rect.x === 0 && rect.y === 0, "available rect starts at origin (no phantom toolbar)");
  assert(rect.width === 700, "available width excludes only the panel");
  assert(rect.height === 768, "available height is full — not reduced by a menu bar");

  // iPhone bottom sheet
  const sheet = {
    left: 0,
    right: 390,
    top: 420,
    bottom: 844,
    width: 390,
    height: 424,
  };
  assert(isBottomSheetPanel(sheet, 390, 844), "iPhone panel is bottom sheet");
  const phone = computeAvailableViewRect({
    fullWidth: 390,
    fullHeight: 844,
    panelEl: { getBoundingClientRect: () => sheet },
    panelOpen: true,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  assert(phone.layout === "bottom", "phone available layout is bottom");
  assert(phone.height === 420, "phone available height is above sheet only");
  assert(phone.y === 0, "phone available rect not inset by a top toolbar");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll menu-toggle layout checks passed.");
console.log(
  "Root cause: global `button { width: 100% }` stretched #menuToggle across #app."
);
