import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { createParametricSphere } from "../engine/renderer/primitives.js";

/**
 * Measurement Mode: pick two sphere centers → distance, radius ratio, coordinates, midpoint.
 */
export class MeasurementMode {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   focusSystem: import('./FocusSystem.js').FocusSystem,
   *   cameraController: import('./CameraController.js').CameraController,
   *   designGroup: THREE.Group,
   *   parentGroup?: THREE.Object3D,
   *   domElement: HTMLElement,
   *   hudElement: HTMLElement,
   * }} opts
   */
  constructor({
    scene,
    focusSystem,
    cameraController,
    designGroup,
    parentGroup = null,
    domElement,
    hudElement,
  }) {
    this.scene = scene;
    this.focusSystem = focusSystem;
    this.cameraController = cameraController;
    this.designGroup = designGroup;
    this.parentGroup = parentGroup ?? designGroup;
    this.domElement = domElement;
    this.hud = hudElement;

    this.enabled = false;
    this.picks = [];
    this.overlay = new THREE.Group();
    this.overlay.name = "measurementOverlay";
    this.parentGroup.add(this.overlay);

    this.lineMat = new LineMaterial({
      color: 0xffe066,
      linewidth: 2.5,
      transparent: true,
      opacity: 0.95,
      worldUnits: false,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      dashed: false,
    });
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95 });
    this.midMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

    this._pointerDown = null;
    this._onPointerDown = (e) => {
      if (e.button !== 0) return;
      this._pointerDown = { x: e.clientX, y: e.clientY };
    };
    this._onPointerUp = (e) => this.#onPointerUp(e);
    domElement.addEventListener("pointerdown", this._onPointerDown);
    domElement.addEventListener("pointerup", this._onPointerUp);
    this.#renderHud(null);
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    this.focusSystem.setMeasurementBlocking(this.enabled);
    if (!this.enabled) this.clear();
    else this.focusSystem.clear({ restoreCamera: false });
    this.hud.hidden = !this.enabled;
    if (this.enabled) this.#renderHud({ waiting: true });
  }

  clear() {
    this.picks = [];
    this.#clearOverlay();
    if (this.enabled) this.#renderHud({ waiting: true });
    else this.#renderHud(null);
  }

  dispose() {
    this.domElement.removeEventListener("pointerdown", this._onPointerDown);
    this.domElement.removeEventListener("pointerup", this._onPointerUp);
    this.#clearOverlay();
    this.parentGroup.remove(this.overlay);
  }

  setResolution(w, h) {
    this.lineMat.resolution.set(w, h);
  }

  #clearOverlay() {
    while (this.overlay.children.length) {
      const c = this.overlay.children.pop();
      c.geometry?.dispose?.();
    }
  }

  #onPointerUp(event) {
    if (!this.enabled) return;
    if (event.target.closest?.("#panel")) return;
    if (!this._pointerDown) return;

    const dx = event.clientX - this._pointerDown.x;
    const dy = event.clientY - this._pointerDown.y;
    const dragged = dx * dx + dy * dy > 36;
    this._pointerDown = null;
    if (dragged) return;

    const hit = this.focusSystem.pickSphere(event);
    if (!hit) {
      this.clear();
      return;
    }

    const mesh = hit.object;
    const center = mesh.position.clone();
    const radius = mesh.userData.specRadius ?? mesh.geometry?.boundingSphere?.radius ?? 0.5;
    const pick = {
      pointId: mesh.userData.pointId,
      center,
      radius,
      index: mesh.userData.constructionIndex ?? 0,
    };

    if (this.picks.length >= 2) this.picks = [];
    if (this.picks.length === 1 && this.picks[0].pointId === pick.pointId) return;
    this.picks.push(pick);
    this.#rebuild();
  }

  #rebuild() {
    this.#clearOverlay();
    this.picks.forEach((p) => {
      const m = new THREE.Mesh(createParametricSphere(Math.max(p.radius * 0.07, 0.04), 12, 10), this.markerMat);
      m.position.copy(p.center);
      m.renderOrder = 50;
      this.overlay.add(m);
    });

    if (this.picks.length < 2) {
      this.#renderHud({ waiting: true, first: this.picks[0] ?? null });
      return;
    }

    const [a, b] = this.picks;
    const geo = new LineGeometry();
    geo.setPositions([a.center.x, a.center.y, a.center.z, b.center.x, b.center.y, b.center.z]);
    const line = new Line2(geo, this.lineMat);
    line.computeLineDistances();
    line.renderOrder = 51;
    this.overlay.add(line);

    const mid = a.center.clone().add(b.center).multiplyScalar(0.5);
    const midMesh = new THREE.Mesh(createParametricSphere(0.045, 10, 8), this.midMat);
    midMesh.position.copy(mid);
    midMesh.renderOrder = 52;
    this.overlay.add(midMesh);

    const distance = a.center.distanceTo(b.center);
    const radiusRatio = b.radius > 1e-9 ? a.radius / b.radius : Infinity;

    this.#renderHud({
      waiting: false,
      a,
      b,
      distance,
      radiusRatio,
      midpoint: mid,
    });
  }

  #fmt(n) {
    return Number(n).toFixed(4);
  }

  #fmtVec(v) {
    return `(${this.#fmt(v.x)}, ${this.#fmt(v.y)}, ${this.#fmt(v.z)})`;
  }

  #renderHud(data) {
    if (!this.hud) return;
    if (!data) {
      this.hud.innerHTML = "";
      return;
    }
    if (data.waiting) {
      this.hud.innerHTML = data.first
        ? `<div class="meas-title">Measurement</div>
           <p>First center locked. Click a second sphere center.</p>
           <p class="meas-mono">A ${this.#fmtVec(data.first.center)}</p>`
        : `<div class="meas-title">Measurement Mode</div>
           <p>Click two sphere centers to measure.</p>`;
      return;
    }

    this.hud.innerHTML = `
      <div class="meas-title">Measurement</div>
      <div class="meas-grid">
        <span>Distance</span><strong>${this.#fmt(data.distance)}</strong>
        <span>Radius ratio</span><strong>${this.#fmt(data.radiusRatio)}</strong>
        <span>Center A</span><strong class="meas-mono">${this.#fmtVec(data.a.center)}</strong>
        <span>Center B</span><strong class="meas-mono">${this.#fmtVec(data.b.center)}</strong>
        <span>Midpoint</span><strong class="meas-mono">${this.#fmtVec(data.midpoint)}</strong>
      </div>`;
  }
}
