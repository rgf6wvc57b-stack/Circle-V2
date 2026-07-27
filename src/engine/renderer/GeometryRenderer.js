import * as THREE from "three";
import { pointMap } from "../schema.js";
import { colorForSphere, PALETTES } from "./palettes.js";
import {
  createCircleArcTubeXY,
  createParametricSphere,
  createTubeBetween,
} from "./primitives.js";
import {
  COLOR_MODE,
  materialFlagsForOpacity,
  resolveSphereColor,
} from "../../app/sphereColorState.js";
import {
  DEFAULT_RENDER_LAYER_STYLES,
  getRenderLayerStyle,
} from "../../app/renderLayerStyles.js";
import {
  DEFAULT_ACTIVE_RENDER_LAYERS,
  RENDER_LAYERS,
  RENDER_LAYER_DRAW_ORDER,
  isUiRenderMode,
  layersFromLegacyMode,
  legacyModeFromLayers,
  normalizeRenderLayers,
} from "./uiRenderModes.js";

export const RENDER_MODES = Object.freeze({
  constructionPlane: "constructionPlane",
  spheres: "spheres",
  circles: "circles",
  points: "points",
  lines: "lines",
  mixed: "mixed",
  /** Traditional Tree diagram: Sephirot circles + 22 path tubes in-plane. */
  traditionalTreeOfLife: "traditionalTreeOfLife",
  /** Geometric Tree: traditional graph + construction scaffold overlays. */
  geometricTreeOfLife: "geometricTreeOfLife",
});

export { RENDER_LAYERS, RENDER_LAYER_DRAW_ORDER, DEFAULT_ACTIVE_RENDER_LAYERS };

const SPECIALTY_MODES = new Set([
  RENDER_MODES.constructionPlane,
  RENDER_MODES.traditionalTreeOfLife,
  RENDER_MODES.geometricTreeOfLife,
]);

/**
 * Sphere blending strategies tested for watercolor / stained-glass overlaps.
 * Final selection is recorded on GeometryRenderer.SELECTED_SPHERE_BLENDING.
 */
export const SPHERE_BLEND_MODES = Object.freeze({
  additive: "additive",
  custom: "custom",
});

/** Chosen after visual comparison: CustomBlending (SrcAlpha + One) — luminous stained-glass mixes without washing out as fast as full Additive. */
export const SELECTED_SPHERE_BLENDING = SPHERE_BLEND_MODES.custom;

/**
 * Renderer — draws the same mathematical construction data in different ways.
 * Changing mode / appearance never recalculates generator math.
 */
export class GeometryRenderer {
  /**
   * @param {THREE.Group} group
   */
  constructor(group) {
    this.group = group;
    /** @type {import('../schema.js').ConstructionData | null} */
    this.data = null;
    /** @type {Set<string>} order-independent active presentation layers */
    this.activeLayers = new Set(DEFAULT_ACTIVE_RENDER_LAYERS);
    /** Legacy single-mode label derived from layers (or specialty mode id). */
    this.mode = RENDER_MODES.spheres;
    /** @type {string | null} specialty path; null = layer composition */
    this.specialtyMode = null;
    this.appearance = {
      color: 0xffd84d,
      secondaryColor: 0xffd84d,
      transparency: 0,
      wireframe: false,
      material: "standard",
      palette: "watercolor",
      colorIntensity: 1,
      blendStrength: 1,
      /** Multiplier for connection-path tube radius (1 = default). */
      pathThickness: 1,
      /** @type {string} */
      sphereBlending: SELECTED_SPHERE_BLENDING,
      /** @type {import('../../app/sphereColorState.js').createSphereColorState extends Function ? ReturnType<typeof import('../../app/sphereColorState.js').createSphereColorState> : object | null} */
      sphereColors: null,
      /** @type {ReturnType<typeof import('../../app/renderLayerStyles.js').createRenderLayerStyles> | null} */
      renderLayerStyles: null,
    };
    this.drawProgress = new Map();
    this.activeId = null;
    this.glowPhase = 0;
    /** @type {THREE.Material | null} Shared material for global solid color mode */
    this._sharedSphereMaterial = null;
    this.selectedSphereId = null;
  }

  setData(data) {
    this.data = data;
    this.redraw();
  }

  /**
   * Legacy single-mode API — maps to independent layers (or a specialty path).
   * Prefer setActiveLayers for new code.
   */
  setMode(mode) {
    if (SPECIALTY_MODES.has(mode)) {
      this.specialtyMode = mode;
      this.mode = mode;
      this.redraw();
      return;
    }
    if (!isUiRenderMode(mode) && !Object.values(RENDER_MODES).includes(mode)) {
      throw new Error(`Unknown render mode: ${mode}`);
    }
    this.specialtyMode = null;
    this.activeLayers = new Set(layersFromLegacyMode(mode));
    this.mode = legacyModeFromLayers(this.activeLayers);
    this.redraw();
  }

  /**
   * Set independent render layers. Selection order does not affect draw order.
   * @param {Iterable<string> | string} layers
   */
  setActiveLayers(layers) {
    this.specialtyMode = null;
    this.activeLayers = new Set(normalizeRenderLayers(layers, []));
    this.mode = legacyModeFromLayers(this.activeLayers);
    this.redraw();
  }

  /** @returns {string[]} layers in stable draw-order (only active ones) */
  getActiveLayers() {
    return RENDER_LAYER_DRAW_ORDER.filter((id) => this.activeLayers.has(id));
  }

  setAppearance(partial) {
    Object.assign(this.appearance, partial);
    this.redraw();
  }

  /**
   * Update sphere materials in place — no geometry rebuild, no center moves.
   * @param {object} [partial] appearance patch (typically sphereColors)
   */
  updateSphereColors(partial = {}) {
    Object.assign(this.appearance, partial);
    this.#patchSphereMaterials();
  }

  /**
   * Update layer colors/opacity in place. Thickness/size changes need redraw().
   * @param {object} [partial]
   */
  updateLayerStyles(partial = {}) {
    Object.assign(this.appearance, partial);
    this.#patchSphereMaterials();
    this.#patchNonSphereLayerMaterials();
  }

  #layerStyle(layerId) {
    return getRenderLayerStyle(
      this.appearance.renderLayerStyles || DEFAULT_RENDER_LAYER_STYLES,
      layerId
    );
  }

  #patchSphereMaterials() {
    this._sharedSphereMaterial = null;
    let index = 0;
    this.group.traverse((obj) => {
      if (!obj.isMesh || obj.userData?.kind !== "sphere") return;
      const specId = obj.userData.specId;
      const pointId = obj.userData.pointId;
      const resolved = this.#resolveColor(specId, pointId, index);
      const mat = this.createSphereMaterial(resolved.hex, {
        glow: this.activeId === pointId || this.activeId === specId,
        opacity: resolved.opacity,
        selected: this.selectedSphereId === pointId || this.selectedSphereId === specId,
      });
      if (obj.material && obj.material !== this._sharedSphereMaterial) {
        obj.material.dispose?.();
      }
      obj.material = mat;
      obj.userData.colorHex = resolved.hexNumber;
      obj.userData.opacity = resolved.opacity;
      obj.renderOrder = 100 + index;
      index += 1;
    });
  }

  #patchNonSphereLayerMaterials() {
    const circle = this.#layerStyle("circles");
    const point = this.#layerStyle("points");
    const connection = this.#layerStyle("connections");
    this.group.traverse((obj) => {
      if (!obj.isMesh) return;
      const kind = obj.userData?.kind;
      let style = null;
      if (kind === "circle") style = circle;
      else if (kind === "point") style = point;
      else if (kind === "line") style = connection;
      else return;

      const hex = style.color;
      const opacity = style.opacity;
      const mat = this.createMaterial(hex, opacity);
      if (kind === "line" && mat) {
        mat.depthWrite = opacity >= 0.99;
      }
      if (obj.material) obj.material.dispose?.();
      obj.material = mat;
      obj.userData.colorHex = new THREE.Color(hex).getHex();
      obj.userData.opacity = opacity;
    });
  }

  setSelectedSphereId(id) {
    this.selectedSphereId = id;
    this.updateSphereColors();
  }

  setDrawProgress(id, progress) {
    this.drawProgress.set(id, progress);
  }

  clearDrawProgress() {
    this.drawProgress.clear();
  }

  setActiveId(id) {
    this.activeId = id;
  }

  setGlowPhase(phase) {
    this.glowPhase = phase;
    this.group.traverse((obj) => {
      if (obj.userData?.glowing && obj.material?.emissiveIntensity != null) {
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(phase * 6));
        obj.material.emissiveIntensity = pulse;
      }
    });
  }

  disposeGroup() {
    this._sharedSphereMaterial = null;
    while (this.group.children.length) {
      const child = this.group.children.pop();
      child.traverse((obj) => {
        if (obj.isMesh || obj.isLineSegments || obj.isPoints) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose();
        }
      });
    }
  }

  #resolveColor(specId, pointId, index) {
    const colors = this.appearance.sphereColors;
    const layer = this.#layerStyle("spheres");
    if (colors) {
      const key = specId || pointId;
      const resolved = resolveSphereColor(colors, key, index);
      // Also try pointId / specId aliases
      const byPoint = colors.bySphereId?.[pointId];
      const bySpec = colors.bySphereId?.[specId];
      let hex = resolved.hex;
      let opacity = resolved.opacity;
      if (colors.mode === COLOR_MODE.INDIVIDUAL) {
        if (bySpec) {
          hex = bySpec.hex;
          opacity = bySpec.opacity;
        } else if (byPoint) {
          hex = byPoint.hex;
          opacity = byPoint.opacity;
        } else {
          // No individual override — use layer / global sphere style.
          hex = colors.global?.hex || layer.color;
          opacity = colors.global?.opacity ?? layer.opacity;
        }
      } else {
        // Global mode: prefer sphereColors.global (kept in sync with layer styles).
        hex = colors.global?.hex || layer.color;
        opacity = colors.global?.opacity ?? layer.opacity;
      }
      const color = new THREE.Color(hex);
      return {
        hex,
        hexNumber: color.getHex(),
        opacity,
        color,
      };
    }
    if (this.appearance.renderLayerStyles) {
      const color = new THREE.Color(layer.color);
      return {
        hex: layer.color,
        hexNumber: color.getHex(),
        opacity: layer.opacity,
        color,
      };
    }
    const hexNumber = this.#sphereHex(index);
    const legacyT = this.appearance.transparency ?? 0;
    const opacity = Math.max(0.08, 1 - legacyT);
    return {
      hex: `#${hexNumber.toString(16).padStart(6, "0")}`,
      hexNumber,
      opacity,
      color: new THREE.Color(hexNumber),
    };
  }

  /**
   * Sphere material — solid opaque when opacity is 100%; transparent otherwise.
   * Does not force watercolor blending when Solid is selected.
   */
  createSphereMaterial(hexColor, { glow = false, opacity = null, selected = false } = {}) {
    const intensity = this.appearance.colorIntensity ?? 1;
    const blend = Math.max(0.15, this.appearance.blendStrength ?? 1);
    const color =
      typeof hexColor === "string" || typeof hexColor === "number"
        ? new THREE.Color(hexColor)
        : hexColor.clone();

    let opacityValue = opacity;
    if (opacityValue == null) {
      const transparency = this.appearance.transparency ?? 0;
      opacityValue = Math.max(0, 1 - transparency);
    }

    const flags = materialFlagsForOpacity(opacityValue);
    const colors = this.appearance.sphereColors;
    const canShare =
      colors?.mode === COLOR_MODE.GLOBAL &&
      flags.solid &&
      !glow &&
      !selected &&
      !this.appearance.wireframe;

    if (canShare && this._sharedSphereMaterial) {
      this._sharedSphereMaterial.color.copy(color);
      return this._sharedSphereMaterial;
    }

    let mat;
    if (flags.solid) {
      // Fully opaque — preserve lighting/shading; no watercolor transmission
      mat = new THREE.MeshStandardMaterial({
        color,
        transparent: false,
        opacity: 1,
        roughness: 0.36,
        metalness: 0.22,
        wireframe: this.appearance.wireframe,
        side: THREE.FrontSide,
        depthWrite: true,
        toneMapped: true,
      });
      mat.blending = THREE.NormalBlending;
    } else {
      const transmission = THREE.MathUtils.clamp(
        0.2 + 0.35 * blend * (1 - flags.opacity),
        0.05,
        0.7
      );
      mat = new THREE.MeshPhysicalMaterial({
        color,
        transparent: true,
        opacity: flags.opacity,
        roughness: 0.18,
        metalness: 0.0,
        transmission,
        thickness: 0.55,
        ior: 1.25,
        clearcoat: 0.15,
        clearcoatRoughness: 0.4,
        specularIntensity: 0.3,
        wireframe: this.appearance.wireframe,
        side: THREE.DoubleSide,
        depthWrite: false,
        premultipliedAlpha: true,
        toneMapped: true,
      });
      this.#applySphereBlending(mat);
    }

    if (selected) {
      mat.emissive = color.clone().multiplyScalar(0.35);
      mat.emissiveIntensity = 0.55;
    } else if (glow) {
      mat.emissive = color.clone().multiplyScalar(0.85);
      mat.emissiveIntensity = 0.55 + 0.35 * intensity;
    } else if (!flags.solid) {
      mat.emissive = color.clone().multiplyScalar(0.12 * intensity * blend);
      mat.emissiveIntensity = 0.15 + 0.2 * blend;
    } else {
      mat.emissive = new THREE.Color(0x000000);
      mat.emissiveIntensity = 0;
    }

    if (canShare) {
      this._sharedSphereMaterial = mat;
    }
    return mat;
  }

  #applySphereBlending(mat) {
    const mode = this.appearance.sphereBlending ?? SELECTED_SPHERE_BLENDING;
    if (mode === SPHERE_BLEND_MODES.additive) {
      mat.blending = THREE.AdditiveBlending;
      return;
    }
    // CustomBlending: SrcAlpha → One  (alpha-weighted additive)
    // Overlaps accumulate light/color like layered stained glass / wet watercolor.
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation;
    mat.blendSrc = THREE.SrcAlphaFactor;
    mat.blendDst = THREE.OneFactor;
    mat.blendEquationAlpha = THREE.AddEquation;
    mat.blendSrcAlpha = THREE.OneFactor;
    mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }

  createMaterial(color, opacityOverride = null, { emissive = null, emissiveIntensity = 0 } = {}) {
    const opacity =
      opacityOverride != null
        ? opacityOverride
        : Math.max(0.08, 1 - this.appearance.transparency);
    const transparent = opacity < 0.999;
    const common = {
      color,
      transparent,
      opacity,
      wireframe: this.appearance.wireframe,
      side: THREE.DoubleSide,
      depthWrite: !transparent,
    };

    let mat;
    switch (this.appearance.material) {
      case "phong":
        mat = new THREE.MeshPhongMaterial({ ...common, shininess: 80, specular: 0xffffff });
        break;
      case "lambert":
        mat = new THREE.MeshLambertMaterial(common);
        break;
      case "physical":
        mat = new THREE.MeshPhysicalMaterial({
          ...common,
          metalness: 0.12,
          roughness: 0.28,
          transmission: transparent ? 0.4 : 0,
          thickness: 0.55,
          clearcoat: 0.35,
        });
        break;
      case "basic":
        mat = new THREE.MeshBasicMaterial(common);
        break;
      case "normal":
        mat = new THREE.MeshNormalMaterial({
          transparent,
          opacity,
          wireframe: this.appearance.wireframe,
          side: THREE.DoubleSide,
          depthWrite: !transparent,
        });
        break;
      case "standard":
      default:
        mat = new THREE.MeshStandardMaterial({
          ...common,
          metalness: 0.22,
          roughness: 0.36,
        });
        break;
    }

    if (emissive != null && mat.emissive) {
      mat.emissive = new THREE.Color(emissive);
      mat.emissiveIntensity = emissiveIntensity;
    }
    return mat;
  }

  #sphereHex(index) {
    return colorForSphere(
      this.appearance.palette ?? "watercolor",
      index,
      this.appearance.colorIntensity ?? 1
    );
  }

  redraw() {
    this.disposeGroup();
    if (!this.data) return;

    const specialty = this.specialtyMode || (SPECIALTY_MODES.has(this.mode) ? this.mode : null);
    if (specialty === RENDER_MODES.constructionPlane) {
      this.#renderConstructionPlaneMode();
      return;
    }

    if (specialty === RENDER_MODES.traditionalTreeOfLife) {
      this.#renderTraditionalTreeOfLife();
      return;
    }

    if (specialty === RENDER_MODES.geometricTreeOfLife) {
      this.#renderGeometricTreeOfLife();
      return;
    }

    // Stable draw order — independent of selection order (requirement 29–30).
    const points = pointMap(this.data);
    if (this.activeLayers.has(RENDER_LAYERS.spheres)) this.#renderSpheres(points);
    if (this.activeLayers.has(RENDER_LAYERS.circles)) this.#renderCircles(points);
    if (this.activeLayers.has(RENDER_LAYERS.connections)) this.#renderLines(points);
    if (this.activeLayers.has(RENDER_LAYERS.points)) this.#renderPointMarkers(points);
  }

  /**
   * Traditional Kabbalistic diagram: planar circles + all 22 connecting paths.
   */
  #renderTraditionalTreeOfLife() {
    const points = pointMap(this.data);
    this.#renderCircles(points, { sephirotOnly: true });
    this.#renderLines(points, { thicknessScale: 0.85, treePathsOnly: true });
  }

  /**
   * Geometric Tree — traditional 10+22 graph with optional construction scaffold.
   */
  #renderGeometricTreeOfLife() {
    const points = pointMap(this.data);
    const flags = this.data.meta?.geometricFlags ?? {
      showTree: true,
      showConstructionGeometry: true,
      showFlowerOverlay: false,
      showIntersections: true,
      showSymmetryAxes: true,
    };

    if (flags.showTree || flags.showConstructionGeometry) {
      this.#renderSpheres(points, {
        includeRoles: flags.showConstructionGeometry
          ? ["sephirah", "construction"]
          : ["sephirah"],
      });
    }
    if (flags.showTree || flags.showConstructionGeometry || flags.showFlowerOverlay) {
      this.#renderCircles(points, {
        includeRoles: [
          ...(flags.showTree ? ["sephirah"] : []),
          ...(flags.showConstructionGeometry ? ["construction"] : []),
          ...(flags.showFlowerOverlay ? ["flowerOverlay"] : []),
        ],
      });
    }
    if (flags.showIntersections) {
      this.#renderPointMarkers(points, {
        radiusScale: 0.035,
        color: 0xe8b4a0,
        roleFilter: "intersection",
      });
    }
    this.#renderLines(points, {
      thicknessScale: 1.2,
      treePathsOnly: !flags.showSymmetryAxes,
      includeSymmetryAxes: flags.showSymmetryAxes,
      includeTreePaths: flags.showTree !== false,
    });
  }

  #renderConstructionPlaneMode() {
    const points = pointMap(this.data);
    const r = this.data.radius;
    // Mathematical XY construction plane remains conceptual (centers already
    // lie in that plane). Do NOT render a filled / translucent plane or grid
    // sheet — it sliced through Flower of Life and other constructions.
    // Optional filled plane lives only behind the Display overlay toggle
    // (off by default) in DisplayOverlays — never forced by Construction Mode.

    this.#renderPointMarkers(points, { radiusScale: 0.055, color: 0xf0a35e });

    this.data.sphereCenters.forEach((spec, index) => {
      const p = points.get(spec.pointId);
      if (!p) return;

      const isActive =
        this.activeId === spec.pointId ||
        this.activeId === spec.id ||
        this.activeId === `circle-${spec.pointId}`;

      const compassProgress =
        this.drawProgress.get(spec.id) ??
        this.drawProgress.get(`circle-${spec.pointId}`) ??
        this.drawProgress.get(spec.pointId);

      const sphereReady = compassProgress == null || compassProgress > 0;
      if (!sphereReady) return;

      const glow = isActive && compassProgress != null && compassProgress < 1;
      const resolved = this.#resolveColor(spec.id, p.id, index);
      const selected =
        this.selectedSphereId === p.id || this.selectedSphereId === spec.id;
      const mat = this.createSphereMaterial(resolved.hex, {
        glow,
        opacity: resolved.opacity,
        selected,
      });
      const mesh = new THREE.Mesh(createParametricSphere(spec.radius, 36, 24), mat);
      mesh.position.set(p.x, p.y, p.z);
      mesh.renderOrder = resolved.opacity < 0.999 ? 5 + index : 10 + index;
      mesh.userData = {
        kind: "sphere",
        specId: spec.id,
        pointId: p.id,
        glowing: glow,
        constructionIndex: index,
        colorHex: resolved.hexNumber,
        opacity: resolved.opacity,
        specRadius: spec.radius,
      };
      this.group.add(mesh);

      const arc =
        compassProgress == null ? 1 : Math.min(1, Math.max(0, compassProgress));
      if (arc > 0.001) {
        const tube = Math.max(r * 0.016, 0.01);
        const hex = resolved.hexNumber;
        const circleMat = this.createMaterial(
          glow ? 0xffffff : resolved.hexNumber,
          glow ? 0.95 : Math.max(0.3, 0.75 - this.appearance.transparency * 0.4),
          { emissive: glow ? hex : null, emissiveIntensity: glow ? 0.9 : 0 }
        );
        const circleMesh = new THREE.Mesh(
          createCircleArcTubeXY([p.x, p.y, p.z], spec.radius, tube, arc, 5),
          circleMat
        );
        circleMesh.renderOrder = 20 + index;
        circleMesh.userData = {
          kind: "compassCircle",
          pointId: p.id,
          glowing: glow,
        };
        this.group.add(circleMesh);
      }
    });

    // Connection paths (Tree of Life, Merkaba, …) stay visible in construction mode
    if (this.data.edges?.length) {
      this.#renderLines(points);
    }
  }

  #renderSpheres(points, opts = {}) {
    const includeRoles = opts.includeRoles ?? null;
    this._sharedSphereMaterial = null;
    this.data.sphereCenters.forEach((spec, index) => {
      const p = points.get(spec.pointId);
      if (!p) return;
      const role = spec.meta?.role || p.meta?.role;
      if (includeRoles && !includeRoles.includes(role || "sephirah")) return;
      const progress = this.drawProgress.get(spec.id) ?? this.drawProgress.get(p.id);
      if (progress != null && progress <= 0.001) return;

      const resolved = this.#resolveColor(spec.id, p.id, index);
      const selected =
        this.selectedSphereId === p.id || this.selectedSphereId === spec.id;
      const geo = createParametricSphere(spec.radius, 32, 22);
      const mesh = new THREE.Mesh(
        geo,
        this.createSphereMaterial(resolved.hex, {
          opacity: resolved.opacity,
          selected,
        })
      );
      mesh.position.set(p.x, p.y, p.z);
      // Stable layer band 100 — spheres always before circles/lines/points.
      mesh.renderOrder = 100 + index;
      mesh.userData = {
        kind: "sphere",
        specId: spec.id,
        pointId: p.id,
        constructionIndex: index,
        colorHex: resolved.hexNumber,
        opacity: resolved.opacity,
        specRadius: spec.radius,
      };
      this.group.add(mesh);
    });
  }

  #renderCircles(points, opts = {}) {
    const style = this.#layerStyle("circles");
    const thickness = style.thickness ?? 1;
    const tubeRadius = Math.max(this.data.radius * 0.016 * thickness, 0.008);
    const sephirotOnly = Boolean(opts.sephirotOnly);
    const includeRoles = opts.includeRoles ?? null;

    this.data.circleCenters.forEach((spec, index) => {
      const p = points.get(spec.pointId);
      if (!p) return;
      const role = spec.meta?.role || p.meta?.role;
      if (sephirotOnly && role && role !== "sephirah") return;
      if (includeRoles && !includeRoles.includes(role || "sephirah")) return;
      const progress = this.drawProgress.get(spec.id) ?? this.drawProgress.get(p.id) ?? 1;
      if (progress <= 0.001) return;

      // Layer style is the presentation source — independent of sphere color.
      let opacity = style.opacity;
      if (role === "flowerOverlay" || role === "construction") {
        opacity = Math.min(opacity, Math.max(0.2, opacity * 0.7));
      }
      const geo = createCircleArcTubeXY([p.x, p.y, p.z], spec.radius, tubeRadius, progress, 6);
      const mesh = new THREE.Mesh(
        geo,
        this.createMaterial(style.color, opacity)
      );
      mesh.renderOrder = 200 + index;
      mesh.userData = {
        kind: "circle",
        specId: spec.id,
        pointId: p.id,
        role,
        colorHex: new THREE.Color(style.color).getHex(),
        opacity,
      };
      this.group.add(mesh);
    });
  }

  #renderPointMarkers(
    points,
    { radiusScale = 0.045, color = null, roleFilter = null } = {}
  ) {
    const style = this.#layerStyle("points");
    const size = style.size ?? 1;
    const markerRadius = Math.max(this.data.radius * radiusScale * size, 0.02);
    const hex = color != null ? color : style.color;
    const opacity = style.opacity;

    this.data.points.forEach((p, index) => {
      if (roleFilter && p.meta?.role !== roleFilter) return;
      if (!roleFilter && (p.meta?.role === "symmetryAxis" || p.meta?.role === "flowerOverlay")) {
        return;
      }
      const geo = createParametricSphere(markerRadius, 10, 8);
      const mesh = new THREE.Mesh(
        geo,
        this.createMaterial(hex, opacity)
      );
      mesh.position.set(p.x, p.y, p.z);
      // Layer band 400 — points last so markers stay readable over spheres/lines.
      mesh.renderOrder = 400 + index;
      mesh.userData = {
        kind: "point",
        pointId: p.id,
        colorHex: new THREE.Color(hex).getHex(),
        opacity,
      };
      this.group.add(mesh);
    });
  }

  /**
   * @param {Map<string, object>} points
   * @param {{
   *   thicknessScale?: number,
   *   treePathsOnly?: boolean,
   *   includeTreePaths?: boolean,
   *   includeSymmetryAxes?: boolean,
   * }} [opts]
   */
  #renderLines(points, opts = {}) {
    const style = this.#layerStyle("connections");
    const layerThickness = style.thickness ?? this.appearance.pathThickness ?? 1;
    const thickness =
      Math.max(0.15, layerThickness) * (opts.thicknessScale ?? 1);
    const baseTube = Math.max(this.data.radius * 0.011 * thickness, 0.006);
    const treePathsOnly = Boolean(opts.treePathsOnly);
    const includeTreePaths = opts.includeTreePaths !== false;
    const includeSymmetryAxes = Boolean(opts.includeSymmetryAxes);
    const styleColor = new THREE.Color(style.color).getHex();
    const opacity = style.opacity;

    this.data.edges.forEach((edge) => {
      const a = points.get(edge.from);
      const b = points.get(edge.to);
      if (!a || !b) return;
      const kind = edge.meta?.kind;

      if (kind === "symmetryAxis") {
        if (!includeSymmetryAxes) return;
      } else if (kind === "treePath") {
        if (!includeTreePaths) return;
        if (treePathsOnly && kind !== "treePath") return;
      } else if (treePathsOnly) {
        return;
      }

      const tubeRadius =
        kind === "symmetryAxis"
          ? baseTube * 0.4
          : kind === "treePath"
            ? baseTube * 1.15
            : baseTube;

      // User connection color is the base; specialty edge kinds keep slight hue bias.
      const color =
        kind === "symmetryAxis"
          ? 0xd4af37
          : kind === "treePath"
            ? styleColor
            : styleColor;
      const geo = createTubeBetween([a.x, a.y, a.z], [b.x, b.y, b.z], tubeRadius, 6, 10);
      const mesh = new THREE.Mesh(
        geo,
        this.createMaterial(color, opacity)
      );
      mesh.renderOrder = 300;
      // Depth-write off for translucent path tubes keeps spheres readable underneath.
      if (mesh.material) {
        mesh.material.depthWrite = mesh.material.opacity >= 0.99;
      }
      mesh.userData = {
        kind: "line",
        edgeId: edge.id,
        label: edge.label || edge.id,
        pathKind: kind || "edge",
        colorHex: color,
        opacity,
      };
      this.group.add(mesh);
    });
  }
}

export { PALETTES, colorForSphere };
