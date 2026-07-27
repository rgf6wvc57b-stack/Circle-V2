/**
 * ConstructionPlayer — visualizes the geometric construction process.
 *
 * Phases per sphere:
 *  1. placePoint (instant, exact center)
 *  2. drawSphere compass sweep (circle drawn; sphere at full radius, never morphs)
 *  3. highlight dwell on the new sphere
 *  4. continue
 *
 * Controls: play, pause, stepForward, stepBack, restart, autoPlay
 */
export class ConstructionPlayer {
  /**
   * @param {import('../index.js').ConstructionEngine} engine
   */
  constructor(engine) {
    this.engine = engine;
    /** @type {object | null} */
    this.plan = null;
    this.playing = false;
    this.autoPlay = false;
    /** Completed sphere count (1..N when a sphere is fully done; 0 before first) */
    this.completedSpheres = 0;
    /** @type {'idle' | 'drawing' | 'highlight'} */
    this.phase = "idle";
    this.compassProgress = 0;
    this.highlightTimer = 0;
    /** @type {object | null} */
    this.activeOp = null;
    this.activeOpIndex = -1;
    this.animSpeed = 0.6;
    this.onChange = null;
  }

  #emit() {
    if (typeof this.onChange === "function") this.onChange(this.getState());
  }

  getState() {
    return {
      playing: this.playing,
      autoPlay: this.autoPlay,
      phase: this.phase,
      step: Math.max(1, this.completedSpheres || (this.phase === "idle" ? 0 : 1)),
      displayStep: this.#displayStep(),
      totalSteps: this.plan?.sphereCount ?? 1,
      compassProgress: this.compassProgress,
      activeId: this.activeOp?.pointId ?? null,
      constructionReport: this.getConstructionStepReport(),
    };
  }

  /**
   * Construction Mode report for the current sphere step.
   * Surfaces rule / parents / new geometry / validation without baking coordinates.
   */
  getConstructionStepReport() {
    if (!this.plan?.validations?.length) return null;
    const sphereCount = this.#displayStep();
    if (sphereCount <= 0) {
      return {
        sphereStep: 0,
        constructionRule: "placeOrigin",
        parentGeometry: [],
        newGeometryCreated: ["seed-center"],
        validationResults: this.plan.validations[0] ?? null,
        ok: this.plan.validations[0]?.ok ?? true,
      };
    }

    // Find the drawSphere rule that completed this sphere count
    let seen = 0;
    let drawIdx = -1;
    for (let i = 0; i < this.plan.rules.length; i += 1) {
      if (this.plan.rules[i].type === "drawSphere") {
        seen += 1;
        if (seen === sphereCount) {
          drawIdx = i;
          break;
        }
      }
    }
    if (drawIdx < 0) return null;

    const drawRule = this.plan.rules[drawIdx];
    const drawVal = this.plan.validations[drawIdx];
    // Parent point rule is typically the preceding place/ray/circle rule for this center
    let parentRule = null;
    let parentVal = null;
    for (let i = drawIdx - 1; i >= 0; i -= 1) {
      const r = this.plan.rules[i];
      if (
        (r.pointId && r.pointId === drawRule.centerId) ||
        (r.aliasId && r.aliasId === drawRule.centerId)
      ) {
        parentRule = r;
        parentVal = this.plan.validations[i];
        break;
      }
    }

    const parents = [];
    if (parentRule?.type === "rayCircleIntersection") {
      parents.push(parentRule.originId, parentRule.circleCenterId);
    } else if (parentRule?.type === "circleCircleIntersection") {
      parents.push(parentRule.circleAId, parentRule.circleBId);
    } else if (parentRule?.type === "placeOrigin") {
      parents.push("(free choice)");
    }

    const checks = [
      ...(parentVal?.checks || []),
      ...(drawVal?.checks || []),
    ];

    return {
      sphereStep: sphereCount,
      constructionRule: parentRule?.justification || drawRule.justification,
      ruleType: parentRule?.type || drawRule.type,
      parentGeometry: [...new Set(parents.filter(Boolean))],
      newGeometryCreated: [drawRule.centerId, drawRule.sphereId],
      validationResults: {
        ok: (parentVal?.ok ?? true) && (drawVal?.ok ?? true),
        checks,
      },
      ok: (parentVal?.ok ?? true) && (drawVal?.ok ?? true),
    };
  }

  #displayStep() {
    if (!this.plan) return 0;
    if (this.phase === "drawing" || this.phase === "highlight") {
      return Math.min(this.plan.sphereCount, this.completedSpheres + 1);
    }
    return this.completedSpheres;
  }

  loadPlan(plan) {
    this.plan = plan;
    this.restart({ autoStart: false });
  }

  setAnimSpeed(speed) {
    this.animSpeed = speed;
  }

  setAutoPlay(enabled) {
    this.autoPlay = Boolean(enabled);
    if (this.autoPlay) this.play();
    this.#emit();
  }

  play() {
    if (!this.plan) return;
    if (this.completedSpheres >= this.plan.sphereCount && this.phase === "idle") {
      // Already finished — restart then play
      this.restart({ autoStart: true });
      return;
    }
    this.playing = true;
    if (this.phase === "idle") this.#beginNextSphere();
    this.#emit();
  }

  pause() {
    this.playing = false;
    this.#emit();
  }

  restart({ autoStart = false } = {}) {
    this.playing = false;
    this.phase = "idle";
    this.compassProgress = 0;
    this.highlightTimer = 0;
    this.activeOp = null;
    this.activeOpIndex = -1;
    this.completedSpheres = 0;
    this.engine.clearDrawProgress();
    this.engine.setActiveId(null);

    if (!this.plan) {
      this.#emit();
      return;
    }

    // Step 0 visual: nothing, then immediately show origin sphere as step 1 complete
    // Spec: start with a single sphere at the origin — jump to first sphere completed state
    // then allow play to continue from sphere 2. Or start mid-draw of first sphere.
    // We'll place cursor before any ops, then if autoStart/play, begin first sphere.
    this.engine.setOperationCursor(-1);
    this.engine.redraw();

    // Instantly construct the origin sphere (step 1) as the starting frame,
    // then highlight briefly if playing — actually spec says animate one at a time
    // starting with origin. So begin drawing sphere 1 on play/restart-with-autostart.
    if (autoStart || this.autoPlay) {
      this.playing = true;
      this.#beginNextSphere();
    } else {
      // Paused at very start: show origin point+sphere fully as the baseline
      this.#snapToSphereCount(1);
    }
    this.#emit();
  }

  /**
   * Advance one sphere (or finish current draw/highlight).
   */
  stepForward() {
    if (!this.plan) return;
    this.playing = false;

    if (this.phase === "drawing") {
      this.#completeDrawInstant();
      this.phase = "highlight";
      this.highlightTimer = 0;
      this.#applyHighlight();
      this.#emit();
      return;
    }
    if (this.phase === "highlight") {
      this.#endHighlight();
      this.#emit();
      return;
    }
    if (this.completedSpheres >= this.plan.sphereCount) {
      this.#emit();
      return;
    }
    this.#beginNextSphere();
    // For step mode: complete the compass draw instantly, then highlight
    this.#completeDrawInstant();
    this.phase = "highlight";
    this.highlightTimer = 0;
    this.#applyHighlight();
    this.#emit();
  }

  /**
   * Go back one completed sphere (exact prior construction, no reverse morph).
   */
  stepBack() {
    if (!this.plan) return;
    this.playing = false;
    this.phase = "idle";
    this.compassProgress = 0;
    this.highlightTimer = 0;
    this.activeOp = null;
    this.engine.clearDrawProgress();
    this.engine.setActiveId(null);

    const target = Math.max(1, this.completedSpheres - 1);
    this.#snapToSphereCount(target);
    this.#emit();
  }

  /**
   * Jump to a completed sphere count (1..N). Used by the Construction Step slider.
   * Does not invent geometry — snaps the canonical plan cursor.
   */
  goToSphereCount(count) {
    if (!this.plan) return;
    this.playing = false;
    this.phase = "idle";
    this.compassProgress = 0;
    this.highlightTimer = 0;
    this.activeOp = null;
    this.engine.clearDrawProgress();
    this.engine.setActiveId(null);
    const target = Math.max(1, Math.min(this.plan.sphereCount, Number(count) || 1));
    this.#snapToSphereCount(target);
    this.#emit();
  }

  update(dt) {
    if (!this.plan || !this.playing) return;

    const speed = Math.max(this.animSpeed, 0.05);

    if (this.phase === "drawing") {
      this.compassProgress = Math.min(1, this.compassProgress + (dt * speed) / 1.2);
      this.#applyCompassProgress();
      if (this.compassProgress >= 1) {
        this.phase = "highlight";
        this.highlightTimer = 0;
        this.#applyHighlight();
        this.#emit();
      }
      return;
    }

    if (this.phase === "highlight") {
      this.highlightTimer += dt;
      const dwell = 0.55 / speed;
      this.engine.setGlowPhase(this.highlightTimer * 8);
      if (this.highlightTimer >= dwell) {
        this.#endHighlight();
        if (this.completedSpheres >= this.plan.sphereCount) {
          this.playing = false;
          this.#emit();
          return;
        }
        this.#beginNextSphere();
        this.#emit();
      }
    }
  }

  #snapToSphereCount(count) {
    const n = Math.max(0, Math.min(this.plan.sphereCount, count));
    this.completedSpheres = n;
    if (n <= 0) {
      this.engine.setOperationCursor(-1);
    } else {
      this.engine.setOperationCursor(this.plan.operationIndexForSphereCount(n));
    }
    this.engine.clearDrawProgress();
    const visible = this.engine.getVisibleData();
    visible?.sphereCenters.forEach((s) => this.engine.setDrawProgress(s.id, 1));
    visible?.circleCenters.forEach((c) => this.engine.setDrawProgress(c.id, 1));
    visible?.points.forEach((p) => this.engine.setDrawProgress(p.id, 1));
    this.engine.setActiveId(null);
    this.engine.redraw();
  }

  #beginNextSphere() {
    if (!this.plan) return;
    if (this.completedSpheres >= this.plan.sphereCount) {
      this.playing = false;
      this.phase = "idle";
      return;
    }

    const startOp =
      this.completedSpheres <= 0
        ? 0
        : this.plan.operationIndexForSphereCount(this.completedSpheres) + 1;
    const endOp = this.plan.operationIndexForSphereCount(this.completedSpheres + 1);

    // Apply all placePoints / edges before the drawSphere instantly
    let drawOp = null;
    let drawIndex = -1;
    for (let i = startOp; i <= endOp; i += 1) {
      const op = this.plan.operations[i];
      if (op.type === "placePoint" || op.type === "addEdge" || op.type === "addFace") {
        this.engine.setOperationCursor(i);
        // keep going
      }
      if (op.type === "drawSphere") {
        drawOp = op;
        drawIndex = i;
      }
    }

    if (!drawOp) {
      this.playing = false;
      this.phase = "idle";
      return;
    }

    // Include the sphere at full radius; compass arc starts at 0
    this.engine.setOperationCursor(drawIndex);
    this.activeOp = drawOp;
    this.activeOpIndex = drawIndex;
    this.compassProgress = 0;
    this.phase = "drawing";
    this.engine.setActiveId(drawOp.pointId);
    this.engine.setDrawProgress(drawOp.sphereId, 0);
    this.engine.setDrawProgress(`circle-${drawOp.pointId}`, 0);
    this.engine.setDrawProgress(drawOp.pointId, 0);
    this.engine.redraw();
    console.info("Construction:", drawOp.justification);
  }

  #applyCompassProgress() {
    if (!this.activeOp) return;
    const op = this.activeOp;
    this.engine.setDrawProgress(op.sphereId, this.compassProgress);
    this.engine.setDrawProgress(`circle-${op.pointId}`, this.compassProgress);
    this.engine.setDrawProgress(op.pointId, this.compassProgress);
    this.engine.setActiveId(op.pointId);
    this.engine.redraw();
  }

  #completeDrawInstant() {
    if (!this.activeOp) {
      // Need to begin first
      this.#beginNextSphere();
    }
    if (!this.activeOp) return;
    this.compassProgress = 1;
    this.#applyCompassProgress();
  }

  #applyHighlight() {
    if (!this.activeOp) return;
    this.engine.setDrawProgress(this.activeOp.sphereId, 1);
    this.engine.setDrawProgress(`circle-${this.activeOp.pointId}`, 1);
    this.engine.setDrawProgress(this.activeOp.pointId, 1);
    this.engine.setActiveId(this.activeOp.pointId);
    this.engine.redraw();
  }

  #endHighlight() {
    this.completedSpheres = Math.min(this.plan.sphereCount, this.completedSpheres + 1);
    this.engine.setActiveId(null);
    this.activeOp = null;
    this.activeOpIndex = -1;
    this.compassProgress = 0;
    this.highlightTimer = 0;
    this.phase = "idle";
    this.engine.clearDrawProgress();
    const visible = this.engine.getVisibleData();
    visible?.sphereCenters.forEach((s) => this.engine.setDrawProgress(s.id, 1));
    visible?.circleCenters.forEach((c) => this.engine.setDrawProgress(c.id, 1));
    visible?.points.forEach((p) => this.engine.setDrawProgress(p.id, 1));
    this.engine.redraw();
  }
}
