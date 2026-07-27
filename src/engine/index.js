import { generateGeometry, listGeometries } from "./generators/index.js";
import { ConstructionSystem, buildConstructionPlan } from "./construction/ConstructionSystem.js";
import { ConstructionPlayer } from "./construction/ConstructionPlayer.js";
import { GeometryRenderer, RENDER_MODES } from "./renderer/GeometryRenderer.js";

/**
 * Mathematical construction engine facade.
 * Generator → Construction System → Renderer
 * Construction Mode uses ConstructionPlayer for process visualization.
 */
export class ConstructionEngine {
  /**
   * @param {import('three').Group} group
   */
  constructor(group) {
    this.construction = new ConstructionSystem();
    this.renderer = new GeometryRenderer(group);
    this.player = new ConstructionPlayer(this);
    this.geometryId = "vesicaPiscis";
    this.radius = 1.2;
    /** @type {object} Options forwarded to mode-aware generators (e.g. Tree viewMode). */
    this.geometryOpts = {};
  }

  listGeometries() {
    return listGeometries();
  }

  getRenderModes() {
    return RENDER_MODES;
  }

  regenerate() {
    const data = generateGeometry(this.geometryId, this.radius, this.geometryOpts);
    const plan = buildConstructionPlan(this.geometryId, this.radius, this.geometryOpts);
    // Align generator maxStep with plan sphere count for UI consistency
    data.maxStep = plan.sphereCount;
    this.construction.setConstructionData(data, { plan });
    this.player.loadPlan(plan);
    this.#pushVisibleToRenderer();
    return data;
  }

  setGeometry(id) {
    this.geometryId = id;
    return this.regenerate();
  }

  setGeometryOpts(partial) {
    this.geometryOpts = { ...this.geometryOpts, ...partial };
    return this.regenerate();
  }

  setRadius(radius) {
    this.radius = radius;
    return this.regenerate();
  }

  /**
   * Load an Evolution Mode snapshot (constructible ConstructionData).
   * Bypasses the single-geometry generator so cross-geometry timelines can run.
   * @param {import('./schema.js').ConstructionData} data
   */
  loadEvolutionSnapshot(data) {
    this.player.pause();
    this.player.setAutoPlay(false);
    this.geometryId = data?.id || "evolution";
    this.construction.setConstructionData(data, { plan: null });
    this.construction.setConstructionMode(false);
    this.construction.setStep(data?.maxStep || 1);
    this.clearDrawProgress();
    data?.sphereCenters?.forEach((s) => this.setDrawProgress(s.id, 1));
    data?.circleCenters?.forEach((c) => this.setDrawProgress(c.id, 1));
    data?.points?.forEach((p) => this.setDrawProgress(p.id, 1));
    this.setActiveId(null);
    this.#pushVisibleToRenderer();
    return data;
  }

  setStep(step) {
    this.construction.setStep(step);
    this.#pushVisibleToRenderer();
  }

  setConstructionMode(enabled) {
    this.construction.setConstructionMode(enabled);
    this.#pushVisibleToRenderer();
  }

  setOperationCursor(opIndex) {
    this.construction.setOperationCursor(opIndex);
    this.#pushVisibleToRenderer();
  }

  getPlan() {
    return this.construction.getPlan();
  }

  getOperationCursor() {
    return this.construction.getOperationCursor();
  }

  setRenderMode(mode) {
    this.renderer.setMode(mode);
  }

  /** Independent presentation layers (order-independent). */
  setActiveRenderLayers(layers) {
    this.renderer.setActiveLayers(layers);
  }

  getActiveRenderLayers() {
    return this.renderer.getActiveLayers();
  }

  setAppearance(partial) {
    this.renderer.setAppearance(partial);
  }

  /** Update sphere colors/opacity without rebuilding geometry. */
  updateSphereColors(partial) {
    this.renderer.updateSphereColors(partial);
  }

  /** Update per-layer colors/opacity in place (thickness/size still need redraw). */
  updateLayerStyles(partial) {
    this.renderer.updateLayerStyles(partial);
  }

  setSelectedSphereId(id) {
    this.renderer.setSelectedSphereId(id);
  }

  setDrawProgress(id, progress) {
    this.renderer.setDrawProgress(id, progress);
  }

  clearDrawProgress() {
    this.renderer.clearDrawProgress();
  }

  setActiveId(id) {
    this.renderer.setActiveId(id);
  }

  setGlowPhase(phase) {
    this.renderer.setGlowPhase(phase);
  }

  redraw() {
    this.renderer.redraw();
  }

  getVisibleData() {
    return this.construction.getVisibleData();
  }

  getFullData() {
    return this.construction.getFullData();
  }

  getStep() {
    return this.construction.getStep();
  }

  getMaxStep() {
    return this.construction.getMaxStep();
  }

  isConstructionMode() {
    return this.construction.constructionMode;
  }

  #pushVisibleToRenderer() {
    this.renderer.setData(this.construction.getVisibleData());
  }
}

export {
  RENDER_MODES,
  generateGeometry,
  ConstructionSystem,
  GeometryRenderer,
  ConstructionPlayer,
  buildConstructionPlan,
};

export {
  buildFromRules,
  rebuild,
  buildSeedOfLifeRules,
  buildFlowerOfLifeRules,
  buildFruitOfLifeRules,
  buildMetatronCubeRules,
} from "./construction/kernel/index.js";
