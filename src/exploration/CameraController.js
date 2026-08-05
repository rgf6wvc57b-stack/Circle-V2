import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  DEFAULT_FIT_MARGIN,
  FIT_DISTANCE_SCALE,
  MIN_FRAMING_SIZE,
  MIN_CAMERA_DISTANCE,
  DEFAULT_FRAME_DIRECTION,
} from "./framingDefaults.js";

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Professional camera controller: perspective/orthographic, animated presets,
 * and auto-framing with margin. Target stays on the geometric center (or focus).
 */
export class CameraController {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   domElement: HTMLElement,
   *   aspect: number,
   * }} opts
   */
  constructor({ scene, domElement, aspect }) {
    this.scene = scene;
    this.domElement = domElement;

    this.perspective = new THREE.PerspectiveCamera(50, aspect, 0.05, 500);
    this.perspective.position.set(0, 0.8, MIN_CAMERA_DISTANCE);

    this.orthographic = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.05, 500);
    this.orthographic.position.set(0, 0.8, MIN_CAMERA_DISTANCE);
    this.orthoSize = 6;

    this.mode = "perspective";
    this.camera = this.perspective;

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 80;
    this.controls.target.set(0, 0, 0);

    /** Geometric center of active construction */
    this.constructionCenter = new THREE.Vector3(0, 0, 0);
    /** Current orbit focus (construction center or selected sphere) */
    this.focusPoint = new THREE.Vector3(0, 0, 0);

    /** @type {{ fullWidth: number, fullHeight: number, available: { x: number, y: number, width: number, height: number } } | null} */
    this._viewLayout = null;
    /** Aspect used for fit-to-object (available rect, not full window). */
    this._fitAspect = aspect;

    this._anim = null;
  }

  getActiveCamera() {
    return this.camera;
  }

  getControls() {
    return this.controls;
  }

  /** Current or in-flight orbit distance (animation end state when settling). */
  getOrbitDistance() {
    if (this._anim) {
      return this._anim.toPos.distanceTo(this._anim.toTarget);
    }
    return this.camera.position.distanceTo(this.controls.target);
  }

  getOrbitTarget(target = new THREE.Vector3()) {
    if (this._anim) return target.copy(this._anim.toTarget);
    return target.copy(this.controls.target);
  }

  setAspect(aspect) {
    this._fitAspect = aspect;
    this.perspective.aspect = aspect;
    this.#applyViewOffsetMatrices();
    this.#updateOrthoFrustum(aspect);
  }

  /**
   * Align projection with the unobstructed canvas rectangle.
   * Shifts screen-space framing toward the available center without moving
   * world geometry or the orbit target.
   *
   * @param {{
   *   fullWidth: number,
   *   fullHeight: number,
   *   x: number,
   *   y: number,
   *   width: number,
   *   height: number,
   * }} rect
   */
  setAvailableViewRect(rect) {
    const fullWidth = Math.max(1, rect.fullWidth || rect.width || 1);
    const fullHeight = Math.max(1, rect.fullHeight || rect.height || 1);
    const avail = {
      x: rect.x ?? 0,
      y: rect.y ?? 0,
      width: Math.max(1, rect.width || fullWidth),
      height: Math.max(1, rect.height || fullHeight),
    };
    this._viewLayout = { fullWidth, fullHeight, available: avail };
    this._fitAspect = avail.width / avail.height;
    this.perspective.aspect = this._fitAspect;
    this.#applyViewOffsetMatrices();
    this.#updateOrthoFrustum(this._fitAspect);
  }

  /** Clear panel compensation — full viewport framing. */
  clearAvailableViewRect(fullWidth, fullHeight) {
    const w = Math.max(1, fullWidth || 1);
    const h = Math.max(1, fullHeight || 1);
    this._viewLayout = {
      fullWidth: w,
      fullHeight: h,
      available: { x: 0, y: 0, width: w, height: h },
    };
    this._fitAspect = w / h;
    this.perspective.aspect = this._fitAspect;
    this.perspective.clearViewOffset();
    this.orthographic.clearViewOffset();
    this.perspective.updateProjectionMatrix();
    this.#updateOrthoFrustum(this._fitAspect);
  }

  #applyViewOffsetMatrices() {
    const layout = this._viewLayout;
    if (!layout) {
      this.perspective.updateProjectionMatrix();
      return;
    }
    const { fullWidth, fullHeight, available: avail } = layout;
    // Shift optical center from full-viewport center to available-rect center.
    const shiftX = avail.x + avail.width / 2 - fullWidth / 2;
    const shiftY = avail.y + avail.height / 2 - fullHeight / 2;

    if (Math.abs(shiftX) < 0.5 && Math.abs(shiftY) < 0.5) {
      this.perspective.clearViewOffset();
      this.orthographic.clearViewOffset();
    } else {
      // Negate so positive available-center offset moves content toward that side.
      this.perspective.setViewOffset(
        fullWidth,
        fullHeight,
        -shiftX,
        -shiftY,
        fullWidth,
        fullHeight
      );
      this.orthographic.setViewOffset(
        fullWidth,
        fullHeight,
        -shiftX,
        -shiftY,
        fullWidth,
        fullHeight
      );
    }
    this.perspective.aspect = this._fitAspect;
    this.perspective.updateProjectionMatrix();
    this.orthographic.updateProjectionMatrix();
  }

  #updateOrthoFrustum(aspect = this._fitAspect || this.perspective.aspect) {
    const s = this.orthoSize;
    this.orthographic.left = -s * aspect;
    this.orthographic.right = s * aspect;
    this.orthographic.top = s;
    this.orthographic.bottom = -s;
    this.orthographic.updateProjectionMatrix();
  }

  setProjection(mode, { animate = true, duration = 0.7 } = {}) {
    if (mode !== "perspective" && mode !== "orthographic") return;
    if (mode === this.mode) return;

    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const fromOrtho = this.orthoSize;

    this.mode = mode;
    this.camera = mode === "perspective" ? this.perspective : this.orthographic;
    this.controls.object = this.camera;
    this.camera.position.copy(fromPos);
    this.controls.target.copy(fromTarget);
    this.controls.update();

    if (!animate) {
      this.#syncOrthoFromDistance();
      return;
    }

    // Soft settle after swap
    this.#animateTo({
      position: fromPos,
      target: fromTarget,
      orthoSize: fromOrtho,
      duration: Math.min(duration, 0.45),
    });
  }

  setConstructionCenter(center) {
    this.constructionCenter.copy(center);
  }

  /**
   * Frame a bounding box with a generous margin against the usable (panel-aware) aspect.
   * Orbit target stays on the geometric center — geometry is never translated.
   *
   * @param {THREE.Box3} box
   * @param {{
   *   margin?: number,
   *   duration?: number,
   *   direction?: THREE.Vector3,
   *   animate?: boolean,
   *   expandOnly?: boolean,
   *   minDistance?: number,
   *   fitAvailableHeight?: boolean,
   *   minFramingSize?: number,
   *   useBoundingSphere?: boolean,
   *   distanceScale?: number,
   * }} opts
   *   expandOnly — zoom out if the content would clip; never zoom in (construction/evolution).
   *   fitAvailableHeight — scale distance so on-screen size matches the usable
   *     band when a view-offset shortens the visible height (mobile sheet).
   *   useBoundingSphere — fit the box diagonal (3D extent) instead of the longest edge.
   */
  frameBox(
    box,
    {
      margin = DEFAULT_FIT_MARGIN,
      duration = 0.75,
      direction = null,
      animate = true,
      expandOnly = false,
      minDistance = MIN_CAMERA_DISTANCE,
      fitAvailableHeight = false,
      minFramingSize = MIN_FRAMING_SIZE,
      useBoundingSphere = false,
      distanceScale = FIT_DISTANCE_SCALE,
    } = {}
  ) {
    if (!box || box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.constructionCenter.copy(center);
    this.focusPoint.copy(center);

    const extentFloor = Math.max(0, Number(minFramingSize) || 0);
    const maxDim = useBoundingSphere
      ? Math.max(size.length(), extentFloor)
      : Math.max(size.x, size.y, size.z, extentFloor);
    const padded = maxDim * (1 + margin * 2);
    const distanceFloor =
      minDistance != null && Number.isFinite(minDistance)
        ? Math.max(0, minDistance)
        : MIN_CAMERA_DISTANCE;

    const dir = (
      direction ??
      new THREE.Vector3(
        DEFAULT_FRAME_DIRECTION.x,
        DEFAULT_FRAME_DIRECTION.y,
        DEFAULT_FRAME_DIRECTION.z
      )
    )
      .clone()
      .normalize();

    const fitAspect = this._fitAspect || this.perspective.aspect || 1;

    let distance;
    let nextOrtho = this.orthoSize;
    if (this.mode === "perspective") {
      const fov = (this.perspective.fov * Math.PI) / 180;
      const fitH = padded / (2 * Math.tan(fov / 2));
      const fitW = padded / (2 * Math.tan(fov / 2) * fitAspect);
      distance = Math.max(fitH, fitW) * distanceScale;
      // View-offset keeps full vertical FOV while framing uses the shorter
      // available band — scale distance so object size tracks that band.
      if (fitAvailableHeight && this._viewLayout) {
        const fullH = this._viewLayout.fullHeight || 1;
        const availH = this._viewLayout.available?.height || fullH;
        if (availH > 0 && fullH > availH * 1.05) {
          distance *= fullH / availH;
        }
      }
    } else {
      nextOrtho = (padded / 2) * distanceScale;
      distance = Math.max(padded * 1.2, distanceFloor);
    }
    distance = Math.max(distance, distanceFloor);

    if (expandOnly) {
      const currentDist = this.camera.position.distanceTo(this.controls.target);
      if (distance <= currentDist * 1.02 && this.mode === "perspective") {
        // Content still fits — keep calm framing; only retarget to center if needed.
        if (this.controls.target.distanceToSquared(center) > 1e-6) {
          this.focusOnPoint(center, { duration: animate ? Math.min(duration, 0.45) : 0 });
        }
        return;
      }
      if (this.mode === "orthographic" && nextOrtho <= this.orthoSize * 1.02) {
        if (this.controls.target.distanceToSquared(center) > 1e-6) {
          this.focusOnPoint(center, { duration: animate ? Math.min(duration, 0.45) : 0 });
        }
        return;
      }
    }

    if (this.mode === "orthographic") {
      this.orthoSize = nextOrtho;
      this.#updateOrthoFrustum(fitAspect);
    }

    const position = center.clone().addScaledVector(dir, distance);
    this.#animateTo({
      position,
      target: center,
      orthoSize: this.orthoSize,
      duration: animate ? duration : 0,
    });
  }

  /**
   * Smoothly move orbit target to a focus point (selected sphere), keeping distance.
   */
  focusOnPoint(point, { duration = 0.7, orbitDistance = null } = {}) {
    this.focusPoint.copy(point);
    const currentDist =
      orbitDistance ?? this.camera.position.distanceTo(this.controls.target);
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-8) dir.set(0.35, 0.28, 1);
    dir.normalize();
    const position = point.clone().addScaledVector(dir, currentDist);
    this.#animateTo({ position, target: point.clone(), orthoSize: this.orthoSize, duration });
  }

  clearFocus({ duration = 0.7 } = {}) {
    this.focusPoint.copy(this.constructionCenter);
    const dist = this.camera.position.distanceTo(this.controls.target);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const position = this.constructionCenter.clone().addScaledVector(dir, dist);
    this.#animateTo({
      position,
      target: this.constructionCenter.clone(),
      orthoSize: this.orthoSize,
      duration,
    });
  }

  /**
   * Slow azimuthal orbit around the current focus point (used while a sphere is selected).
   * Skipped while a camera animation is running.
   */
  nudgeOrbit(radians) {
    if (this._anim || !radians) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
    this.camera.position.copy(this.controls.target).add(offset);
  }

  goToPreset(
    name,
    {
      duration = 0.8,
      box = null,
      margin = DEFAULT_FIT_MARGIN,
      minDistance = MIN_CAMERA_DISTANCE,
      minFramingSize = MIN_FRAMING_SIZE,
      useBoundingSphere = false,
      distanceScale = FIT_DISTANCE_SCALE,
    } = {}
  ) {
    const center =
      box && !box.isEmpty() ? box.getCenter(new THREE.Vector3()) : this.focusPoint.clone();
    if (box && !box.isEmpty()) {
      this.constructionCenter.copy(center);
      this.focusPoint.copy(center);
    }
    let dist = this.camera.position.distanceTo(this.controls.target);
    if (box && !box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const extentFloor = Math.max(0, Number(minFramingSize) || 0);
      const maxDim = useBoundingSphere
        ? Math.max(size.length(), extentFloor)
        : Math.max(size.x, size.y, size.z, extentFloor);
      const padded = maxDim * (1 + margin * 2);
      const distanceFloor =
        minDistance != null && Number.isFinite(minDistance)
          ? Math.max(0, minDistance)
          : MIN_CAMERA_DISTANCE;
      if (this.mode === "perspective") {
        const fov = (this.perspective.fov * Math.PI) / 180;
        const fitAspect = this._fitAspect || this.perspective.aspect || 1;
        const fitH = padded / (2 * Math.tan(fov / 2));
        const fitW = padded / (2 * Math.tan(fov / 2) * fitAspect);
        dist = Math.max(fitH, fitW) * distanceScale;
      } else {
        this.orthoSize = (padded / 2) * distanceScale;
        this.#updateOrthoFrustum();
        dist = Math.max(padded * 1.2, distanceFloor);
      }
      dist = Math.max(dist, distanceFloor);
    }

    const dirs = {
      isometric: new THREE.Vector3(1, 1, 1),
      perspective: new THREE.Vector3(1, 0.85, 1.15),
      front: new THREE.Vector3(0, 0, 1),
      back: new THREE.Vector3(0, 0, -1),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      side: new THREE.Vector3(1, 0.08, 0),
      top: new THREE.Vector3(0, 1, 0.0001),
      bottom: new THREE.Vector3(0, -1, 0.0001),
      reset: new THREE.Vector3(
        DEFAULT_FRAME_DIRECTION.x,
        DEFAULT_FRAME_DIRECTION.y,
        DEFAULT_FRAME_DIRECTION.z
      ),
    };
    const dir = (dirs[name] ?? dirs.reset).clone().normalize();
    const position = center.clone().addScaledVector(dir, dist);
    this.#animateTo({ position, target: center, orthoSize: this.orthoSize, duration });
  }

  #syncOrthoFromDistance() {
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.orthoSize = Math.max(0.5, dist * 0.45);
    this.#updateOrthoFrustum();
  }

  #animateTo({ position, target, orthoSize, duration }) {
    if (duration <= 0) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.orthoSize = orthoSize;
      this.#updateOrthoFrustum();
      this.controls.update();
      this._anim = null;
      return;
    }

    this._anim = {
      t: 0,
      duration: THREE.MathUtils.clamp(duration, 0.5, 1.0),
      fromPos: this.camera.position.clone(),
      toPos: position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      fromOrtho: this.orthoSize,
      toOrtho: orthoSize,
    };
  }

  update(dt) {
    if (this._anim) {
      this._anim.t += dt;
      const u = easeInOutCubic(Math.min(1, this._anim.t / this._anim.duration));
      this.camera.position.lerpVectors(this._anim.fromPos, this._anim.toPos, u);
      this.controls.target.lerpVectors(this._anim.fromTarget, this._anim.toTarget, u);
      this.orthoSize = THREE.MathUtils.lerp(this._anim.fromOrtho, this._anim.toOrtho, u);
      this.#updateOrthoFrustum();
      if (u >= 1) this._anim = null;
    }
    this.controls.update();
  }
}
