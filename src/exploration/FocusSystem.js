import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { createParametricSphere } from "../engine/renderer/primitives.js";

/**
 * Click-to-focus spheres: highlight, outline, show center, orbit around selection.
 */
export class FocusSystem {
  /**
   * @param {{
   * scene: THREE.Scene,
   * cameraController: import('./CameraController.js').CameraController,
   * designGroup: THREE.Group,
   * parentGroup?: THREE.Object3D,
   * domElement: HTMLElement,
   * hudElement?: HTMLElement,
   * }} opts
   */
  constructor({
    scene,
    cameraController,
    designGroup,
    parentGroup = null,
    domElement,
    hudElement = null,
  }) {
    this.scene = scene;
    this.cameraController = cameraController;
    this.designGroup = designGroup;
    this.parentGroup = parentGroup ?? designGroup;
    this.domElement = domElement;
    this.hud = hudElement;
    this.enabled = true;
    this.measurementBlocks = false;
    /** When true, selection does not reframe the camera (color picking). */
    this.selectOnly = false;

    this.overlay = new THREE.Group();
    this.overlay.name = "focusOverlay";
    this.parentGroup.add(this.overlay);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.selected = null;

    this.outlineMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      wireframe: true,
      depthTest: true,
    });
    this.centerMat = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.95,
    });
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0x9ffff0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.BackSide,
    });

    this._pointerDown = null;
    this._onPointerDown = (e) => {
      if (e.button !== 0) return;
      this._pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    this._onPointerUp = (e) => this.#handlePointerUp(e);
    this._onKey = (e) => {
      if (e.key === "Escape") this.clear();
    };
    domElement.addEventListener("pointerdown", this._onPointerDown);
    domElement.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("keydown", this._onKey);
    this.#renderHud(null);
  }

  setMeasurementBlocking(blocked) {
    this.measurementBlocks = blocked;
  }

  setSelectOnly(enabled) {
    this.selectOnly = Boolean(enabled);
  }

  dispose() {
    this.domElement.removeEventListener("pointerdown", this._onPointerDown);
    this.domElement.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("keydown", this._onKey);
    this.clear({ restoreCamera: false });
    this.parentGroup.remove(this.overlay);
  }

  clear({ restoreCamera = true } = {}) {
    this.selected = null;
    this.#clearOverlay();
    if (restoreCamera) this.cameraController.clearFocus({ duration: 0.65 });
    this.#renderHud(null);
    this.onChange?.(null);
  }

  getSelected() {
    if (!this.selected) return null;
    return {
      id: this.selected.pointId ?? this.selected.mesh?.userData?.specId ?? null,
      mesh: this.selected.mesh ?? null,
    };
  }

  getSelection() {
    return this.selected;
  }

  #clearOverlay() {
    while (this.overlay.children.length) {
      const c = this.overlay.children.pop();
      c.geometry?.dispose?.();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.());
        else if (c.material !== this.outlineMat && c.material !== this.centerMat && c.material !== this.glowMat) {
          c.material.dispose?.();
        }
      }
    }
  }

  #collectSpheres() {
    const meshes = [];
    this.designGroup.traverse((obj) => {
      if (obj.isMesh && obj.userData?.kind === "sphere") meshes.push(obj);
    });
    return meshes;
  }

  pickSphere(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const cam = this.cameraController.getActiveCamera();
    this.raycaster.setFromCamera(this.pointer, cam);
    const hits = this.raycaster.intersectObjects(this.#collectSpheres(), false);
    return hits[0] ?? null;
  }

  #handlePointerUp(event) {
    if (!this.enabled || this.measurementBlocks) return;
    if (event.target.closest?.("#panel")) return;
    if (!this._pointerDown) return;

    const dx = event.clientX - this._pointerDown.x;
    const dy = event.clientY - this._pointerDown.y;
    const dragged = dx * dx + dy * dy > 36;
    this._pointerDown = null;
    if (dragged) return;

    const hit = this.pickSphere(event);
    if (!hit) {
      this.clear();
      return;
    }
    this.selectSphere(hit.object);
  }

  selectSphere(mesh) {
    const localCenter = mesh.position.clone();
    const worldCenter = new THREE.Vector3();
    mesh.getWorldPosition(worldCenter);
    const radius =
      mesh.userData.specRadius ??
      mesh.geometry?.boundingSphere?.radius ??
      mesh.userData.radius ??
      0.5;

    this.selected = {
      mesh,
      pointId: mesh.userData.pointId,
      center: localCenter.clone(),
      worldCenter: worldCenter.clone(),
      radius,
      colorHex: mesh.userData.colorHex,
      constructionIndex: mesh.userData.constructionIndex,
    };

    this.#rebuildOverlay();
    if (!this.selectOnly) {
      this.cameraController.focusOnPoint(worldCenter, { duration: 0.75 });
    }
    this.#renderHud(this.selected);
    this.onChange?.(this.selected);
  }

  #rebuildOverlay() {
    this.#clearOverlay();
    if (!this.selected) return;

    const { center, radius } = this.selected;
    const R = Math.max(radius, 0.05);

    const glow = new THREE.Mesh(createParametricSphere(R * 1.08, 20, 14), this.glowMat);
    glow.position.copy(center);
    glow.renderOrder = 40;
    this.overlay.add(glow);

    const outline = new THREE.Mesh(createParametricSphere(R * 1.02, 24, 16), this.outlineMat);
    outline.position.copy(center);
    outline.renderOrder = 41;
    this.overlay.add(outline);

    const marker = new THREE.Mesh(createParametricSphere(Math.max(R * 0.06, 0.035), 12, 10), this.centerMat);
    marker.position.copy(center);
    marker.renderOrder = 42;
    this.overlay.add(marker);

    const axisLen = R * 0.35;
    const axisMat = new LineMaterial({
      color: 0xffd166,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
      worldUnits: false,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });
    const addAxis = (a, b) => {
      const geo = new LineGeometry();
      geo.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
      const line = new Line2(geo, axisMat);
      line.computeLineDistances();
      line.renderOrder = 43;
      this.overlay.add(line);
    };
    addAxis(
      new THREE.Vector3(center.x - axisLen, center.y, center.z),
      new THREE.Vector3(center.x + axisLen, center.y, center.z)
    );
    addAxis(
      new THREE.Vector3(center.x, center.y - axisLen, center.z),
      new THREE.Vector3(center.x, center.y + axisLen, center.z)
    );
  }

  #fmt(n) {
    return Number(n).toFixed(4);
  }

  #renderHud(sel) {
    if (!this.hud) return;
    if (!sel) {
      this.hud.hidden = true;
      this.hud.innerHTML = "";
      return;
    }
    this.hud.hidden = false;
    const c = sel.center;
    this.hud.innerHTML = `
      <div class="meas-title">Focus</div>
      <div class="meas-grid">
        <span>Center</span><strong class="meas-mono">(${this.#fmt(c.x)}, ${this.#fmt(c.y)}, ${this.#fmt(c.z)})</strong>
        <span>Radius</span><strong class="meas-mono">${this.#fmt(sel.radius)}</strong>
        <span>Id</span><strong class="meas-mono">${sel.pointId ?? "—"}</strong>
      </div>
    `;
  }

  /** Keep orbit locked on the selected sphere and gently orbit around it. */
  update(dt) {
    if (!this.selected?.mesh || this.selectOnly) return;
    const world = new THREE.Vector3();
    this.selected.mesh.getWorldPosition(world);
    this.selected.worldCenter.copy(world);

    // Track construction motion without restarting the camera tween
    if (!this.cameraController._anim) {
      const offset = this.cameraController.camera.position
        .clone()
        .sub(this.cameraController.controls.target);
      this.cameraController.controls.target.copy(world);
      this.cameraController.camera.position.copy(world).add(offset);
      this.cameraController.focusPoint.copy(world);
    }

    this.cameraController.nudgeOrbit(dt * 0.18);
  }

  setResolution(width, height) {
    this.overlay.traverse((obj) => {
      if (obj.material?.resolution) obj.material.resolution.set(width, height);
    });
  }
}
