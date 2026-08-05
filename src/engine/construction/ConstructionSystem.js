import { applyConstructionPlan, buildConstructionPlan } from "./plans.js";
import { clampConstructionStep } from "./constructionStep.js";

/**
 * Construction System — sequential geometric construction from plans.
 */
export class ConstructionSystem {
  constructor() {
    /** @type {import('../schema.js').ConstructionData | null} */
    this.fullData = null;
    /** @type {object | null} */
    this.plan = null;
    this.step = 1;
    this.constructionMode = false;
    this.operationCursor = -1;
  }

  setConstructionData(data, { plan = null } = {}) {
    this.fullData = data;
    this.plan = plan;
    const max = plan?.sphereCount ?? data.maxStep ?? 0;
    this.step = clampConstructionStep(this.step, max);
    this.operationCursor =
      plan && this.step > 0 ? plan.operationIndexForSphereCount(this.step) : -1;
  }

  setConstructionMode(enabled) {
    this.constructionMode = Boolean(enabled);
  }

  setStep(step) {
    if (!this.fullData) return;
    const max = this.plan?.sphereCount ?? this.fullData.maxStep ?? 0;
    this.step = clampConstructionStep(step, max);
    if (this.plan) {
      this.operationCursor =
        this.step > 0 ? this.plan.operationIndexForSphereCount(this.step) : -1;
    }
  }

  setOperationCursor(opIndex) {
    if (!this.plan) return;
    this.operationCursor = Math.max(-1, Math.min(this.plan.operations.length - 1, opIndex));

    if (this.plan.stepKind === "layer" && this.plan.layerEndOpIndices?.length) {
      let step = 0;
      const ends = this.plan.layerEndOpIndices;
      for (let i = 0; i < ends.length; i += 1) {
        if (this.operationCursor >= ends[i]) step = i + 1;
      }
      this.step = step;
      return;
    }

    let spheres = 0;
    for (let i = 0; i <= this.operationCursor; i += 1) {
      if (this.plan.operations[i].type === "drawSphere") spheres += 1;
    }
    this.step = Math.max(0, spheres);
  }

  getStep() {
    return this.step;
  }

  getMaxStep() {
    return this.plan?.sphereCount ?? this.fullData?.maxStep ?? 1;
  }

  getFullData() {
    return this.fullData;
  }

  getPlan() {
    return this.plan;
  }

  getOperationCursor() {
    return this.operationCursor;
  }

  getVisibleData() {
    if (!this.fullData) return null;

    if (this.constructionMode && this.plan) {
      return applyConstructionPlan(this.plan, this.operationCursor);
    }

    const step = this.step;
    const points = this.fullData.points.filter((p) => p.step <= step);
    const visibleIds = new Set(points.map((p) => p.id));

    return {
      id: this.fullData.id,
      name: this.fullData.name,
      radius: this.fullData.radius,
      points,
      sphereCenters: this.fullData.sphereCenters.filter((s) => visibleIds.has(s.pointId)),
      circleCenters: this.fullData.circleCenters.filter((c) => visibleIds.has(c.pointId)),
      edges: this.fullData.edges.filter(
        (e) => visibleIds.has(e.from) && visibleIds.has(e.to) && e.step <= step
      ),
      faces: this.fullData.faces.filter(
        (f) => f.step <= step && f.pointIds.every((id) => visibleIds.has(id))
      ),
      maxStep: this.fullData.maxStep,
      meta: this.fullData.meta,
    };
  }
}

export { applyConstructionPlan, buildConstructionPlan };
