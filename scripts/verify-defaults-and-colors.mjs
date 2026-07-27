/**
 * Defaults, geometry ordering, and sphere color behavior.
 * Run: node scripts/verify-defaults-and-colors.mjs
 */
import * as THREE from "three";
import {
  listGeometries,
  listGeometryOptions,
  generateGeometry,
} from "../src/engine/generators/index.js";
import {
  GEOMETRY_CATALOG,
  DEFAULT_UI_GEOMETRY_ID,
  listGeometriesByComplexity,
  listUiGeometryOptions,
  defaultRendererFor,
  isRendererCompatible,
} from "../src/engine/geometries/catalog.js";
import {
  listUiRenderModeOptions,
  isUiRenderMode,
  coerceToUiRenderMode,
  HIDDEN_RENDER_MODES,
} from "../src/engine/renderer/uiRenderModes.js";
import { ConstructionEngine } from "../src/engine/index.js";
import { sacredGeometrySequence } from "../src/engine/evolution/sequences/sacredGeometry.js";
import {
  COLOR_MODE,
  createSphereColorState,
  resetSphereColorState,
  setGlobalColor,
  setIndividualColor,
  resolveSphereColor,
  materialFlagsForOpacity,
  opacityPercent,
  DEFAULT_SPHERE_COLOR,
  DEFAULT_SPHERE_OPACITY,
  OPACITY_PRESETS,
} from "../src/app/sphereColorState.js";
import { GeometryRenderer, RENDER_MODES } from "../src/engine/renderer/GeometryRenderer.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

// --- Default animation speed 0 ---
{
  const mainSrc = readFileSync(join(__dirname, "../src/main.js"), "utf8");
  assert(/animSpeed:\s*0\b/.test(mainSrc), "default animation speed is 0 in ui state");
  const html = readFileSync(join(__dirname, "../index.html"), "utf8");
  assert(/id="animSpeed"[^>]*value="0"/.test(html), "animSpeed input default value is 0");
  assert(
    /Reset View[\s\S]*must not restart|do not restart rotation|Camera only/i.test(mainSrc) ||
      mainSrc.includes("do not restart rotation"),
    "Reset View documented to not restart rotation"
  );
}

// --- Geometries sorted by complexity metadata ---
{
  const ids = listGeometries();
  const expected = listGeometriesByComplexity().map((g) => g.id);
  assert(
    JSON.stringify(ids) === JSON.stringify(expected),
    `geometries sorted by complexity: ${ids.join(" → ")}`
  );
  assert(
    ids[0] === "point" && ids.includes("vesicaPiscis") && ids.includes("fruitOfLife"),
    "full catalog still includes Point → … → Vesica → Fruit (internal)"
  );
  assert(
    !ids.includes("merkaba") || GEOMETRY_CATALOG.every((g) => g.id !== "merkaba"),
    "Merkaba not in complexity-ordered UI catalog (replaced by Metatron/Platonics)"
  );
  const alpha = [...ids].sort((a, b) => a.localeCompare(b));
  assert(JSON.stringify(ids) !== JSON.stringify(alpha), "ordering is not alphabetical");
}

// --- Geometry dropdown: hide Point/Circle/Sphere; Vesica default ---
{
  const menu = listGeometryOptions();
  const menuIds = menu.map((g) => g.id);
  const expectedMenu = [
    "vesicaPiscis",
    "seedOfLife",
    "flowerOfLife",
    "endless",
    "fruitOfLife",
    "metatronCube",
    "treeOfLife",
    "platonicSolids",
    "tesseract",
  ];
  assert(
    JSON.stringify(menuIds) === JSON.stringify(expectedMenu),
    `Geometry dropdown options: ${menuIds.join(" → ")}`
  );
  assert(!menuIds.includes("point"), "Point is not present in the Geometry dropdown");
  assert(!menuIds.includes("circle"), "Circle is not present in the Geometry dropdown");
  assert(!menuIds.includes("sphere"), "Sphere is not present in the Geometry dropdown");
  assert(menuIds[0] === "vesicaPiscis", "Vesica Piscis is the first Geometry dropdown option");
  assert(
    DEFAULT_UI_GEOMETRY_ID === "vesicaPiscis",
    "DEFAULT_UI_GEOMETRY_ID is vesicaPiscis"
  );

  const mainSrc = readFileSync(join(__dirname, "../src/main.js"), "utf8");
  assert(
    /geometry:\s*DEFAULT_UI_GEOMETRY_ID/.test(mainSrc),
    "Vesica Piscis (DEFAULT_UI_GEOMETRY_ID) is selected on initial load"
  );
  assert(
    /ui\.geometry\s*=\s*DEFAULT_UI_GEOMETRY_ID/.test(mainSrc),
    "Reset Controls restores Vesica Piscis, not a removed option"
  );
  assert(
    !/ui\.geometry\s*=\s*"point"/.test(mainSrc) && !/geometry:\s*"point"/.test(mainSrc),
    "main.js no longer defaults geometry to point"
  );

  // Internal primitives still registered and generate
  for (const id of ["point", "circle", "sphere"]) {
    const def = GEOMETRY_CATALOG.find((g) => g.id === id);
    assert(def && def.showInGeometryMenu === false, `${id} remains in catalog but menu-hidden`);
    const data = generateGeometry(id, 1.1);
    assert(data && data.points?.length >= 1, `internal ${id} primitive still works`);
  }
  assert(
    listUiGeometryOptions().every((g) => g.showInGeometryMenu !== false),
    "listUiGeometryOptions returns only menu-visible entries"
  );
  const complexities = menu.map((g) => g.complexity);
  assert(
    complexities.every((c, i) => i === 0 || c >= complexities[i - 1]),
    "dropdown complexity values are non-decreasing"
  );
}

// --- Sphere-based default renderer Solid Spheres ---
{
  const sphereBased = GEOMETRY_CATALOG.filter((g) => g.sphereBased && g.id !== "treeOfLife");
  sphereBased.forEach((g) => {
    assert(
      defaultRendererFor(g.id) === RENDER_MODES.spheres,
      `${g.id} defaults to Solid Spheres`
    );
  });
  assert(
    defaultRendererFor("point") === "points",
    "Point uses its own default renderer (points)"
  );
  assert(
    defaultRendererFor("circle") === "circles",
    "Circle uses its own default renderer (circles)"
  );
  assert(
    defaultRendererFor("treeOfLife") === "mixed",
    "Tree of Life defaults to Mixed (visible renderer)"
  );
  assert(
    isUiRenderMode(defaultRendererFor("treeOfLife")),
    "Tree of Life default renderer is menu-visible"
  );
}

// --- Renderer layers: hide Construction Plane + Tree specialty renderers ---
{
  const menuOptions = listUiRenderModeOptions();
  const menu = menuOptions.map((m) => m.id);
  const menuLabels = menuOptions.map((m) => m.label);
  const expected = ["spheres", "circles", "points", "connections"];
  assert(
    JSON.stringify(menu) === JSON.stringify(expected),
    `Renderer layer options: ${menu.join(" → ")}`
  );
  assert(!menu.includes("mixed"), "Mixed Mode is not a separate renderer layer");
  assert(!menu.includes("constructionPlane"), "Construction Plane is absent from Renderer layers");
  assert(
    !menu.includes("traditionalTreeOfLife"),
    "Traditional Tree of Life is absent from Renderer layers"
  );
  assert(
    !menu.includes("geometricTreeOfLife"),
    "Geometric Tree of Life is absent from Renderer layers"
  );
  // Explicit label absence (user-facing strings)
  for (const label of [
    "Construction Plane",
    "Traditional Tree of Life",
    "Geometric Tree of Life",
    "Mixed Mode",
  ]) {
    assert(!menuLabels.includes(label), `removed label absent from Renderer control: "${label}"`);
  }
  const html = readFileSync(join(__dirname, "../index.html"), "utf8");
  assert(/rendererMultiselect/.test(html), "HTML has multi-select Renderer control");
  assert(!/<select id="renderMode">/.test(html), "legacy renderMode <select> removed");
  assert(!/Construction Plane/.test(html.match(/rendererMultiselect[\s\S]*?<\/section>/)?.[0] || ""), "Renderer control has no Construction Plane");
  for (const hidden of HIDDEN_RENDER_MODES) {
    assert(!menu.includes(hidden), `hidden mode ${hidden} not in Renderer layers`);
    assert(!isUiRenderMode(hidden), `${hidden} is not a UI render mode`);
  }

  const startup = defaultRendererFor(DEFAULT_UI_GEOMETRY_ID);
  assert(isUiRenderMode(startup), "no removed renderer is selected on startup");
  assert(startup === "spheres", "startup default renderer is Solid Spheres");

  const mainSrc = readFileSync(join(__dirname, "../src/main.js"), "utf8");
  assert(
    /DEFAULT_ACTIVE_RENDER_LAYERS/.test(mainSrc),
    "Reset Controls restores default activeRenderLayers"
  );
  assert(
    !/activeRenderLayers\.add\(\s*["']constructionPlane["']\s*\)/.test(mainSrc),
    "Reset/UI does not assign Construction Plane as a layer"
  );
  assert(
    !/setActiveRenderLayers\(\s*\[[^\]]*traditionalTreeOfLife/.test(mainSrc),
    "UI does not assign Traditional Tree as a layer"
  );

  // Tree of Life still renders with a remaining valid renderer
  const group = new THREE.Group();
  const engine = new ConstructionEngine(group);
  engine.setGeometry("treeOfLife");
  const treeDefault = defaultRendererFor("treeOfLife");
  engine.setRenderMode(treeDefault);
  const data = engine.getFullData();
  assert(data?.sphereCenters?.length === 10, "Tree of Life still generates 10 Sephirot");
  assert(
    group.children.length > 0 || engine.renderer.mode === treeDefault,
    "Tree of Life still renders with a remaining valid renderer"
  );
  engine.redraw();
  assert(group.children.length > 0, "Tree of Life Mixed renderer produces meshes");

  // Geometry switches never land on a missing/hidden default
  for (const g of listUiGeometryOptions()) {
    const mode = coerceToUiRenderMode(defaultRendererFor(g.id));
    assert(isUiRenderMode(mode), `${g.id} default renderer is visible (${mode})`);
    assert(isRendererCompatible(g.id, mode), `${g.id} compatible with ${mode}`);
    engine.setGeometry(g.id);
    engine.setRenderMode(mode);
  }

  // Evolution Tree step uses a visible renderer
  const treeStep = sacredGeometrySequence.steps.find((s) => s.id === "tree");
  assert(
    treeStep && isUiRenderMode(treeStep.renderMode),
    "Evolution Tree step uses a visible render mode"
  );

  // Legacy renderer implementations still exist (not deleted)
  assert(
    RENDER_MODES.constructionPlane === "constructionPlane",
    "constructionPlane renderer code still registered"
  );
  assert(
    RENDER_MODES.traditionalTreeOfLife === "traditionalTreeOfLife",
    "traditionalTreeOfLife renderer code still registered"
  );
}

// --- Global / individual colors ---
{
  const state = createSphereColorState();
  setGlobalColor(state, "#ff0000", 1);
  assert(state.global.hex === "#ff0000", "global color updates state");
  const a = resolveSphereColor(state, "sphere-0");
  const b = resolveSphereColor(state, "sphere-1");
  assert(a.hex === "#ff0000" && b.hex === "#ff0000", "global color applies to all spheres");

  state.mode = COLOR_MODE.INDIVIDUAL;
  setIndividualColor(state, "sphere-1", "#00ff00", 0.5);
  const c0 = resolveSphereColor(state, "sphere-0");
  const c1 = resolveSphereColor(state, "sphere-1");
  assert(c0.hex === "#ff0000", "individual mode: unselected keeps global");
  assert(c1.hex === "#00ff00" && c1.opacity === 0.5, "individual color changes only selected");
}

// --- Opacity material flags ---
{
  const solid = materialFlagsForOpacity(1);
  assert(
    solid.transparent === false && solid.opacity === 1 && solid.depthWrite === true,
    "opacity 100% → opaque material flags"
  );
  const soft = materialFlagsForOpacity(0.4);
  assert(
    soft.transparent === true && soft.opacity === 0.4 && soft.depthWrite === false,
    "opacity below 100% → transparent material flags"
  );
}

// --- Renderer creates correct materials ---
{
  const group = new THREE.Group();
  const renderer = new GeometryRenderer(group);
  const data = generateGeometry("vesicaPiscis", 1.2);
  const colors = createSphereColorState();
  setGlobalColor(colors, DEFAULT_SPHERE_COLOR, 1);
  renderer.setAppearance({ sphereColors: colors });
  renderer.setMode(RENDER_MODES.spheres);
  renderer.setData(data);

  const mats = [];
  group.traverse((o) => {
    if (o.isMesh && o.userData?.kind === "sphere") mats.push(o.material);
  });
  assert(mats.length === 2, `vesica renders 2 spheres (got ${mats.length})`);
  assert(
    mats.every((m) => m.transparent === false && m.opacity === 1 && m.depthWrite === true),
    "Solid global opacity → opaque sphere materials"
  );

  setGlobalColor(colors, DEFAULT_SPHERE_COLOR, 0.3);
  renderer.updateSphereColors({ sphereColors: colors });
  const mats2 = [];
  group.traverse((o) => {
    if (o.isMesh && o.userData?.kind === "sphere") mats2.push(o.material);
  });
  assert(
    mats2.every((m) => m.transparent === true && m.opacity === 0.3),
    "opacity 30% → transparent sphere materials"
  );

  // Individual: only one sphere changes
  colors.mode = COLOR_MODE.INDIVIDUAL;
  setIndividualColor(colors, data.sphereCenters[1].id, "#112233", 1);
  // also key by pointId used in selection
  setIndividualColor(colors, data.sphereCenters[1].pointId, "#112233", 1);
  renderer.updateSphereColors({ sphereColors: colors });
  const after = [];
  group.traverse((o) => {
    if (o.isMesh && o.userData?.kind === "sphere") {
      after.push({
        id: o.userData.specId,
        pointId: o.userData.pointId,
        hex: o.material.color.getHexString(),
      });
    }
  });
  const s0 = after.find((s) => s.id === data.sphereCenters[0].id);
  const s1 = after.find((s) => s.id === data.sphereCenters[1].id);
  assert(s0 && s1, "both spheres present after individual update");
  assert(s1.hex === "112233", "selected sphere got individual color");
  assert(s0.hex !== "112233", "other sphere unchanged by individual color");
}

// --- Startup defaults: yellow #FFD84D @ 45% opacity ---
{
  assert(
    DEFAULT_SPHERE_COLOR.toUpperCase() === "#FFD84D",
    `initial color equals #FFD84D (got ${DEFAULT_SPHERE_COLOR})`
  );
  assert(
    DEFAULT_SPHERE_OPACITY === 0.45,
    `initial opacity equals 0.45 (got ${DEFAULT_SPHERE_OPACITY})`
  );
  const initial = createSphereColorState();
  assert(
    initial.global.hex.toUpperCase() === "#FFD84D",
    "createSphereColorState color is #FFD84D"
  );
  assert(initial.global.opacity === 0.45, "createSphereColorState opacity is 0.45");
  assert(opacityPercent(initial.global.opacity) === 45, "visible opacity label is 45%");

  const html = readFileSync(join(__dirname, "../index.html"), "utf8");
  assert(
    /id="globalSphereColor"[^>]*value="#ffd84d"/i.test(html),
    "color picker HTML default reflects #FFD84D"
  );
  assert(
    /id="globalSphereOpacityValue">45%</i.test(html),
    "opacity label HTML default is 45%"
  );
  assert(
    /id="globalSphereOpacity"[\s\S]*?value="45"/i.test(html),
    "opacity slider HTML default is 45"
  );
  assert(
    !/#3ecfbf/i.test(html) || !/globalSphereColor[^>]*#3ecfbf/i.test(html),
    "old teal #3ecfbf removed from global color picker default"
  );

  const mainSrc = readFileSync(join(__dirname, "../src/main.js"), "utf8");
  assert(
    /resetSphereColorState\(ui\.sphereColors\)/.test(mainSrc),
    "Reset Controls restores sphere color state defaults"
  );
  // Geometry / renderer switches must not reset color state
  const geometryHandler = mainSrc.match(
    /getElementById\("geometry"\)\.addEventListener\("change"[\s\S]*?\n  \}\);/
  );
  assert(geometryHandler, "geometry change handler found");
  assert(
    !/resetSphereColorState/.test(geometryHandler[0]),
    "switching geometry does not reset opacity or color"
  );
  const renderHandler = mainSrc.match(
    /querySelectorAll\("\[data-render-layer\]"\)\.forEach\(\(el\) => \{\n    el\.addEventListener\("change"[\s\S]*?\n  \}\);/
  );
  assert(renderHandler, "renderer layer change handler found");
  assert(
    !/resetSphereColorState/.test(renderHandler[0]),
    "switching renderer layers does not reset opacity or color"
  );
}

// --- Reset Controls restores defaults ---
{
  const state = createSphereColorState();
  state.mode = COLOR_MODE.INDIVIDUAL;
  setGlobalColor(state, "#abcdef", 0.2);
  setIndividualColor(state, "x", "#000000", 0.1);
  resetSphereColorState(state);
  assert(state.mode === COLOR_MODE.GLOBAL, "reset: color mode global");
  assert(
    state.global.hex.toUpperCase() === "#FFD84D",
    "Reset Controls restores color #FFD84D"
  );
  assert(state.global.opacity === 0.45, "Reset Controls restores opacity 0.45");
  assert(Object.keys(state.bySphereId).length === 0, "reset: cleared individual colors");
  assert(OPACITY_PRESETS.solid === 1, "Solid preset is 100%");
  assert(OPACITY_PRESETS.transparent === 0.45, "Transparent preset remains 45%");
}

// --- Geometry / renderer switches preserve color state through rebuild ---
{
  const group = new THREE.Group();
  const renderer = new GeometryRenderer(group);
  const colors = createSphereColorState();
  assert(colors.global.hex.toUpperCase() === "#FFD84D", "preserve test starts at default color");
  assert(colors.global.opacity === 0.45, "preserve test starts at default opacity");

  renderer.setAppearance({ sphereColors: colors });
  renderer.setMode(RENDER_MODES.spheres);
  renderer.setData(generateGeometry("vesicaPiscis", 1.2));

  // Switch geometry without touching color state
  renderer.setData(generateGeometry("seedOfLife", 1.2));
  assert(
    colors.global.hex.toUpperCase() === "#FFD84D" && colors.global.opacity === 0.45,
    "switching geometry preserves color and opacity"
  );

  // Switch renderer without touching color state
  renderer.setMode(RENDER_MODES.circles);
  renderer.updateSphereColors({ sphereColors: colors });
  assert(
    colors.global.hex.toUpperCase() === "#FFD84D" && colors.global.opacity === 0.45,
    "switching renderer preserves color and opacity"
  );

  const resolved = resolveSphereColor(colors, "any");
  assert(resolved.hex.toUpperCase() === "#FFD84D", "resolved color remains #FFD84D after switches");
  assert(resolved.opacity === 0.45, "resolved opacity remains 0.45 after switches");
  const flags = materialFlagsForOpacity(resolved.opacity);
  assert(flags.transparent === true && flags.opacity === 0.45, "0.45 uses transparent material flags");
}

// --- Generators exist for catalog ---
{
  listGeometriesByComplexity().forEach((g) => {
    const data = generateGeometry(g.id, 1.1);
    assert(data && data.id, `generator works for ${g.id}`);
  });
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll defaults/colors checks passed.");
