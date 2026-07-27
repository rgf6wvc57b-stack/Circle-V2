import { getEvolutionSequence, EVOLUTION_DEFAULT_SEQUENCE } from "./registry.js";
import { diffNewIds } from "./buildHelpers.js";

/**
 * Evolution Mode — mathematically accurate construction timeline.
 * Not an animation: each step is a constructible ConstructionData snapshot.
 * Future sequences (tesseract, torus, …) register via the same framework.
 */
export class EvolutionController {
  /**
   * @param {{
   *   engine: import('../index.js').ConstructionEngine,
   *   onChange?: (state: object) => void,
   * }} opts
   */
  constructor(opts) {
    this.engine = opts.engine;
    this.onChange = opts.onChange ?? null;
    this.sequenceId = EVOLUTION_DEFAULT_SEQUENCE;
    this.stepIndex = 0;
    this.enabled = false;
    this.radius = 1.2;
    /** @type {import('../schema.js').ConstructionData | null} */
    this.currentData = null;
    /** @type {string[]} */
    this._highlightQueue = [];
    this._highlightT = 0;
    this._highlightDuration = 0.7;
  }

  get sequence() {
    return getEvolutionSequence(this.sequenceId);
  }

  get step() {
    return this.sequence.steps[this.stepIndex];
  }

  getState() {
    const step = this.step;
    return {
      enabled: this.enabled,
      sequenceId: this.sequenceId,
      sequenceLabel: this.sequence.label,
      stepIndex: this.stepIndex,
      totalSteps: this.sequence.steps.length,
      stepId: step?.id ?? null,
      title: step?.title ?? "",
      description: step?.description ?? "",
      renderMode: step?.renderMode ?? "mixed",
      highlightIds: [...this._highlightQueue],
    };
  }

  setSequence(id) {
    this.sequenceId = id;
    this.stepIndex = 0;
    if (this.enabled) this.#loadCurrent({ highlight: false });
    this.#emit();
  }

  setRadius(radius) {
    this.radius = radius;
    if (this.enabled) this.#loadCurrent({ highlight: false });
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (this.enabled) {
      this.stepIndex = 0;
      this.#loadCurrent({ highlight: false });
    } else {
      this.currentData = null;
      this._highlightQueue = [];
      this.engine.setActiveId(null);
      this.engine.clearDrawProgress();
    }
    this.#emit();
  }

  goTo(index) {
    if (!this.enabled) return;
    const max = this.sequence.steps.length - 1;
    const next = Math.max(0, Math.min(max, Math.round(index)));
    const prevData = this.currentData;
    this.stepIndex = next;
    this.#loadCurrent({ highlight: true, prevData });
    this.#emit();
  }

  stepForward() {
    this.goTo(this.stepIndex + 1);
  }

  stepBack() {
    this.goTo(this.stepIndex - 1);
  }

  restart() {
    this.goTo(0);
  }

  /**
   * Pulse newly created objects. Call from the animate loop.
   * @param {number} dt
   */
  update(dt) {
    if (!this.enabled || !this._highlightQueue.length) return;
    this._highlightT += dt;
    const idx = Math.min(
      this._highlightQueue.length - 1,
      Math.floor(this._highlightT / (this._highlightDuration / Math.max(1, this._highlightQueue.length)))
    );
    const id = this._highlightQueue[idx];
    // Prefer point id for glow (renderer matches pointId / sphere)
    const pointId = id.startsWith("sphere-") ? id.replace(/^sphere-/, "") : id;
    this.engine.setActiveId(pointId);
    this.engine.setGlowPhase(this._highlightT * 4);

    if (this._highlightT >= this._highlightDuration) {
      this._highlightQueue = [];
      this.engine.setActiveId(null);
      this.engine.setGlowPhase(0);
    }
  }

  #loadCurrent({ highlight = false, prevData = null } = {}) {
    const step = this.step;
    const data = step.build(this.radius);
    data.meta = {
      ...(data.meta || {}),
      evolution: true,
      sequenceId: this.sequenceId,
      stageId: step.id,
      stageIndex: step.index,
    };

    const newIds = highlight ? diffNewIds(prevData, data) : [];
    this.currentData = data;
    this.engine.loadEvolutionSnapshot(data);

    if (newIds.length) {
      // Highlight new spheres/points first
      this._highlightQueue = newIds.filter(
        (id) =>
          id.startsWith("sphere-") ||
          data.points.some((p) => p.id === id) ||
          id.startsWith("vesica-")
      );
      if (!this._highlightQueue.length) this._highlightQueue = newIds.slice(0, 8);
      this._highlightT = 0;
    } else {
      this._highlightQueue = [];
      this.engine.setActiveId(null);
    }
  }

  #emit() {
    this.onChange?.(this.getState());
  }
}
