import * as THREE from "three";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { ConstructionEngine } from "./engine/index.js";
import { EvolutionController } from "./engine/evolution/EvolutionController.js";
import { CameraController } from "./exploration/CameraController.js";
import { computeAvailableViewRect } from "./exploration/availableViewRect.js";
import {
  DEFAULT_FIT_MARGIN,
  MOBILE_TUTORIAL_FIT_MARGIN,
  MOBILE_TUTORIAL_MIN_DISTANCE,
  FRONT_FRAME_DIRECTION,
} from "./exploration/framingDefaults.js";
import { FocusSystem } from "./exploration/FocusSystem.js";
import { MeasurementMode } from "./exploration/MeasurementMode.js";
import { DisplayOverlays } from "./exploration/DisplayOverlays.js";
import { DiscoveryEngine } from "./discovery/DiscoveryEngine.js";
import { listGeometryOptions } from "./engine/generators/index.js";
import {
  DEFAULT_UI_GEOMETRY_ID,
  defaultRenderLayersFor,
  isRendererCompatible,
} from "./engine/geometries/catalog.js";
import {
  ENDLESS_DEFAULT_RINGS,
  ENDLESS_MAX_RINGS,
  ENDLESS_MIN_RINGS,
  clampEndlessExpansionStep,
  clampEndlessRings,
  hexLatticeCenterCount,
} from "./engine/generators/endless.js";
import {
  DEFAULT_ACTIVE_RENDER_LAYERS,
  RENDER_LAYERS,
  RENDER_LAYER_DRAW_ORDER,
  coerceToUiRenderMode,
  isRenderLayerId,
  isUiRenderMode,
  layersEqual,
  layersFromLegacyMode,
  legacyModeFromLayers,
  normalizeRenderLayers,
  summarizeRenderLayers,
} from "./engine/renderer/uiRenderModes.js";
import {
  COLOR_MODE,
  OPACITY_PRESETS,
  createSphereColorState,
  resetSphereColorState,
  setGlobalColor,
  setIndividualColor,
  resetSphereColor,
  resetAllIndividualColors,
  copySphereColor,
  pasteSphereColor,
  resolveSphereColor,
  opacityPercent,
  DEFAULT_SPHERE_COLOR,
  DEFAULT_SPHERE_OPACITY,
} from "./app/sphereColorState.js";
import {
  createRenderLayerStyles,
  resetRenderLayerStyles,
  patchRenderLayerStyle,
  snapshotRenderLayerStyles,
} from "./app/renderLayerStyles.js";
import {
  getShowIntroOnOpen,
  setShowIntroOnOpen,
  syncIntroCheckboxes,
} from "./app/introPreference.js";
import { GuidedTutorial, TUTORIAL_STEPS } from "./app/guidedTutorial.js";
import {
  SHEET_STATE,
  isMobileTutorialLayout,
  isMobileSheetLayout,
  setSheetState,
  getSheetState,
  bindSheetHandle,
} from "./app/mobileSheet.js";
const canvas = document.getElementById("viewport");
const appRoot = document.getElementById("app");

/** @type {import("./app/guidedTutorial.js").GuidedTutorial | null} */
let guidedTutorial = null;

const TREE_VIEW_HINTS = {
  traditional:
    "Traditional: complete Kabbalistic diagram — 10 Sephirot and 22 paths in one plane.",
  spatial:
    "Spatial: the same Tree coordinates as Traditional, drawn as 3D spheres and path tubes.",
  geometric:
    "Geometric: the same 10+22 Tree graph, plus construction circles, intersections, and optional FoL overlay.",
};

const RENDERING_PRESETS = {
  watercolor: { material: "physical", wireframe: false, palette: "spectrum", blendStrength: 1.2, colorIntensity: 1.1, globalOpacity: 35 },
  frostedGlass: { material: "physical", wireframe: false, palette: "ocean", blendStrength: 0.8, colorIntensity: 0.9, globalOpacity: 50 },
  clearGlass: { material: "physical", wireframe: false, palette: "ocean", blendStrength: 0.6, colorIntensity: 0.8, globalOpacity: 25 },
  solid: { material: "standard", wireframe: false, palette: "ocean", blendStrength: 1, colorIntensity: 1, globalOpacity: 100 },
  wireframe: { material: "standard", wireframe: true, palette: "ocean", blendStrength: 1, colorIntensity: 1, globalOpacity: 100 },
  softGlow: { material: "standard", wireframe: false, palette: "spectrum", blendStrength: 1.5, colorIntensity: 1.5, globalOpacity: 70 },
};

const ENVIRONMENT_PRESETS = {
  darkSpace: { background: "#0e1a24", fogColor: "#0e1a24", fogDensity: 0.035, ambient: 1.1, key: 1.35, fill: 0.45 },
  neutralStudio: { background: "#e8e8e8", fogColor: "#e8e8e8", fogDensity: 0.02, ambient: 1.3, key: 1.2, fill: 0.6 },
  softWhite: { background: "#f5f5f5", fogColor: "#f5f5f5", fogDensity: 0.015, ambient: 1.4, key: 1.0, fill: 0.7 },
  transparent: { background: null, fogColor: null, fogDensity: 0, ambient: 1.2, key: 1.3, fill: 0.5 },
};

const STORAGE_KEY = "geometryExplorState_v1";
let lastSave = 0;

const ui = {
  geometry: DEFAULT_UI_GEOMETRY_ID,
  /** @type {Set} order-independent active renderer layers (source of truth) */
  activeRenderLayers: new Set(DEFAULT_ACTIVE_RENDER_LAYERS),
  /**
   * Legacy single-mode label derived from activeRenderLayers (evolution / older APIs).
   * Not the source of truth for presentation.
   */
  renderMode: legacyModeFromLayers(DEFAULT_ACTIVE_RENDER_LAYERS),
  treeViewMode: "traditional",
  geometricFlags: {
    showTree: true,
    showConstructionGeometry: true,
    showFlowerOverlay: false,
    showIntersections: true,
    showSymmetryAxes: true,
  },
  radius: 1.2,
  pathThickness: 1,
  constructionStep: 1,
  constructionMode: false,
  evolutionMode: false,
  /** Endless geometry: max lattice ring depth (R). */
  endlessRings: ENDLESS_DEFAULT_RINGS,
  /** Endless geometry: currently visible rings (1..endlessRings). */
  endlessExpansionStep: ENDLESS_DEFAULT_RINGS,
  endlessAutoExpand: false,
  autoPlay: false,
  transparency: 0,
  wireframe: false,
  material: "standard",
  animSpeed: 0,
  /** Legacy accent palette — Watercolor removed from the UI; Ocean is the visible default. */
  palette: "ocean",
  colorIntensity: 1,
  blendStrength: 1,
  sphereColors: createSphereColorState(),
  /** Independent presentation styles per renderer layer (not visibility). */
  renderLayerStyles: createRenderLayerStyles(),
  /** Session: user explicitly chose renderer layers */
  userPickedRenderer: false,
  /** Session: last user layer set (array snapshot) */
  sessionRenderLayers: null,
  /** @deprecated legacy field cleared on reset; layers are preserved across Construction Mode */
  renderModeBeforeConstruction: null,
  /** Control panel visibility — framing uses the remaining viewport when open. */
  panelOpen: true,
  /** New features */
  autoRotate: false,
  autoRotateSpeed: 1.0,
  renderingPreset: "custom",
  backgroundColor: "#0e1a24",
  transparentBackground: false,
  lightingIntensity: 1.0,
  environmentPreset: "darkSpace",
};function syncDerivedRenderMode() {
  ui.renderMode = legacyModeFromLayers(ui.activeRenderLayers);
}

function applyActiveRenderLayers(layers, { userPicked = false } = {}) {
  ui.activeRenderLayers = new Set(normalizeRenderLayers(layers, []));
  syncDerivedRenderMode();
  if (userPicked) {
    ui.userPickedRenderer = true;
    ui.sessionRenderLayers = [...ui.activeRenderLayers];
  }
  engine.setActiveRenderLayers(ui.activeRenderLayers);
  syncRendererLayerUI();
  syncWorldDecor();
}

/** Keep sphereColors.global aligned with renderLayerStyles.spheres (global mode). */
function syncSphereColorsFromLayerStyles() {
  const s = ui.renderLayerStyles.spheres;
  setGlobalColor(ui.sphereColors, s.color, s.opacity);
}

function syncLayerStylesFromSphereColors() {
  patchRenderLayerStyle(ui.renderLayerStyles, "spheres", {
    color: ui.sphereColors.global.hex,
    opacity: ui.sphereColors.global.opacity,
  });
  ui.pathThickness = ui.renderLayerStyles.connections.thickness ?? 1;
}

function syncRenderLayerStyleUI() {
  const styles = ui.renderLayerStyles;
  for (const layerId of RENDER_LAYER_DRAW_ORDER) {
    const block = document.querySelector(`[data-style-for="${layerId}"]`);
    if (block) block.hidden = !ui.activeRenderLayers.has(layerId);
    const style = styles[layerId];
    if (!style) continue;
    const colorEl = document.getElementById(`layerColor-${layerId}`);
    if (colorEl) colorEl.value = style.color;
    const opacityEl = document.getElementById(`layerOpacity-${layerId}`);
    const opacityVal = document.getElementById(`layerOpacityValue-${layerId}`);
    if (opacityEl) opacityEl.value = String(opacityPercent(style.opacity));
    if (opacityVal) opacityVal.textContent = `${opacityPercent(style.opacity)}%`;
    if (style.thickness != null) {
      const th = document.getElementById(`layerThickness-${layerId}`);
      const thVal = document.getElementById(`layerThicknessValue-${layerId}`);
      if (th) th.value = String(style.thickness);
      if (thVal) thVal.textContent = Number(style.thickness).toFixed(2);
    }
    if (style.size != null) {
      const sz = document.getElementById(`layerSize-${layerId}`);
      const szVal = document.getElementById(`layerSizeValue-${layerId}`);
      if (sz) sz.value = String(style.size);
      if (szVal) szVal.textContent = Number(style.size).toFixed(2);
    }
  }
  const pathEl = document.getElementById("pathThickness");
  const pathVal = document.getElementById("pathThicknessValue");
  if (pathEl) pathEl.value = String(ui.renderLayerStyles.connections.thickness ?? 1);
  if (pathVal) {
    pathVal.textContent = Number(ui.renderLayerStyles.connections.thickness ?? 1).toFixed(2);
  }
}

function applyRenderLayerStylePatch(layerId, patch, { rebuild = false } = {}) {
  patchRenderLayerStyle(ui.renderLayerStyles, layerId, patch);
  if (layerId === "spheres") syncSphereColorsFromLayerStyles();
  if (layerId === "connections" && patch.thickness != null) {
    ui.pathThickness = ui.renderLayerStyles.connections.thickness;
  }
  syncRenderLayerStyleUI();
  if (layerId === "spheres") syncSphereColorUI();
  const needsRebuild = rebuild || patch.thickness != null || patch.size != null;
  if (needsRebuild) {
    applyAppearance();
  } else {
    engine.updateLayerStyles({
      renderLayerStyles: ui.renderLayerStyles,
      sphereColors: ui.sphereColors,
      pathThickness: ui.pathThickness,
    });
  }
}

function populateGeometrySelect() {
  const select = document.getElementById("geometry");
  select.innerHTML = "";
  listGeometryOptions().forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.label;
    if (g.id === ui.geometry) opt.selected = true;
    select.appendChild(opt);
  });
}

function isRendererPopoverOpen() {
  const pop = document.getElementById("rendererPopover");
  return Boolean(pop && !pop.hidden);
}

function positionRendererPopover() {
  const pop = document.getElementById("rendererPopover");
  const btn = document.getElementById("rendererSummary");
  const panel = document.getElementById("panel");
  if (!pop || !btn || !panel || pop.hidden) return;
  pop.classList.remove("renderer-popover--up");
  pop.style.maxHeight = "";
  const panelRect = panel.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const safeBottom = Math.min(window.innerHeight - 8, panelRect.bottom - 8);
  const safeTop = Math.max(8, panelRect.top + 8);
  const spaceBelow = Math.max(0, safeBottom - btnRect.bottom - 4);
  const spaceAbove = Math.max(0, btnRect.top - safeTop - 4);
  const preferUp = spaceBelow < 160 && spaceAbove > spaceBelow;
  if (preferUp) pop.classList.add("renderer-popover--up");
  const available = preferUp ? spaceAbove : spaceBelow;
  const maxH = Math.max(120, Math.min(360, available || 240));
  pop.style.maxHeight = `${maxH}px`;
}

function setRendererPopoverOpen(open) {
  const pop = document.getElementById("rendererPopover");
  const btn = document.getElementById("rendererSummary");
  const panel = document.getElementById("panel");
  if (!pop || !btn) return;
  pop.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    positionRendererPopover();
    requestAnimationFrame(positionRendererPopover);
  } else {
    pop.classList.remove("renderer-popover--up");
    pop.style.maxHeight = "";
  }
  if (panel) {
    if (open) {
      panel.addEventListener("scroll", positionRendererPopover, { passive: true });
    } else {
      panel.removeEventListener("scroll", positionRendererPopover);
    }
  }
}

function syncRendererLayerUI() {
  const layers = ui.activeRenderLayers;
  document.querySelectorAll("[data-render-layer]").forEach((el) => {
    const id = el.getAttribute("data-render-layer");
    el.checked = layers.has(id);
  });
  const all = document.getElementById("rendererSelectAll");
  if (all) {
    const n = RENDER_LAYER_DRAW_ORDER.filter((id) => layers.has(id)).length;
    all.checked = n === RENDER_LAYER_DRAW_ORDER.length;
    all.indeterminate = n > 0 && n < RENDER_LAYER_DRAW_ORDER.length;
  }
  const summary = document.getElementById("rendererSummary");
  if (summary) summary.textContent = summarizeRenderLayers(layers);
  syncRenderLayerStyleUI();
}

function syncRenderModeSelect() {
  syncRendererLayerUI();
}

function populateRenderModeSelect() {
  if (!ui.activeRenderLayers.size) {
    ui.activeRenderLayers = new Set(defaultRenderLayersFor(ui.geometry));
  }
  syncDerivedRenderMode();
  syncRendererLayerUI();
}

function resolveRenderLayersForGeometry(geometryId) {
  if (
    ui.userPickedRenderer &&
    ui.sessionRenderLayers &&
    isRendererCompatible(geometryId, ui.sessionRenderLayers)
  ) {
    return normalizeRenderLayers(ui.sessionRenderLayers, DEFAULT_ACTIVE_RENDER_LAYERS);
  }
  return defaultRenderLayersFor(geometryId);
}

function resolveRendererForGeometry(geometryId) {
  return legacyModeFromLayers(resolveRenderLayersForGeometry(geometryId));
}

function applySphereColorsToRenderer({ rebuild = false } = {}) {
  if (rebuild) {
    engine.setAppearance({
      transparency: ui.transparency,
      wireframe: ui.wireframe,
      material: ui.material,
      color: 0xffd84d,
      secondaryColor: 0xffd84d,
      palette: ui.palette,
      colorIntensity: ui.colorIntensity,
      blendStrength: ui.blendStrength,
      pathThickness: ui.pathThickness,
      sphereColors: ui.sphereColors,
      renderLayerStyles: ui.renderLayerStyles,
    });
    return;
  }
  engine.updateLayerStyles({
    sphereColors: ui.sphereColors,
    renderLayerStyles: ui.renderLayerStyles,
    pathThickness: ui.pathThickness,
  });
  engine.setSelectedSphereId(ui.sphereColors.selectedSphereId);
}

function syncSphereColorUI() {
  const mode = ui.sphereColors.mode;
  document.getElementById("sphereColorMode").value = mode;
  document.getElementById("globalColorControls").hidden = mode !== COLOR_MODE.GLOBAL;
  document.getElementById("individualColorControls").hidden = mode !== COLOR_MODE.INDIVIDUAL;
  focusSystem.setSelectOnly(mode === COLOR_MODE.INDIVIDUAL);

  const g = ui.sphereColors.global;
  document.getElementById("globalSphereColor").value = g.hex;
  document.getElementById("globalSphereOpacity").value = String(opacityPercent(g.opacity));
  document.getElementById("globalSphereOpacityNum").value = String(opacityPercent(g.opacity));
  document.getElementById("globalSphereOpacityValue").textContent = `${opacityPercent(g.opacity)}%`;

  const selId = ui.sphereColors.selectedSphereId;
  const label = document.getElementById("selectedSphereLabel");
  if (!selId) {
    label.textContent = "Tap a sphere to select it";
  } else {
    const data = engine.getVisibleData() ?? engine.getFullData();
    const pt = data?.points?.find((p) => p.id === selId);
    const spec = data?.sphereCenters?.find((s) => s.id === selId || s.pointId === selId);
    const name = pt?.label || spec?.id || selId;
    label.textContent = `Selected: ${name} (${selId})`;
  }

  if (selId) {
    const c = resolveSphereColor(ui.sphereColors, selId);
    document.getElementById("individualSphereColor").value = c.hex;
    document.getElementById("individualSphereOpacity").value = String(opacityPercent(c.opacity));
    document.getElementById("individualSphereOpacityNum").value = String(opacityPercent(c.opacity));
    document.getElementById("individualSphereOpacityValue").textContent = `${opacityPercent(c.opacity)}%`;
  }
}

function saveState() {
  try {
    const state = {
      geometry: ui.geometry,
      activeRenderLayers: [...ui.activeRenderLayers],
      renderMode: ui.renderMode,
      radius: ui.radius,
      pathThickness: ui.pathThickness,
      constructionStep: ui.constructionStep,
      constructionMode: ui.constructionMode,
      endlessRings: ui.endlessRings,
      endlessExpansionStep: ui.endlessExpansionStep,
      endlessAutoExpand: ui.endlessAutoExpand,
      autoRotate: ui.autoRotate,
      autoRotateSpeed: ui.autoRotateSpeed,
      renderingPreset: ui.renderingPreset,
      backgroundColor: ui.backgroundColor,
      transparentBackground: ui.transparentBackground,
      lightingIntensity: ui.lightingIntensity,
      environmentPreset: ui.environmentPreset,
      palette: ui.palette,
      colorIntensity: ui.colorIntensity,
      blendStrength: ui.blendStrength,
      material: ui.material,
      wireframe: ui.wireframe,
      animSpeed: ui.animSpeed,
      sphereColors: ui.sphereColors,
      renderLayerStyles: ui.renderLayerStyles,
      panelOpen: ui.panelOpen,
      treeViewMode: ui.treeViewMode,
      geometricFlags: ui.geometricFlags,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save state", e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    const state = JSON.parse(raw);

    if (state.activeRenderLayers) {
      state.activeRenderLayers = new Set(state.activeRenderLayers);
    }

    // Convert older saved sphere-color formats to the current format.
    const defaults = createSphereColorState();
    const savedColors = state.sphereColors;

    if (!savedColors || typeof savedColors !== "object") {
      state.sphereColors = defaults;
    } else {
      const oldIndividual =
        savedColors.bySphereId ??
        savedColors.individual ??
        {};

      const normalizedIndividual = {};

      Object.entries(oldIndividual).forEach(([id, value]) => {
        normalizedIndividual[id] = {
          hex:
            value?.hex ??
            value?.color ??
            DEFAULT_SPHERE_COLOR,
          opacity:
            typeof value?.opacity === "number"
              ? value.opacity
              : DEFAULT_SPHERE_OPACITY,
        };
      });

      state.sphereColors = {
        ...defaults,
        ...savedColors,

        mode:
          savedColors.mode === COLOR_MODE.INDIVIDUAL
            ? COLOR_MODE.INDIVIDUAL
            : COLOR_MODE.GLOBAL,

        global: {
          hex:
            savedColors.global?.hex ??
            savedColors.globalColor ??
            DEFAULT_SPHERE_COLOR,

          opacity:
            typeof savedColors.global?.opacity === "number"
              ? savedColors.global.opacity
              : typeof savedColors.globalOpacity === "number"
              ? savedColors.globalOpacity
              : DEFAULT_SPHERE_OPACITY,
        },

        bySphereId: normalizedIndividual,
      };
    }

    Object.assign(ui, state);
    return true;
  } catch (error) {
    console.warn("Failed to load state. Defaults will be used.", error);
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}
function applyRenderingPreset(presetName) {
  const preset = RENDERING_PRESETS[presetName];
  if (!preset) return;
  ui.renderingPreset = presetName;
  ui.material = preset.material;
  ui.wireframe = preset.wireframe;
  ui.palette = preset.palette;
  ui.blendStrength = preset.blendStrength;
  ui.colorIntensity = preset.colorIntensity;
  ui.sphereColors.globalOpacity = preset.globalOpacity / 100;
  syncLabels();
  syncSphereColorUI();
  syncRenderLayerStyleUI();
  rebuildFromGenerator();
}

function applyEnvironmentPreset(presetName) {
  const preset = ENVIRONMENT_PRESETS[presetName];
  if (!preset) return;
  ui.environmentPreset = presetName;
  if (ui.transparentBackground) {
    scene.background = null;
    scene.fog = null;
    webgl.setClearColor(0x000000, 0);
    return;
  }
  if (preset.background) {
    scene.background = new THREE.Color(preset.background);
    scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);
    webgl.setClearColor(preset.background, 1);
  } else {
    scene.background = null;
    scene.fog = null;
    webgl.setClearColor(0x000000, 0);
  }
  const mult = ui.lightingIntensity;
  ambientLight.intensity = BASE_LIGHT_INTENSITY.ambient * mult;
  keyLight.intensity = BASE_LIGHT_INTENSITY.key * mult;
  fillLight.intensity = BASE_LIGHT_INTENSITY.fill * mult;
}

function exportTransparentPng() {
  const prevBg = scene.background ? scene.background.clone() : null;
  const prevFog = scene.fog ? scene.fog.clone() : null;
  const prevClearAlpha = webgl.getClearAlpha();
  const prevClearColor = webgl.getClearColor(new THREE.Color()).clone();

  scene.background = null;
  scene.fog = null;
  webgl.setClearColor(0x000000, 0);

  const cam = cameraController.getActiveCamera();
  webgl.render(scene, cam);
  displayOverlays.render(cam);

  const dataURL = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = `geometry-explor-transparent-${Date.now()}.png`;
  a.click();

  if (prevBg) scene.background = prevBg;
  if (prevFog) scene.fog = prevFog;
  webgl.setClearColor(prevClearColor, prevClearAlpha);
  webgl.render(scene, cam);
  displayOverlays.render(cam);
}

function updateSphereInfo() {
  const info = document.getElementById("sphereInfoPanel");
  if (!info) return;
  const sel = focusSystem.getSelected();
  if (!sel || !sel.id) {
    info.hidden = true;
    return;
  }
  info.hidden = false;
  const data = engine.getVisibleData() ?? engine.getFullData();
  const centers = data?.sphereCenters || [];
  const idx = centers.findIndex((c) => c.id === sel.id || c.pointId === sel.id);
  const center = centers[idx];
  const pt = center ? data?.points?.find((p) => p.id === center.pointId) : null;
  const dist = pt ? Math.hypot(pt.x, pt.y, pt.z) : 0;
  const ring = dist === 0 ? "Center" : `Ring ${Math.round(dist / ui.radius)}`;
  const color = ui.sphereColors.mode === "individual"
    ? (ui.sphereColors.individual[sel.id]?.color || ui.sphereColors.globalColor)
    : ui.sphereColors.globalColor;

  info.innerHTML = `
    <div class="insp-block">
      <p class="insp-title">Selected Sphere</p>
      <div class="insp-grid">
        <span>Index</span><strong>${idx >= 0 ? idx : "—"}</strong>
        <span>ID</span><strong class="meas-mono">${sel.id}</strong>
        <span>Coordinates</span><strong class="meas-mono">${pt ? `(${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}, ${pt.z.toFixed(2)})` : "—"}</strong>
        <span>Ring</span><strong>${ring}</strong>
        <span>Color</span><strong class="meas-mono">${color}</strong>
      </div>
    </div>
  `;
}

function applyColorPattern(pattern) {
  const data = engine.getVisibleData() ?? engine.getFullData();
  const centers = data?.sphereCenters || [];
  if (!centers.length) return;

  switch (pattern) {
    case "rainbow": {
      resetAllIndividualColors(ui.sphereColors);
      ui.sphereColors.mode = "individual";
      centers.forEach((spec, i) => {
        const hue = (i / Math.max(1, centers.length - 1)) * 360;
        const hex = hslToHex(hue, 80, 60);
        setIndividualColor(ui.sphereColors, spec.id, hex, 0.45);
      });
      break;
    }
    case "alternating": {
      resetAllIndividualColors(ui.sphereColors);
      ui.sphereColors.mode = "individual";
      centers.forEach((spec, i) => {
        const hex = i % 2 === 0 ? "#FF6B6B" : "#4ECDC4";
        setIndividualColor(ui.sphereColors, spec.id, hex, 0.45);
      });
      break;
    }
    case "random": {
      resetAllIndividualColors(ui.sphereColors);
      ui.sphereColors.mode = "individual";
      centers.forEach((spec) => {
        const hex = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`;
        setIndividualColor(ui.sphereColors, spec.id, hex, 0.45);
      });
      break;
    }
    case "ring": {
      resetAllIndividualColors(ui.sphereColors);
      ui.sphereColors.mode = "individual";
      const rings = new Map();
      const pts = data.points || [];
      centers.forEach((spec) => {
        const p = pts.find((pt) => pt.id === spec.pointId);
        if (!p) return;
        const dist = Math.round(Math.hypot(p.x, p.y, p.z) / ui.radius);
        if (!rings.has(dist)) rings.set(dist, []);
        rings.get(dist).push(spec.id);
      });
      const ringColors = ["#FF6B6B", "#4ECDC4", "#FFE66D", "#1A535C", "#FF9F1C", "#9B5DE5", "#00BBF9", "#00F5D4"];
      [...rings.keys()].sort((a, b) => a - b).forEach((ringKey, i) => {
        const color = ringColors[i % ringColors.length];
        rings.get(ringKey).forEach((id) => setIndividualColor(ui.sphereColors, id, color, 0.45));
      });
      break;
    }
  }
  syncSphereColorUI();
  syncRenderLayerStyleUI();
  applySphereColorsToRenderer();
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function resetControlsToDefaults() {
  ui.animSpeed = 0;
  ui.userPickedRenderer = false;
  ui.sessionRenderLayers = null;
  ui.renderModeBeforeConstruction = null;
  ui.geometry = DEFAULT_UI_GEOMETRY_ID;
  ui.activeRenderLayers = new Set(DEFAULT_ACTIVE_RENDER_LAYERS);
  syncDerivedRenderMode();
  ui.transparency = 0;
  ui.wireframe = false;
  ui.material = "standard";
  ui.palette = "ocean";
  ui.colorIntensity = 1;
  ui.blendStrength = 1;
  resetSphereColorState(ui.sphereColors);
  resetRenderLayerStyles(ui.renderLayerStyles);
  syncSphereColorsFromLayerStyles();
  ui.pathThickness = ui.renderLayerStyles.connections.thickness ?? 1;
  stopEndlessAutoExpand();
  ui.endlessRings = ENDLESS_DEFAULT_RINGS;
  ui.endlessExpansionStep = ENDLESS_DEFAULT_RINGS;

  document.getElementById("geometry").value = ui.geometry;
  syncRendererLayerUI();
  syncRenderLayerStyleUI();
  syncEndlessUI();
  document.getElementById("animSpeed").value = "0";
  document.getElementById("wireframe").checked = false;
  document.getElementById("material").value = "standard";
  const paletteEl = document.getElementById("palette");
  if (paletteEl) paletteEl.value = "ocean";
  document.getElementById("colorIntensity").value = "1";
  document.getElementById("blendStrength").value = "1";

  measurementMode.setEnabled(false);
  discoveryEngine.setInspectMode(false);
  discoveryEngine.setShowGraph(false);
  cameraController.setProjection("perspective", { animate: false });

  syncSphereColorUI();
  syncLabels();
  player.setAnimSpeed(ui.animSpeed);
  rebuildFromGenerator();
}
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0e1a24, 0.035);
scene.background = new THREE.Color(0x0e1a24);

const webgl = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
  alpha: false,
  premultipliedAlpha: true,
  powerPreference: "high-performance",
});
webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
webgl.setSize(window.innerWidth, window.innerHeight);
webgl.outputColorSpace = THREE.SRGBColorSpace;
webgl.toneMapping = THREE.ACESFilmicToneMapping;
webgl.toneMappingExposure = 1.15;

const cameraController = new CameraController({
  scene,
  domElement: webgl.domElement,
  aspect: window.innerWidth / window.innerHeight,
});

const BASE_LIGHT_INTENSITY = { ambient: 1.1, key: 1.35, fill: 0.45 };
const ambientLight = new THREE.HemisphereLight(0xb8e4ff, 0x1a2030, BASE_LIGHT_INTENSITY.ambient);
scene.add(ambientLight);
const keyLight = new THREE.DirectionalLight(0xffffff, BASE_LIGHT_INTENSITY.key);
keyLight.position.set(5, 8, 4);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x88aaff, BASE_LIGHT_INTENSITY.fill);
fillLight.position.set(-4, -2, -5);
scene.add(fillLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(8, 64),
  new THREE.MeshStandardMaterial({
    color: 0x15202a,
    metalness: 0.2,
    roughness: 0.85,
    transparent: true,
    opacity: 0.55,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.5;
scene.add(floor);

const worldGrid = new THREE.GridHelper(12, 24, 0x3ecfbf, 0x243442);
worldGrid.position.y = -3.49;
worldGrid.material.transparent = true;
worldGrid.material.opacity = 0.35;
scene.add(worldGrid);

const designGroup = new THREE.Group();
scene.add(designGroup);

/** Exploration overlays stay outside designGroup so exports remain geometry-only. */
const explorationRoot = new THREE.Group();
explorationRoot.name = "explorationRoot";
scene.add(explorationRoot);

const engine = new ConstructionEngine(designGroup);
const player = engine.player;

const evolution = new EvolutionController({
  engine,
  onChange: () => {
    syncEvolutionUI();
    applyAppearance();
    const state = evolution.getState();
    if (state.renderMode) {
      const layers = layersFromLegacyMode(
        isUiRenderMode(state.renderMode)
          ? state.renderMode
          : coerceToUiRenderMode(state.renderMode, "mixed")
      );
      if (!layersEqual(ui.activeRenderLayers, layers)) {
        ui.activeRenderLayers = new Set(layers);
        syncDerivedRenderMode();
        syncRendererLayerUI();
        engine.setActiveRenderLayers(ui.activeRenderLayers);
      }
    }
    syncWorldDecor();
    syncDisplayOverlays();
    frameActiveConstruction({ duration: 0.55, expandOnly: true });
  },
});

const displayOverlays = new DisplayOverlays({
  scene,
  container: appRoot,
  parentGroup: explorationRoot,
});

const focusSystem = new FocusSystem({
  scene,
  cameraController,
  designGroup,
  parentGroup: explorationRoot,
  domElement: webgl.domElement,
  hudElement: document.getElementById("focusHud"),
});

const measurementMode = new MeasurementMode({
  scene,
  focusSystem,
  cameraController,
  designGroup,
  parentGroup: explorationRoot,
  domElement: webgl.domElement,
  hudElement: document.getElementById("measurementHud"),
});

const discoveryEngine = new DiscoveryEngine({
  scene,
  parentGroup: explorationRoot,
  designGroup,
  cameraController,
  focusSystem,
  domElement: webgl.domElement,
  discoveriesEl: document.getElementById("discoveriesPanel"),
  mathematicsEl: document.getElementById("mathematicsPanel"),
  inspectorEl: document.getElementById("inspectorPanel"),
  inspectorHud: document.getElementById("inspectorHud"),
});

const link = document.createElement("a");
link.style.display = "none";
document.body.appendChild(link);

function downloadBlob(blob, filename) {
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

function downloadString(text, filename) {
  downloadBlob(new Blob([text], { type: "text/plain" }), filename);
}

function syncWorldDecor() {
  const hideWorld =
    ui.renderMode === "constructionPlane" || ui.constructionMode || ui.evolutionMode;
  floor.visible = !hideWorld;
  worldGrid.visible = !hideWorld;
}

function syncEvolutionUI() {
  const playback = document.getElementById("evolutionPlayback");
  const state = evolution.getState();
  if (playback) playback.hidden = !ui.evolutionMode;
  if (!ui.evolutionMode) return;
  document.getElementById("evoStepCurrent").textContent = String(state.stepIndex);
  document.getElementById("evoStepTotal").textContent = String(Math.max(0, state.totalSteps - 1));
  document.getElementById("evoTitle").textContent = state.title;
  document.getElementById("evoDescription").textContent = state.description;
  const slider = document.getElementById("evoSlider");
  slider.max = String(state.totalSteps - 1);
  slider.value = String(state.stepIndex);
}

function computeDesignBox() {
  const data = engine.getVisibleData();
  const r = ui.radius;
  const extent = data ? Math.max(r * 2.4, r) : r * 2.4;
  const box = new THREE.Box3(
    new THREE.Vector3(-extent, -extent, -extent * 0.35),
    new THREE.Vector3(extent, extent, extent * 0.35)
  );

  if (designGroup.children.length) {
    const measured = new THREE.Box3().setFromObject(designGroup);
    if (!measured.isEmpty()) box.copy(measured);
  }
  return box;
}

function syncViewLayout() {
  const fullWidth = window.innerWidth;
  const fullHeight = window.innerHeight;
  const panelEl = document.getElementById("panel");
  const tutorialCard = document.getElementById("tutorialCard");
  const panelOpen = isMobileSheetLayout() ? true : ui.panelOpen;
  const rect = computeAvailableViewRect({
    fullWidth,
    fullHeight,
    panelEl,
    panelOpen,
    topOccluderEl:
      tutorialCard && !tutorialCard.hidden && document.body.classList.contains("mobile-tutorial")
        ? tutorialCard
        : null,
  });
  cameraController.setAvailableViewRect(rect);
  return rect;
}

function frameActiveConstruction({
  animate = true,
  duration = 0.75,
  expandOnly = false,
  direction = null,
  margin = null,
} = {}) {
  if (guidedTutorial?.shouldPreserveCamera?.() && expandOnly) {
    syncViewLayout();
    publishFramingDebug();
    return;
  }

  syncViewLayout();
  const box = computeDesignBox();
  focusSystem.clear({ restoreCamera: false });

  const phoneTutorial =
    document.body.classList.contains("mobile-tutorial") && isMobileTutorialLayout();
  const fitMargin =
    margin ?? (phoneTutorial ? MOBILE_TUTORIAL_FIT_MARGIN : DEFAULT_FIT_MARGIN);
  const fitDirection =
    direction ??
    (phoneTutorial
      ? new THREE.Vector3(
          FRONT_FRAME_DIRECTION.x,
          FRONT_FRAME_DIRECTION.y,
          FRONT_FRAME_DIRECTION.z
        )
      : null);

  cameraController.frameBox(box, {
    margin: fitMargin,
    duration,
    animate,
    expandOnly,
    direction: fitDirection,
    minDistance: phoneTutorial ? MOBILE_TUTORIAL_MIN_DISTANCE : undefined,
    fitAvailableHeight: phoneTutorial,
  });
  publishFramingDebug();
}

function frameTutorialGeometry({ animate = true, duration = 0.55 } = {}) {
  frameActiveConstruction({
    animate,
    duration,
    expandOnly: false,
    direction: new THREE.Vector3(
      FRONT_FRAME_DIRECTION.x,
      FRONT_FRAME_DIRECTION.y,
      FRONT_FRAME_DIRECTION.z
    ),
    margin: isMobileTutorialLayout() ? MOBILE_TUTORIAL_FIT_MARGIN : DEFAULT_FIT_MARGIN,
  });
}

function publishFramingDebug() {
  const dist = cameraController.getOrbitDistance();
  const t = cameraController.getOrbitTarget();
  canvas.dataset.cameraDistance = String(dist);
  canvas.dataset.orbitTarget = `${t.x},${t.y},${t.z}`;
  const measure = measureSphereScreenSpace();
  if (measure) {
    canvas.dataset.sphereHeightFraction = String(measure.heightFraction);
    canvas.dataset.usableHeight = String(measure.usableHeight);
    canvas.dataset.sphereScreenHeight = String(measure.sphereHeight);
  }
}

function measureSphereScreenSpace() {
  const rect = syncViewLayout();
  const cam = cameraController.getActiveCamera();
  cam.updateMatrixWorld(true);
  const fullW = window.innerWidth;
  const fullH = window.innerHeight;
  const center = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const viewDir = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  cam.getWorldPosition(camPos);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  designGroup.traverse((obj) => {
    if (!obj.isMesh || !obj.visible || !obj.geometry) return;
    if (obj.userData?.kind !== "sphere") return;

    obj.geometry.computeBoundingSphere();
    const bs = obj.geometry.boundingSphere;
    if (!bs) return;
    center.copy(bs.center).applyMatrix4(obj.matrixWorld);
    const scale = obj.getWorldScale(new THREE.Vector3());
    const radius = bs.radius * Math.max(scale.x, scale.y, scale.z);

    viewDir.copy(center).sub(camPos);
    if (viewDir.lengthSq() < 1e-10) return;
    viewDir.normalize();
    perp.set(0, 1, 0).cross(viewDir);
    if (perp.lengthSq() < 1e-8) perp.set(1, 0, 0).cross(viewDir);
    perp.normalize();

    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).normalize();
    const upOnPlane = camUp.clone().addScaledVector(viewDir, -camUp.dot(viewDir));
    if (upOnPlane.lengthSq() < 1e-8) upOnPlane.copy(perp);
    else upOnPlane.normalize();

    edge.copy(center).addScaledVector(upOnPlane, radius);
    const cNdc = center.clone().project(cam);
    const eNdc = edge.clone().project(cam);
    const cx = (cNdc.x * 0.5 + 0.5) * fullW;
    const cy = (-cNdc.y * 0.5 + 0.5) * fullH;
    const ex = (eNdc.x * 0.5 + 0.5) * fullW;
    const ey = (-eNdc.y * 0.5 + 0.5) * fullH;
    const screenR = Math.hypot(ex - cx, ey - cy);

    minX = Math.min(minX, cx - screenR);
    maxX = Math.max(maxX, cx + screenR);
    minY = Math.min(minY, cy - screenR);
    maxY = Math.max(maxY, cy + screenR);
    found = true;
  });

  if (!found) return null;
  const sphereHeight = Math.max(0, maxY - minY);
  const sphereWidth = Math.max(0, maxX - minX);
  const usableHeight = rect.height;
  const usableWidth = rect.width;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const availCx = rect.x + rect.width / 2;
  const availCy = rect.y + rect.height / 2;
  return {
    minX,
    minY,
    maxX,
    maxY,
    sphereHeight,
    sphereWidth,
    usableHeight,
    usableWidth,
    heightFraction: usableHeight > 0 ? sphereHeight / usableHeight : 0,
    centerOffsetX: cx - availCx,
    centerOffsetY: cy - availCy,
    overlapsPanel: ui.panelOpen && maxX > rect.x + rect.width + 1,
    fullyVisible:
      minX >= -1 &&
      minY >= -1 &&
      maxX <= fullW + 1 &&
      maxY <= fullH + 1,
  };
}

function setIntroOpen(open) {
  const overlay = document.getElementById("introOverlay");
  if (!overlay) return;
  overlay.hidden = !open;
  if (open) {
    syncIntroCheckboxes(getShowIntroOnOpen());
    document.getElementById("introDone")?.focus?.();
  }
}

function setPanelOpen(open, { reframe = true, animateFrame = true } = {}) {
  ui.panelOpen = Boolean(open);
  const app = document.getElementById("app");
  const panel = document.getElementById("panel");

  if (isMobileSheetLayout()) {
    if (open) {
      const next =
        guidedTutorial?.isActive?.() && isMobileTutorialLayout()
          ? SHEET_STATE.HALF
          : getSheetState() === SHEET_STATE.COLLAPSED
          ? SHEET_STATE.HALF
          : getSheetState();
      setSheetState(next === SHEET_STATE.COLLAPSED ? SHEET_STATE.HALF : next);
      app?.classList.remove("panel-collapsed");
      ui.panelOpen = true;
    } else {
      setSheetState(SHEET_STATE.COLLAPSED);
      app?.classList.remove("panel-collapsed");
      ui.panelOpen = false;
    }
  } else {
    app?.classList.toggle("panel-collapsed", !ui.panelOpen);
    const toggle = document.getElementById("menuToggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", ui.panelOpen ? "true" : "false");
      toggle.setAttribute("aria-label", ui.panelOpen ? "Hide controls" : "Show controls");
      toggle.title = ui.panelOpen ? "Hide controls" : "Show controls";
    }
  }

  if (!reframe) {
    guidedTutorial?.reposition?.();
    return;
  }

  const runFrame = () => {
    if (guidedTutorial?.isActive?.() && isMobileTutorialLayout()) {
      frameTutorialGeometry({ animate: animateFrame, duration: 0.55 });
    } else {
      frameActiveConstruction({ animate: animateFrame, duration: 0.55 });
    }
    guidedTutorial?.reposition?.();
  };
  requestAnimationFrame(runFrame);
  if (panel) {
    const onEnd = (e) => {
      if (e.target !== panel) return;
      panel.removeEventListener("transitionend", onEnd);
      runFrame();
    };
    panel.addEventListener("transitionend", onEnd);
  }
}

function syncDisplayOverlays() {
  const data = engine.getVisibleData() ?? engine.getFullData();
  if (data) displayOverlays.setData(data);
  syncDiscovery();
}

function syncDiscovery() {
  const data = engine.getVisibleData() ?? engine.getFullData();
  let step = ui.constructionStep;
  let maxStep = engine.getMaxStep();
  if (ui.evolutionMode) {
    const st = evolution.getState();
    step = st.stepIndex;
    maxStep = Math.max(0, st.totalSteps - 1);
  } else if (ui.constructionMode) {
    step = player.getState().displayStep || player.getState().step || 1;
  }
  discoveryEngine.setContext({ step, maxStep });
  discoveryEngine.setData(data);
}

function syncLabels() {
  document.getElementById("radiusValue").textContent = ui.radius.toFixed(2);
  document.getElementById("pathThicknessValue").textContent = ui.pathThickness.toFixed(2);
  document.getElementById("layersValue").textContent = String(ui.constructionStep);
  document.getElementById("animSpeedValue").textContent = ui.animSpeed.toFixed(2);
  document.getElementById("colorIntensityValue").textContent = ui.colorIntensity.toFixed(2);
  document.getElementById("blendStrengthValue").textContent = ui.blendStrength.toFixed(2);
  // New controls
  const autoRotateEl = document.getElementById("autoRotate");
  if (autoRotateEl) autoRotateEl.checked = ui.autoRotate;
  const autoRotateSpeedEl = document.getElementById("autoRotateSpeed");
  if (autoRotateSpeedEl) {
    autoRotateSpeedEl.value = ui.autoRotateSpeed;
    const val = document.getElementById("autoRotateSpeedValue");
    if (val) val.textContent = ui.autoRotateSpeed.toFixed(2);
  }
  const renderingPresetEl = document.getElementById("renderingPreset");
  if (renderingPresetEl) renderingPresetEl.value = ui.renderingPreset;
  const bgColorEl = document.getElementById("backgroundColor");
  if (bgColorEl) bgColorEl.value = ui.backgroundColor;
  const transparentBgEl = document.getElementById("transparentBackground");
  if (transparentBgEl) transparentBgEl.checked = ui.transparentBackground;
  const lightingEl = document.getElementById("lightingIntensity");
  if (lightingEl) {
    lightingEl.value = ui.lightingIntensity;
    const val = document.getElementById("lightingIntensityValue");
    if (val) val.textContent = ui.lightingIntensity.toFixed(2);
  }
  const envPresetEl = document.getElementById("environmentPreset");
  if (envPresetEl) envPresetEl.value = ui.environmentPreset;
}

function syncStepDisplay() {
  const state = player.getState();
  const total = state.totalSteps || engine.getMaxStep();
  const current = ui.constructionMode
    ? Math.max(1, state.displayStep || state.step || 1)
    : ui.constructionStep;
  document.getElementById("stepCurrent").textContent = String(current);
  document.getElementById("stepTotal").textContent = String(total);

  const slider = document.getElementById("layers");
  slider.max = String(total);
  if (!ui.constructionMode) {
    document.getElementById("layersValue").textContent = String(ui.constructionStep);
  }

  const constructionSlider = document.getElementById("constructionStepSlider");
  const constructionSliderValue = document.getElementById("constructionStepSliderValue");
  if (constructionSlider) {
    constructionSlider.max = String(Math.max(1, total));
    if (ui.constructionMode) {
      constructionSlider.value = String(current);
      if (constructionSliderValue) constructionSliderValue.textContent = String(current);
    }
  }
}

function syncConstructionUI() {
  const playback = document.getElementById("constructionPlayback");
  const legacy = document.getElementById("legacyStepGroup");
  if (playback) playback.hidden = !ui.constructionMode || ui.evolutionMode;
  if (legacy) legacy.hidden = ui.constructionMode || ui.evolutionMode;
  syncStepDisplay();
}

function applyAppearance() {
  applySphereColorsToRenderer({ rebuild: true });
}

function showStaticStep(step, { reframe = true } = {}) {
  player.pause();
  engine.setConstructionMode(false);
  engine.setStep(step);
  applyAppearance();
  const visible = engine.getVisibleData();
  engine.clearDrawProgress();
  visible?.sphereCenters.forEach((s) => engine.setDrawProgress(s.id, 1));
  visible?.circleCenters.forEach((c) => engine.setDrawProgress(c.id, 1));
  visible?.points.forEach((p) => engine.setDrawProgress(p.id, 1));
  engine.setActiveId(null);
  engine.redraw();
  syncDisplayOverlays();
  if (reframe) frameActiveConstruction({ expandOnly: true });
}

function enterConstructionMode() {
  engine.setConstructionMode(true);
  applyAppearance();
  syncWorldDecor();
  player.setAnimSpeed(ui.animSpeed);
  player.setAutoPlay(ui.autoPlay);
  player.restart({ autoStart: ui.autoPlay });
  syncConstructionUI();
  syncDisplayOverlays();
}

function exitConstructionMode() {
  player.pause();
  player.setAutoPlay(false);
  document.getElementById("autoPlay").checked = false;
  ui.autoPlay = false;
  engine.setConstructionMode(false);
  ui.constructionStep = Number.MAX_SAFE_INTEGER;
  showStaticStep(ui.constructionStep, { reframe: false });
  syncConstructionUI();
  syncWorldDecor();
  syncLabels();
}

function syncTreeViewUI() {
  const group = document.getElementById("treeViewModeGroup");
  const select = document.getElementById("treeViewMode");
  const hint = document.getElementById("treeViewHint");
  const isTree = ui.geometry === "treeOfLife";
  if (group) group.hidden = !isTree;
  if (select) select.value = ui.treeViewMode;
  if (hint) hint.textContent = TREE_VIEW_HINTS[ui.treeViewMode] || TREE_VIEW_HINTS.traditional;
  const flagsGroup = document.getElementById("geometricFlagsGroup");
  if (flagsGroup) flagsGroup.hidden = true;
}

function endlessGeometryOpts() {
  return {
    rings: clampEndlessRings(ui.endlessRings),
    expansionStep: clampEndlessExpansionStep(ui.endlessExpansionStep, ui.endlessRings),
  };
}

let endlessAutoTimer = null;

function stopEndlessAutoExpand({ updateToggle = true } = {}) {
  if (endlessAutoTimer != null) {
    clearInterval(endlessAutoTimer);
    endlessAutoTimer = null;
  }
  ui.endlessAutoExpand = false;
  if (updateToggle) {
    const tog = document.getElementById("endlessAutoExpand");
    if (tog) tog.checked = false;
  }
}

function startEndlessAutoExpand() {
  stopEndlessAutoExpand({ updateToggle: false });
  ui.endlessAutoExpand = true;
  const tog = document.getElementById("endlessAutoExpand");
  if (tog) tog.checked = true;
  endlessAutoTimer = setInterval(() => {
    if (ui.geometry !== "endless") {
      stopEndlessAutoExpand();
      return;
    }
    const maxR = clampEndlessRings(ui.endlessRings);
    let next = clampEndlessExpansionStep(ui.endlessExpansionStep, maxR) + 1;
    if (next > maxR) next = 1;
    ui.endlessExpansionStep = next;
    syncEndlessUI();
    rebuildFromGenerator();
  }, 900);
}

function resetEndlessExpansion() {
  stopEndlessAutoExpand();
  ui.endlessRings = ENDLESS_DEFAULT_RINGS;
  ui.endlessExpansionStep = ENDLESS_DEFAULT_RINGS;
  syncEndlessUI();
  if (ui.geometry === "endless") rebuildFromGenerator();
}

function syncEndlessUI() {
  const group = document.getElementById("endlessControls");
  const isEndless = ui.geometry === "endless";
  if (group) group.hidden = !isEndless;

  ui.endlessRings = clampEndlessRings(ui.endlessRings);
  ui.endlessExpansionStep = clampEndlessExpansionStep(
    ui.endlessExpansionStep,
    ui.endlessRings
  );

  const ringsEl = document.getElementById("endlessRings");
  const ringsVal = document.getElementById("endlessRingsValue");
  const stepEl = document.getElementById("endlessExpansionStep");
  const stepVal = document.getElementById("endlessExpansionStepValue");
  const autoEl = document.getElementById("endlessAutoExpand");
  const hint = document.getElementById("endlessHint");

  if (ringsEl) {
    ringsEl.min = String(ENDLESS_MIN_RINGS);
    ringsEl.max = String(ENDLESS_MAX_RINGS);
    ringsEl.value = String(ui.endlessRings);
  }
  if (ringsVal) ringsVal.textContent = String(ui.endlessRings);
  if (stepEl) {
    stepEl.min = "1";
    stepEl.max = String(ui.endlessRings);
    stepEl.value = String(ui.endlessExpansionStep);
  }
  if (stepVal) stepVal.textContent = String(ui.endlessExpansionStep);
  if (autoEl) autoEl.checked = ui.endlessAutoExpand;
  if (hint) {
    const n = hexLatticeCenterCount(ui.endlessExpansionStep);
    const nMax = hexLatticeCenterCount(ui.endlessRings);
    hint.textContent =
      `Continues the Flower of Life lattice outward (equal radius). ` +
      `Showing ring depth ${ui.endlessExpansionStep}/${ui.endlessRings} ` +
      `(${n} centers; up to ${nMax} at max depth).`;
  }
}

function preferredRenderLayersForTree(_viewMode) {
  return [
    RENDER_LAYERS.spheres,
    RENDER_LAYERS.circles,
    RENDER_LAYERS.points,
    RENDER_LAYERS.connections,
  ];
}

function preferredRenderModeForTree(_viewMode) {
  return "mixed";
}

function exportUnsupportedLayers(_format) {
  return [];
}

function treeGeometryOpts() {
  return {
    viewMode: ui.treeViewMode,
    geometricFlags: { ...ui.geometricFlags },
  };
}
function rebuildFromGenerator() {
  engine.geometryId = ui.geometry;
  engine.radius = ui.radius;
  if (ui.geometry === "treeOfLife") {
    engine.geometryOpts = treeGeometryOpts();
  } else if (ui.geometry === "endless") {
    engine.geometryOpts = endlessGeometryOpts();
  } else {
    engine.geometryOpts = {};
  }

  if (ui.evolutionMode) {
    evolution.setRadius(ui.radius);
    applyAppearance();
    engine.setActiveRenderLayers(ui.activeRenderLayers);
    syncWorldDecor();
    syncTreeViewUI();
    syncEndlessUI();
    syncEvolutionUI();
    syncConstructionUI();
    syncLabels();
    syncDisplayOverlays();
    frameActiveConstruction();
    return;
  }

  engine.regenerate();
  player.setAnimSpeed(ui.animSpeed);
  applyAppearance();
  engine.setActiveRenderLayers(ui.activeRenderLayers);
  syncWorldDecor();
  syncTreeViewUI();
  syncEndlessUI();

  const max = engine.getMaxStep();
  document.getElementById("layers").max = String(max);
  if (ui.geometry === "endless") {
    ui.constructionStep = max;
  } else if (ui.constructionStep > max) {
    ui.constructionStep = max;
  }
  document.getElementById("layers").value = String(ui.constructionStep);

  if (ui.constructionMode) {
    engine.setConstructionMode(true);
    player.setAutoPlay(ui.autoPlay);
    player.restart({ autoStart: ui.autoPlay });
  } else {
    engine.setConstructionMode(false);
    showStaticStep(ui.constructionStep);
  }
  syncConstructionUI();
  syncLabels();
  syncDisplayOverlays();
  frameActiveConstruction();
}

function enterEvolutionMode() {
  if (ui.constructionMode) {
    ui.constructionMode = false;
    document.getElementById("constructionMode").checked = false;
    exitConstructionMode();
  }
  ui.evolutionMode = true;
  evolution.setRadius(ui.radius);
  evolution.setEnabled(true);
  syncEvolutionUI();
  syncConstructionUI();
  syncWorldDecor();
}

function exitEvolutionMode() {
  ui.evolutionMode = false;
  evolution.setEnabled(false);
  syncEvolutionUI();
  rebuildFromGenerator();
}

guidedTutorial = new GuidedTutorial({
  setIntroOpen,
  setPanelOpen,
  frameActiveConstruction,
  frameTutorialGeometry,
  getPlayerState: () => player.getState(),
  restartConstruction: () => {
    player.restart({ autoStart: false });
    syncDisplayOverlays();
    syncStepDisplay();
    if (isMobileTutorialLayout() && guidedTutorial?.isActive?.()) {
      frameTutorialGeometry({ duration: 0.7 });
    } else {
      frameActiveConstruction({ duration: 0.7 });
    }
  },
  isMobileLayout: () =>
    Boolean(window.matchMedia && window.matchMedia("(max-width: 720px)").matches),
  isMobileTutorialLayout,
  setSheetState: (state) => {
    setSheetState(state);
    ui.panelOpen = state !== SHEET_STATE.COLLAPSED;
    document.getElementById("app")?.classList.remove("panel-collapsed");
  },
  getSheetState,
});

player.onChange = () => {
  syncStepDisplay();
  syncDisplayOverlays();
  const state = player.getState();
  if (state.phase === "idle" && state.step > 0) {
    if (!guidedTutorial?.shouldPreserveCamera?.()) {
      frameActiveConstruction({ duration: 0.65, expandOnly: true });
    } else {
      syncViewLayout();
      publishFramingDebug();
    }
  }
  guidedTutorial?.onConstructionPlayerChange(state);
};

function bindControls() {
  document.getElementById("geometry").addEventListener("change", (e) => {
    ui.geometry = e.target.value;
    ui.constructionStep = 1;
    document.getElementById("layers").value = "1";
    if (ui.geometry !== "endless") stopEndlessAutoExpand();
    if (ui.geometry === "endless") {
      ui.endlessExpansionStep = clampEndlessExpansionStep(
        ui.endlessExpansionStep,
        ui.endlessRings
      );
    }
    if (ui.geometry === "treeOfLife") {
      ui.treeViewMode = "traditional";
      document.getElementById("treeViewMode").value = ui.treeViewMode;
      if (!ui.userPickedRenderer) {
        ui.activeRenderLayers = new Set(preferredRenderLayersForTree(ui.treeViewMode));
      } else {
        ui.activeRenderLayers = new Set(resolveRenderLayersForGeometry(ui.geometry));
      }
    } else {
      ui.activeRenderLayers = new Set(resolveRenderLayersForGeometry(ui.geometry));
    }
    syncDerivedRenderMode();
    syncRendererLayerUI();
    syncEndlessUI();
    rebuildFromGenerator();
    guidedTutorial.onGeometryChanged(ui.geometry);
    saveState();
  });

  document.getElementById("endlessRings")?.addEventListener("input", (e) => {
    ui.endlessRings = clampEndlessRings(Number(e.target.value));
    ui.endlessExpansionStep = clampEndlessExpansionStep(
      ui.endlessExpansionStep,
      ui.endlessRings
    );
    syncEndlessUI();
    if (ui.geometry === "endless") rebuildFromGenerator();
    saveState();
  });

  document.getElementById("endlessExpansionStep")?.addEventListener("input", (e) => {
    ui.endlessExpansionStep = clampEndlessExpansionStep(
      Number(e.target.value),
      ui.endlessRings
    );
    syncEndlessUI();
    if (ui.geometry === "endless") rebuildFromGenerator();
    saveState();
  });

  document.getElementById("endlessAutoExpand")?.addEventListener("change", (e) => {
    if (e.target.checked) startEndlessAutoExpand();
    else stopEndlessAutoExpand();
    saveState();
  });

  document.getElementById("endlessReset")?.addEventListener("click", () => {
    resetEndlessExpansion();
    saveState();
  });

  document.getElementById("treeViewMode").addEventListener("change", (e) => {
    ui.treeViewMode = e.target.value;
    if (!ui.userPickedRenderer) {
      ui.activeRenderLayers = new Set(preferredRenderLayersForTree(ui.treeViewMode));
      syncDerivedRenderMode();
      syncRendererLayerUI();
    }
    if (ui.treeViewMode === "traditional") ui.pathThickness = 0.75;
    else if (ui.treeViewMode === "spatial") ui.pathThickness = 1.4;
    else ui.pathThickness = 1.1;
    patchRenderLayerStyle(ui.renderLayerStyles, "connections", {
      thickness: ui.pathThickness,
    });
    document.getElementById("pathThickness").value = String(ui.pathThickness);
    syncRenderLayerStyleUI();
    rebuildFromGenerator();
    saveState();
  });

  const bindGeoFlag = (id, key) => {
    document.getElementById(id)?.addEventListener("change", (e) => {
      ui.geometricFlags[key] = e.target.checked;
      if (ui.geometry === "treeOfLife" && ui.treeViewMode === "geometric") {
        rebuildFromGenerator();
      }
      saveState();
    });
  };
  bindGeoFlag("geoShowTree", "showTree");
  bindGeoFlag("geoShowConstruction", "showConstructionGeometry");
  bindGeoFlag("geoShowFlower", "showFlowerOverlay");
  bindGeoFlag("geoShowIntersections", "showIntersections");
  bindGeoFlag("geoShowSymmetry", "showSymmetryAxes");

  const summaryBtn = document.getElementById("rendererSummary");
  summaryBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    setRendererPopoverOpen(!isRendererPopoverOpen());
  });

  document.querySelectorAll("[data-render-layer]").forEach((el) => {
    el.addEventListener("change", () => {
      const next = new Set(ui.activeRenderLayers);
      const id = el.getAttribute("data-render-layer");
      if (!isRenderLayerId(id)) return;
      if (el.checked) next.add(id);
      else next.delete(id);
      applyActiveRenderLayers(next, { userPicked: true });
      saveState();
    });
  });

  document.getElementById("rendererSelectAll")?.addEventListener("change", (e) => {
    if (e.target.checked) {
      applyActiveRenderLayers(RENDER_LAYER_DRAW_ORDER, { userPicked: true });
    } else {
      applyActiveRenderLayers([], { userPicked: true });
    }
    saveState();
  });

  document.addEventListener("pointerdown", (e) => {
    if (!isRendererPopoverOpen()) return;
    const root = document.getElementById("rendererMultiselect");
    if (root && !root.contains(e.target)) setRendererPopoverOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isRendererPopoverOpen()) {
      setRendererPopoverOpen(false);
    }
  });

  window.addEventListener(
    "resize",
    () => {
      if (isRendererPopoverOpen()) positionRendererPopover();
    },
    { passive: true }
  );

  document.getElementById("radius").addEventListener("input", (e) => {
    ui.radius = Number(e.target.value);
    syncLabels();
    rebuildFromGenerator();
    saveState();
  });

  document.getElementById("pathThickness").addEventListener("input", (e) => {
    ui.pathThickness = Number(e.target.value);
    applyRenderLayerStylePatch("connections", { thickness: ui.pathThickness }, { rebuild: true });
    syncLabels();
    saveState();
  });

  document.querySelectorAll("[data-layer-style]").forEach((el) => {
    const handler = () => {
      const layerId = el.getAttribute("data-layer-style");
      const prop = el.getAttribute("data-style-prop");
      if (!layerId || !prop) return;
      if (prop === "color") {
        applyRenderLayerStylePatch(layerId, { color: el.value });
      } else if (prop === "opacity") {
        applyRenderLayerStylePatch(layerId, { opacity: Number(el.value) / 100 });
      } else if (prop === "thickness") {
        applyRenderLayerStylePatch(layerId, { thickness: Number(el.value) }, { rebuild: true });
      } else if (prop === "size") {
        applyRenderLayerStylePatch(layerId, { size: Number(el.value) }, { rebuild: true });
      }
      saveState();
    };
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  });

  document.getElementById("layers").addEventListener("input", (e) => {
    ui.constructionStep = Number(e.target.value);
    syncLabels();
    if (!ui.constructionMode) showStaticStep(ui.constructionStep);
    saveState();
  });

  document.getElementById("evolutionMode").addEventListener("change", (e) => {
    if (e.target.checked) enterEvolutionMode();
    else exitEvolutionMode();
    saveState();
  });

  document.getElementById("evoStepForward").addEventListener("click", () => {
    evolution.stepForward();
    saveState();
  });
  document.getElementById("evoStepBack").addEventListener("click", () => {
    evolution.stepBack();
    saveState();
  });
  document.getElementById("evoRestart").addEventListener("click", () => {
    evolution.restart();
    saveState();
  });
  document.getElementById("evoSlider").addEventListener("input", (e) => {
    evolution.goTo(Number(e.target.value));
    saveState();
  });

  document.getElementById("constructionMode").addEventListener("change", (e) => {
    ui.constructionMode = e.target.checked;
    if (ui.constructionMode) {
      if (ui.evolutionMode) {
        ui.evolutionMode = false;
        document.getElementById("evolutionMode").checked = false;
        evolution.setEnabled(false);
        syncEvolutionUI();
      }
      enterConstructionMode();
    } else exitConstructionMode();
    guidedTutorial.onConstructionModeChanged(ui.constructionMode);
    saveState();
  });

  document.getElementById("constructionStepSlider")?.addEventListener("input", (e) => {
    if (!ui.constructionMode) return;
    const next = Number(e.target.value);
    player.goToSphereCount(next);
    syncDisplayOverlays();
    saveState();
  });

  document.getElementById("autoPlay").addEventListener("change", (e) => {
    ui.autoPlay = e.target.checked;
    player.setAutoPlay(ui.autoPlay);
    saveState();
  });

  document.getElementById("btnPlay").addEventListener("click", () => player.play());
  document.getElementById("btnPause").addEventListener("click", () => player.pause());
  document.getElementById("btnStepForward").addEventListener("click", () => {
    player.stepForward();
    syncDisplayOverlays();
    frameActiveConstruction({ duration: 0.6, expandOnly: true });
  });
  document.getElementById("btnStepBack").addEventListener("click", () => {
    player.stepBack();
    syncDisplayOverlays();
    frameActiveConstruction({ duration: 0.6, expandOnly: true });
  });
  document.getElementById("btnRestart").addEventListener("click", () => {
    player.restart({ autoStart: ui.autoPlay });
    syncDisplayOverlays();
    frameActiveConstruction({ duration: 0.7 });
  });

  document.getElementById("palette")?.addEventListener("change", (e) => {
    ui.palette = e.target.value;
    applyAppearance();
    saveState();
  });

  document.getElementById("sphereColorMode").addEventListener("change", (e) => {
    ui.sphereColors.mode = e.target.value;
    syncSphereColorUI();
    applySphereColorsToRenderer();
    saveState();
  });

  const bindGlobalOpacity = (percent) => {
    const opacity = Math.min(100, Math.max(0, Number(percent))) / 100;
    setGlobalColor(ui.sphereColors, ui.sphereColors.global.hex, opacity);
    ui.transparency = 1 - opacity;
    syncLayerStylesFromSphereColors();
    syncSphereColorUI();
    syncRenderLayerStyleUI();
    applySphereColorsToRenderer();
  };

  document.getElementById("globalSphereColor").addEventListener("input", (e) => {
    setGlobalColor(ui.sphereColors, e.target.value, ui.sphereColors.global.opacity);
    syncLayerStylesFromSphereColors();
    syncRenderLayerStyleUI();
    applySphereColorsToRenderer();
    saveState();
  });
  document.getElementById("globalSphereOpacity").addEventListener("input", (e) => {
    bindGlobalOpacity(e.target.value);
    saveState();
  });
  document.getElementById("globalSphereOpacityNum").addEventListener("input", (e) => {
    bindGlobalOpacity(e.target.value);
    saveState();
  });

  const bindIndividualOpacity = (percent) => {
    const id = ui.sphereColors.selectedSphereId;
    if (!id) return;
    const opacity = Math.min(100, Math.max(0, Number(percent))) / 100;
    const hex = document.getElementById("individualSphereColor").value;
    setIndividualColor(ui.sphereColors, id, hex, opacity);
    syncSphereColorUI();
    applySphereColorsToRenderer();
  };

  document.getElementById("individualSphereColor").addEventListener("input", (e) => {
    const id = ui.sphereColors.selectedSphereId;
    if (!id) return;
    setIndividualColor(
      ui.sphereColors,
      id,
      e.target.value,
      resolveSphereColor(ui.sphereColors, id).opacity
    );
    applySphereColorsToRenderer();
    saveState();
  });
  document.getElementById("individualSphereOpacity").addEventListener("input", (e) => {
    bindIndividualOpacity(e.target.value);
    saveState();
  });
  document.getElementById("individualSphereOpacityNum").addEventListener("input", (e) => {
    bindIndividualOpacity(e.target.value);
    saveState();
  });

  document.querySelectorAll("[data-opacity-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.getAttribute("data-opacity-preset");
      const target = btn.getAttribute("data-target");
      const opacity = OPACITY_PRESETS[preset] ?? 1;
      if (target === "global") {
        setGlobalColor(ui.sphereColors, ui.sphereColors.global.hex, opacity);
        ui.transparency = 1 - opacity;
      } else if (ui.sphereColors.selectedSphereId) {
        const id = ui.sphereColors.selectedSphereId;
        setIndividualColor(
          ui.sphereColors,
          id,
          resolveSphereColor(ui.sphereColors, id).hex,
          opacity
        );
      }
      syncSphereColorUI();
      applySphereColorsToRenderer();
      saveState();
    });
  });

  document.getElementById("copySphereColor").addEventListener("click", () => {
    if (!ui.sphereColors.selectedSphereId) return;
    copySphereColor(ui.sphereColors, ui.sphereColors.selectedSphereId);
  });
  document.getElementById("pasteSphereColor").addEventListener("click", () => {
    if (!ui.sphereColors.selectedSphereId) return;
    pasteSphereColor(ui.sphereColors, ui.sphereColors.selectedSphereId);
    syncSphereColorUI();
    applySphereColorsToRenderer();
    saveState();
  });
  document.getElementById("resetSphereColor").addEventListener("click", () => {
    resetSphereColor(ui.sphereColors, ui.sphereColors.selectedSphereId);
    syncSphereColorUI();
    applySphereColorsToRenderer();
    saveState();
  });
  document.getElementById("resetAllSphereColors").addEventListener("click", () => {
    resetAllIndividualColors(ui.sphereColors);
    syncSphereColorUI();
    applySphereColorsToRenderer();
    saveState();
  });

  document.getElementById("colorIntensity").addEventListener("input", (e) => {
    ui.colorIntensity = Number(e.target.value);
    syncLabels();
    applyAppearance();
    saveState();
  });

  document.getElementById("blendStrength").addEventListener("input", (e) => {
    ui.blendStrength = Number(e.target.value);
    syncLabels();
    applyAppearance();
    saveState();
  });

  document.getElementById("wireframe").addEventListener("change", (e) => {
    ui.wireframe = e.target.checked;
    applyAppearance();
    saveState();
  });

  document.getElementById("material").addEventListener("change", (e) => {
    ui.material = e.target.value;
    applyAppearance();
    saveState();
  });

  document.getElementById("animSpeed").addEventListener("input", (e) => {
    ui.animSpeed = Number(e.target.value);
    player.setAnimSpeed(ui.animSpeed);
    syncLabels();
    saveState();
  });

  document.getElementById("cameraProjection")?.addEventListener("change", (e) => {
    cameraController.setProjection(e.target.value, { animate: true, duration: 0.7 });
    frameActiveConstruction({ duration: 0.7 });
    saveState();
  });

  document.getElementById("viewPresets")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (!btn) return;
    const preset = btn.getAttribute("data-preset");
    const box = computeDesignBox();
    if (preset === "reset") {
      frameActiveConstruction({ duration: 0.8 });
      return;
    }
    cameraController.goToPreset(preset, { duration: 0.8, box });
  });

  document.getElementById("measurementMode")?.addEventListener("change", (e) => {
    const on = e.target.checked;
    measurementMode.setEnabled(on);
    if (on) {
      const inspect = document.getElementById("inspectMode");
      if (inspect) inspect.checked = false;
      discoveryEngine.setInspectMode(false);
    }
    saveState();
  });

  document.getElementById("inspectMode")?.addEventListener("change", (e) => {
    const on = e.target.checked;
    discoveryEngine.setInspectMode(on);
    if (on) {
      const measure = document.getElementById("measurementMode");
      if (measure) measure.checked = false;
      measurementMode.setEnabled(false);
    }
    saveState();
  });

  document.getElementById("showGraph")?.addEventListener("change", (e) => {
    discoveryEngine.setShowGraph(e.target.checked);
    saveState();
  });

  const bindCollapse = (toggleId, panelId) => {
    const toggle = document.getElementById(toggleId);
    const panel = document.getElementById(panelId);
    toggle?.addEventListener("click", () => {
      if (!panel) return;
      const collapsed = panel.classList.toggle("collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
    });
  };
  bindCollapse("discoveriesToggle", "discoveriesPanel");
  bindCollapse("inspectorToggle", "inspectorPanel");
  bindCollapse("mathematicsToggle", "mathematicsPanel");

  document.querySelectorAll("[data-display]").forEach((el) => {
    el.addEventListener("change", () => {
      displayOverlays.setFlag(el.getAttribute("data-display"), el.checked);
      saveState();
    });
  });

  document.getElementById("exportObj").addEventListener("click", () => {
    const unsupported = exportUnsupportedLayers("obj");
    if (unsupported.length) {
      window.alert(
        `OBJ export does not support: ${unsupported.join(", ")}. Disable those layers or use Screenshot PNG.`
      );
      return;
    }
    const exporter = new OBJExporter();
    downloadString(exporter.parse(designGroup), `geometry-explor-${ui.geometry}.obj`);
  });

  document.getElementById("exportGlb").addEventListener("click", () => {
    const unsupported = exportUnsupportedLayers("glb");
    if (unsupported.length) {
      window.alert(
        `GLB export does not support: ${unsupported.join(", ")}. Disable those layers or use Screenshot PNG.`
      );
      return;
    }
    const exporter = new GLTFExporter();
    exporter.parse(
      designGroup,
      (result) => {
        downloadBlob(
          new Blob([result], { type: "application/octet-stream" }),
          `geometry-explor-${ui.geometry}.glb`
        );
      },
      (error) => console.error("GLB export failed", error),
      { binary: true }
    );
  });

  document.getElementById("screenshot").addEventListener("click", () => {
    const cam = cameraController.getActiveCamera();
    webgl.render(scene, cam);
    displayOverlays.render(cam);
    canvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `geometry-explor-${Date.now()}.png`);
    }, "image/png");
  });

  document.getElementById("exportTransparentPng")?.addEventListener("click", () => {
    exportTransparentPng();
  });

  document.getElementById("resetView").addEventListener("click", () => {
    frameActiveConstruction({ duration: 0.8 });
  });

  document.getElementById("resetControls").addEventListener("click", () => {
    resetControlsToDefaults();
    saveState();
  });

  document.getElementById("resetAll")?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    resetControlsToDefaults();
    ui.autoRotate = false;
    ui.autoRotateSpeed = 1.0;
    ui.renderingPreset = "custom";
    ui.backgroundColor = "#0e1a24";
    ui.transparentBackground = false;
    ui.lightingIntensity = 1.0;
    ui.environmentPreset = "darkSpace";
    applyEnvironmentPreset("darkSpace");
    cameraController.controls.autoRotate = false;
    syncLabels();
    rebuildFromGenerator();
    frameActiveConstruction({ duration: 0.8 });
  });

  // New feature bindings
  document.getElementById("renderingPreset")?.addEventListener("change", (e) => {
    const preset = e.target.value;
    if (preset === "custom") {
      ui.renderingPreset = "custom";
    } else {
      applyRenderingPreset(preset);
    }
    saveState();
  });

  document.getElementById("autoRotate")?.addEventListener("change", (e) => {
    ui.autoRotate = e.target.checked;
    cameraController.controls.autoRotate = ui.autoRotate;
    saveState();
  });

  document.getElementById("autoRotateSpeed")?.addEventListener("input", (e) => {
    ui.autoRotateSpeed = parseFloat(e.target.value);
    cameraController.controls.autoRotateSpeed = ui.autoRotateSpeed;
    syncLabels();
    saveState();
  });

  document.getElementById("backgroundColor")?.addEventListener("input", (e) => {
    ui.backgroundColor = e.target.value;
    if (ui.environmentPreset === "custom" || ui.transparentBackground) {
      scene.background = new THREE.Color(ui.backgroundColor);
      webgl.setClearColor(ui.backgroundColor, 1);
    }
    saveState();
  });

  document.getElementById("transparentBackground")?.addEventListener("change", (e) => {
    ui.transparentBackground = e.target.checked;
    if (ui.transparentBackground) {
      scene.background = null;
      scene.fog = null;
      webgl.setClearColor(0x000000, 0);
    } else {
      applyEnvironmentPreset(ui.environmentPreset);
    }
    saveState();
  });

  document.getElementById("lightingIntensity")?.addEventListener("input", (e) => {
    ui.lightingIntensity = parseFloat(e.target.value);
    applyEnvironmentPreset(ui.environmentPreset);
    syncLabels();
    saveState();
  });

  document.getElementById("environmentPreset")?.addEventListener("change", (e) => {
    ui.environmentPreset = e.target.value;
    applyEnvironmentPreset(ui.environmentPreset);
    saveState();
  });

  document.getElementById("colorPatternRainbow")?.addEventListener("click", () => {
    applyColorPattern("rainbow");
    saveState();
  });
  document.getElementById("colorPatternAlternating")?.addEventListener("click", () => {
    applyColorPattern("alternating");
    saveState();
  });
  document.getElementById("colorPatternRandom")?.addEventListener("click", () => {
    applyColorPattern("random");
    saveState();
  });
  document.getElementById("colorPatternRing")?.addEventListener("click", () => {
    applyColorPattern("ring");
    saveState();
  });

  const onIntroPrefChange = (e) => {
    const on = Boolean(e.target.checked);
    setShowIntroOnOpen(on);
    syncIntroCheckboxes(on);
  };
  document.querySelectorAll("[data-intro-pref]").forEach((el) => {
    el.addEventListener("change", onIntroPrefChange);
  });

  document.getElementById("introClose")?.addEventListener("click", () => {
    if (guidedTutorial.isActive()) guidedTutorial.end();
    else setIntroOpen(false);
  });
  document.getElementById("introDone")?.addEventListener("click", () => {
    if (!guidedTutorial.isActive()) guidedTutorial.start({ fromWelcome: true });
    guidedTutorial.onWelcomeDone();
  });
  document.getElementById("openTutorial")?.addEventListener("click", () => {
    guidedTutorial.start({ fromWelcome: true });
  });
  document.getElementById("introOverlay")?.addEventListener("click", (e) => {
    if (e.target !== e.currentTarget) return;
    if (guidedTutorial.isActive()) guidedTutorial.end();
    else setIntroOpen(false);
  });

  const onMenuToggle = () => {
    if (isMobileSheetLayout()) {
      const cur = getSheetState();
      if (guidedTutorial?.isActive?.() && isMobileTutorialLayout()) {
        setSheetState(cur === SHEET_STATE.COLLAPSED ? SHEET_STATE.HALF : SHEET_STATE.COLLAPSED);
        ui.panelOpen = getSheetState() !== SHEET_STATE.COLLAPSED;
      } else if (cur === SHEET_STATE.COLLAPSED) {
        setPanelOpen(true, { reframe: true });
      } else {
        setPanelOpen(false, { reframe: true });
      }
    } else {
      setPanelOpen(!ui.panelOpen, { reframe: true });
    }
    setTimeout(() => guidedTutorial?.reposition(), 80);
    setTimeout(() => guidedTutorial?.reposition(), 360);
  };
  document.getElementById("menuToggle")?.addEventListener("click", onMenuToggle);
  document.getElementById("panelClose")?.addEventListener("click", () => {
    setPanelOpen(false, { reframe: true });
    setTimeout(() => guidedTutorial?.reposition(), 80);
    setTimeout(() => guidedTutorial?.reposition(), 360);
  });

  bindSheetHandle({
    onChange: () => {
      ui.panelOpen = getSheetState() !== SHEET_STATE.COLLAPSED;
      if (guidedTutorial?.isActive?.() && isMobileTutorialLayout()) {
        frameTutorialGeometry({ animate: true, duration: 0.45 });
      } else {
        frameActiveConstruction({ animate: true, duration: 0.45 });
      }
      guidedTutorial?.reposition();
    },
  });
}
focusSystem.onChange = (sel) => {
  if (!sel) {
    ui.sphereColors.selectedSphereId = null;
    engine.setSelectedSphereId(null);
    measurementMode.clear();
    syncSphereColorUI();
    updateSphereInfo();
    return;
  }
  const id = sel.pointId ?? sel.mesh?.userData?.specId ?? null;
  ui.sphereColors.selectedSphereId = id;
  engine.setSelectedSphereId(id);
  
  syncSphereColorUI();
  updateSphereInfo();
  saveState();
};

function onViewportResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio, 2);

  webgl.setPixelRatio(dpr);
  webgl.setSize(w, h);

  cameraController.setAspect(w / h);

  displayOverlays.setSize(w, h);
  measurementMode.setResolution(w, h);
  
  syncViewLayout();
  positionRendererPopover();
}

window.addEventListener("resize", onViewportResize, { passive: true });

function animate() {
  requestAnimationFrame(animate);

  const dt = 0.016;
  const cam = cameraController.getActiveCamera();

  // Always render first so one broken feature cannot blank the workspace.
  webgl.render(scene, cam);

  try {
    displayOverlays.render(cam);
  } catch (error) {
    console.error("Display overlay render failed:", error);
  }

  try {
    player.update();
  } catch (error) {
    console.error("Player update failed:", error);
  }

  try {
    focusSystem.update(dt);
  } catch (error) {
    console.error("Focus system update failed:", error);
  }

  try {
    displayOverlays.update(dt);
  } catch (error) {
    console.error("Display overlay update failed:", error);
  }

  try {
    measurementMode.update(dt);
  } catch (error) {
    console.error("Measurement update failed:", error);
  }

  try {
    discoveryEngine.update(dt);
  } catch (error) {
    console.error("Discovery update failed:", error);
  }

  try {
    evolution.update(dt);
  } catch (error) {
    console.error("Evolution update failed:", error);
  }

  try {
    cameraController.update(dt);
  } catch (error) {
    console.error("Camera update failed:", error);
  }

  const now = performance.now();

  if (now - lastSave > 5000) {
    saveState();
    lastSave = now;
  }
}
// Initialize
loadState();

// Make sure the saved state uses valid Sets and defaults.
if (!(ui.activeRenderLayers instanceof Set)) {
  ui.activeRenderLayers = new Set(
    ui.activeRenderLayers || DEFAULT_ACTIVE_RENDER_LAYERS
  );
}

populateGeometrySelect();
populateRenderModeSelect();

syncLayerStylesFromSphereColors();
syncRendererLayerUI();
syncRenderLayerStyleUI();
syncSphereColorUI();
syncTreeViewUI();
syncEndlessUI();
syncConstructionUI();
syncEvolutionUI();
syncLabels();

bindControls();

cameraController.controls.autoRotate = ui.autoRotate;
cameraController.controls.autoRotateSpeed = ui.autoRotateSpeed;

applyEnvironmentPreset(ui.environmentPreset);

// Build the selected geometry.
engine.geometryId = ui.geometry;
engine.radius = ui.radius;

if (ui.geometry === "treeOfLife") {
  engine.geometryOpts = treeGeometryOpts();
} else if (ui.geometry === "endless") {
  engine.geometryOpts = endlessGeometryOpts();
} else {
  engine.geometryOpts = {};
}

engine.regenerate();
engine.setActiveRenderLayers(ui.activeRenderLayers);
applyAppearance();

// Show the complete geometry when Construction Mode is off.
const maxStep = engine.getMaxStep();
ui.constructionStep = maxStep;

const layersSlider = document.getElementById("layers");
if (layersSlider) {
  layersSlider.max = String(maxStep);
  layersSlider.value = String(maxStep);
}

engine.setConstructionMode(false);
showStaticStep(maxStep, { reframe: false });

syncConstructionUI();
syncDisplayOverlays();
syncWorldDecor();
syncLabels();

onViewportResize();

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    syncViewLayout();
    frameActiveConstruction({
      animate: false,
      expandOnly: false,
    });
  });
});

if (getShowIntroOnOpen()) {
  setIntroOpen(true);
} else {
  setIntroOpen(false);
}

animate();
