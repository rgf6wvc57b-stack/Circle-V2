import * as THREE from "three";
import { exportPosterPng } from "../export/posterExport.js";
import { applyStudyPosterInsets } from "./studyLayout.js";
import { DEFAULT_STUDY_RENDER_OPTIONS, POSTER_PALETTE } from "../rendering/studyPalette.js";
import { StudySceneRenderer } from "../rendering/StudySceneRenderer.js";
import { getStudyById, listStudies } from "./registry.js";
import { MERKABA_STUDY } from "./definitions/merkabaStudy.js";
import { DIMENSIONAL_STUDY } from "./definitions/dimensionalStudy.js";

/**
 * Interactive geometry study / poster engine controller.
 */
export class StudyController {
  /**
   * @param {object} deps
   * @param {THREE.WebGLRenderer} deps.renderer
   * @param {THREE.Scene} deps.scene
   * @param {import("../exploration/CameraController.js").CameraController} deps.cameraController
   * @param {HTMLElement} deps.posterRoot
   * @param {HTMLElement} deps.appRoot
   * @param {HTMLElement} deps.panel
   */
  constructor(deps) {
    this.renderer = deps.renderer;
    this.scene = deps.scene;
    this.cameraController = deps.cameraController;
    this.posterRoot = deps.posterRoot;
    this.appRoot = deps.appRoot;
    this.panel = deps.panel;
    this._onLayoutSync = deps.onLayoutSync ?? null;
    this.studyGroup = deps.studyGroup;
    this.studyRenderer = new StudySceneRenderer(this.studyGroup, { ...DEFAULT_STUDY_RENDER_OPTIONS });
    this.active = false;
    this.posterMode = false;
    this.studyId = MERKABA_STUDY.id;
    this.options = { ...DEFAULT_STUDY_RENDER_OPTIONS };
    this.sequenceStep = 0;
    this.sequencePlaying = false;
    this._savedBackground = null;
    this._savedFog = undefined;
    this._backgroundSaved = false;
    this._onResize = () => this.#layoutMiniCanvases();
    this._onBlueprintClick = (event) => {
      const btn = event.target.closest(".study-blueprint-step");
      if (!btn || !this.posterRoot.contains(btn)) return;
      this.sequenceStep = Number(btn.dataset.seq);
      this.rebuild();
      this.syncPosterDOM();
      this.frameStudy();
    };
    this.posterRoot.addEventListener("click", this._onBlueprintClick);
  }

  listStudies() {
    return listStudies();
  }

  isActive() {
    return this.active;
  }

  getStudy() {
    return getStudyById(this.studyId);
  }

  setOptions(partial) {
    Object.assign(this.options, partial);
    this.studyRenderer.setOptions(this.options);
    if (this.active) this.rebuild();
  }

  enter(studyId = this.studyId) {
    this.active = true;
    this.studyId = studyId;
    this.studyGroup.visible = true;
    this.#applyPosterBackground(true);
    this.rebuild();
    this.syncPosterDOM();
    this.frameStudy();
    window.addEventListener("resize", this._onResize);
  }

  exit() {
    this.active = false;
    this.posterMode = false;
    this.studyGroup.visible = false;
    this.#applyPosterBackground(false);
    this.posterRoot.hidden = true;
    this.posterRoot.setAttribute("aria-hidden", "true");
    this.appRoot.classList.remove("study-active", "study-poster-mode");
    if (this._onLayoutSync) this._onLayoutSync();
    window.removeEventListener("resize", this._onResize);
    this.studyRenderer.clear();
  }

  setPosterMode(enabled) {
    this.posterMode = Boolean(enabled);
    this.appRoot.classList.toggle("study-poster-mode", this.active && this.posterMode);
    if (this._onLayoutSync) this._onLayoutSync();
    this.syncPosterDOM();
    if (this.active) this.frameStudy();
  }

  setStudy(studyId) {
    this.studyId = studyId;
    this.sequenceStep = 0;
    if (this.active) {
      this.rebuild();
      this.syncPosterDOM();
      this.frameStudy();
    }
  }

  resetCamera() {
    this.frameStudy();
  }

  rebuild() {
    this.studyRenderer.setOptions(this.options);
    this.studyRenderer.clear();
    const study = this.getStudy();
    if (!study) return;

    if (study.id === MERKABA_STUDY.id) {
      this.#buildMerkaba(study);
    } else if (study.id === DIMENSIONAL_STUDY.id) {
      this.#buildDimensional(study);
    }

    if (this.options.showAxes) {
      this.studyRenderer.drawAxes(2.2);
    }
  }

  #buildMerkaba(study) {
    const solids = study.getSolids(1.1);
    const step = this.sequenceStep;

    if (step === 0) {
      this.studyRenderer.drawPolyhedron(solids.tetrahedron, {
        faceMaterial: "faceA",
        name: "tetra-up",
      });
    } else if (step === 1) {
      this.studyRenderer.drawPolyhedron(solids.tetrahedronInverted, {
        faceMaterial: "faceB",
        name: "tetra-down",
      });
    } else if (step === 2) {
      this.studyRenderer.drawPolyhedron(solids.tetrahedron, { faceMaterial: "faceA", name: "tetra-up" });
      this.studyRenderer.drawPolyhedron(solids.tetrahedronInverted, {
        faceMaterial: "faceB",
        name: "tetra-down",
      });
      if (this.options.showInternal) {
        this.studyRenderer.drawPolyhedron(solids.octahedron, {
          scale: 0.55,
          edgeMaterial: "internal",
          name: "octa-core",
        });
      }
    } else {
      this.studyRenderer.drawPolyhedron(solids.centerpiece, {
        faceMaterial: "faceA",
        name: "merkaba",
        emphasisIndices: [0, 1, 2, 3, 4, 5, 6, 7],
      });
      if (this.options.showInternal) {
        this.studyRenderer.drawPolyhedron(solids.cube, {
          scale: 0.55,
          edgeMaterial: "internal",
          name: "cube-inner",
        });
      }
    }
  }

  #buildDimensional(study) {
    const { vesica, sqrt2, sqrt3, sqrt5 } = study.getSolids(1.2);
    this.studyRenderer.drawCircle(vesica.circleCenters[0], vesica.circleRadius, 128, {
      name: "vesica-left",
    });
    this.studyRenderer.drawCircle(vesica.circleCenters[1], vesica.circleRadius, 128, {
      name: "vesica-right",
    });
    const sq = vesica.squareVerts;
    sq.forEach((v, i) => {
      const n = (i + 1) % sq.length;
      this.studyRenderer.drawLine(v, sq[n], { name: `square-edge-${i}` });
    });
    this.studyRenderer.drawLine(vesica.lensTop, vesica.lensBottom, {
      material: "guide",
      name: "vesica-axis",
    });
    this.studyRenderer.drawLine([-1.5, 0, 0], [1.5, 0, 0], { material: "guide", name: "x-axis" });
    this.studyRenderer.drawLine([0, -1.5, 0], [0, 1.5, 0], { material: "guide", name: "y-axis" });

    if (this.options.showVertices !== false) {
      [vesica.lensTop, vesica.lensBottom, [0, 0, 0]].forEach((p, i) => {
        this.studyRenderer.drawPolyhedron(
          { id: `pt-${i}`, vertices: [p], edges: [], triFaces: [] },
          { vertexIndices: [0], name: `vesica-point-${i}` }
        );
      });
    }

    // Offset mini constructions for depth in 3D centerpiece view
    this.studyRenderer.drawPolyhedron(sqrt2, {
      position: [0, -2.4, 0],
      scale: 0.55,
      name: "sqrt2-ghost",
      edgeMaterial: "internal",
    });
    this.studyRenderer.drawPolyhedron(sqrt3, {
      position: [2.4, 0, 0],
      scale: 0.45,
      name: "sqrt3-ghost",
      edgeMaterial: "internal",
    });
    this.studyRenderer.drawPolyhedron(sqrt5, {
      position: [-2.4, 0, 0],
      scale: 0.45,
      name: "sqrt5-ghost",
      edgeMaterial: "internal",
    });
  }

  syncPosterDOM() {
    const study = this.getStudy();
    if (!study || !this.active) {
      this.posterRoot.hidden = true;
      this.posterRoot.setAttribute("aria-hidden", "true");
      return;
    }
    this.posterRoot.hidden = false;
    this.posterRoot.setAttribute("aria-hidden", "false");
    this.appRoot.classList.add("study-active");
    this.appRoot.classList.toggle("study-poster-mode", this.posterMode);

    const labelsVisible = this.options.showLabels !== false;
    const calloutsVisible = this.options.showCallouts !== false;

    this.posterRoot.innerHTML = this.#renderPosterHTML(study, labelsVisible, calloutsVisible);
    this.#layoutMiniCanvases();
  }

  #renderPosterHTML(study, labelsVisible, calloutsVisible) {
    const stats = study.stats
      ? `
        <dl class="study-stats">
          <div><dt>Vertices</dt><dd>${study.stats.vertices}</dd></div>
          <div><dt>Edges</dt><dd>${study.stats.edges}</dd></div>
          <div><dt>Tri faces</dt><dd>${study.stats.triFaces}</dd></div>
          ${study.stats.squareFaces ? `<div><dt>Square faces</dt><dd>${study.stats.squareFaces}</dd></div>` : ""}
        </dl>`
      : "";

    const miniDiagrams =
      study.miniDiagrams?.map(
        (d) => `
        <figure class="study-mini" data-mini="${d.solid}">
          <canvas class="study-mini-canvas" data-solid="${d.solid}" width="160" height="120"></canvas>
          ${labelsVisible ? `<figcaption>${d.title}</figcaption>` : ""}
        </figure>`
      ).join("") ?? "";

    const blueprint =
      study.blueprintSteps?.map(
        (step, i) => `
        <button type="button" class="study-blueprint-step${i === this.sequenceStep ? " active" : ""}" data-seq="${i}">
          ${step.label}
        </button>`
      ).join("") ?? "";

    const ratioPanels =
      study.ratioPanels?.map(
        (panel) => `
        <article class="study-ratio-panel" data-panel="${panel.id}">
          <canvas class="study-mini-canvas" data-solid="${panel.solid}" width="200" height="140"></canvas>
          ${labelsVisible ? `<h4>${panel.title}</h4>` : ""}
          ${labelsVisible ? `<p class="study-ratio-desc">${panel.description}</p>` : ""}
          ${this.options.showMeasurements !== false ? `<p class="study-ratio-value">≈ ${panel.approximation}</p>` : ""}
        </article>`
      ).join("") ?? "";

    const callouts =
      calloutsVisible && study.callouts?.length
        ? `<aside class="study-callouts">${study.callouts
            .map((c) => `<div class="study-callout" data-anchor="${c.anchor}"><span class="study-callout-line"></span><span>${c.label}</span></div>`)
            .join("")}</aside>`
        : "";

    if (study.id === MERKABA_STUDY.id) {
      return `
        <div class="study-poster study-poster-merkaba">
          <header class="study-poster-header">
            ${labelsVisible ? `<h1 class="study-title">${study.title}</h1>` : ""}
            ${labelsVisible ? `<p class="study-subtitle">${study.subtitle}</p>` : ""}
          </header>
          <div class="study-poster-body">
            <div class="study-center-slot" aria-hidden="true"></div>
            ${callouts}
            <section class="study-minis">${miniDiagrams}</section>
            <section class="study-info">
              ${labelsVisible ? `<p class="study-summary">${study.summary}</p>` : ""}
              ${stats}
              ${labelsVisible ? `<p class="study-symbolism">${study.symbolismNote}</p>` : ""}
            </section>
            <section class="study-blueprint">${blueprint}</section>
          </div>
          <footer class="study-footer">${study.footer}</footer>
        </div>`;
    }

    return `
      <div class="study-poster study-poster-dimensional">
        <header class="study-poster-header">
          ${labelsVisible ? `<h1 class="study-title">${study.title}</h1>` : ""}
          ${labelsVisible ? `<p class="study-subtitle">${study.subtitle}</p>` : ""}
        </header>
        <div class="study-poster-body">
          <div class="study-center-slot" aria-hidden="true"></div>
          ${callouts}
          <section class="study-ratio-row">${ratioPanels}</section>
          <section class="study-info">
            ${labelsVisible ? `<p class="study-summary">${study.summary}</p>` : ""}
            ${labelsVisible ? `<p class="study-symbolism">${study.symbolismNote}</p>` : ""}
          </section>
        </div>
        <footer class="study-footer">${study.footer}</footer>
      </div>`;
  }

  #layoutMiniCanvases() {
    const study = this.getStudy();
    if (!study) return;
    const canvases = this.posterRoot.querySelectorAll(".study-mini-canvas");
    canvases.forEach((canvas) => {
      const solidKey = canvas.dataset.solid;
      this.#renderMiniCanvas(canvas, solidKey, study);
    });
  }

  #renderMiniCanvas(canvas, solidKey, study) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = POSTER_PALETTE.background;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = POSTER_PALETTE.goldLine;
    ctx.fillStyle = POSTER_PALETTE.textPrimary;
    ctx.lineWidth = this.options.lineWidth ?? 1.2;
    ctx.font = "11px Georgia, serif";

    const drawPoly2D = (points, closed = false) => {
      if (!points.length) return;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      points.slice(1).forEach((p) => ctx.lineTo(p[0], p[1]));
      if (closed) ctx.closePath();
      ctx.stroke();
    };

    const project = (verts, scale, ox, oy) =>
      verts.map(([x, y]) => [ox + x * scale, oy - y * scale]);

    if (study.id === MERKABA_STUDY.id) {
      const solids = study.getSolids(1);
      const map = {
        tetrahedron: solids.tetrahedron,
        octahedron: solids.octahedron,
        cube: solids.cube,
        cuboctahedron: solids.cuboctahedron,
      };
      const spec = map[solidKey];
      if (!spec) return;
      const scale = solidKey === "cuboctahedron" ? 28 : 36;
      const pts = project(
        spec.vertices.map((v) => [v[0] + v[2] * 0.35, v[1] + v[2] * 0.35]),
        scale,
        w / 2,
        h / 2
      );
      spec.edges.forEach(([a, b]) => drawPoly2D([pts[a], pts[b]]));
      pts.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      return;
    }

    const solids = study.getSolids(1);
    const spec =
      solidKey === "sqrt2"
        ? solids.sqrt2
        : solidKey === "sqrt3"
          ? solids.sqrt3
          : solidKey === "sqrt5"
            ? solids.sqrt5
            : null;
    if (!spec) return;
    const scale = 42;
    const pts = project(
      spec.vertices.map((v) => [v[0], v[1]]),
      scale,
      w * 0.25,
      h * 0.65
    );
    spec.edges.forEach(([a, b]) => drawPoly2D([pts[a], pts[b]]));
    if (solidKey === "sqrt2") drawPoly2D([pts[0], pts[2]]);
    if (solidKey === "sqrt3") drawPoly2D([pts[0], pts[6]]);
    if (solidKey === "sqrt5") drawPoly2D([pts[4], pts[2]]);
  }

  frameStudy() {
    const box = new THREE.Box3().setFromObject(this.studyGroup);
    if (box.isEmpty()) return;
    if (this._onLayoutSync) this._onLayoutSync();
    const margin = this.posterMode ? 1.1 : 1.25;
    this.cameraController.frameBox(box, {
      animate: false,
      margin,
      fitAvailableHeight: true,
    });
  }

  stepSequenceForward() {
    const study = this.getStudy();
    const max = (study?.blueprintSteps?.length ?? 1) - 1;
    this.sequenceStep = Math.min(max, this.sequenceStep + 1);
    this.rebuild();
    this.syncPosterDOM();
    this.frameStudy();
  }

  stepSequenceBack() {
    this.sequenceStep = Math.max(0, this.sequenceStep - 1);
    this.rebuild();
    this.syncPosterDOM();
    this.frameStudy();
  }

  toggleSequencePlayback() {
    this.sequencePlaying = !this.sequencePlaying;
  }

  update(dt) {
    if (!this.active || !this.sequencePlaying) return;
    this._seqAccum = (this._seqAccum ?? 0) + dt;
    if (this._seqAccum > 2.5) {
      this._seqAccum = 0;
      const study = this.getStudy();
      const max = (study?.blueprintSteps?.length ?? 1) - 1;
      this.sequenceStep = this.sequenceStep >= max ? 0 : this.sequenceStep + 1;
      this.rebuild();
      this.syncPosterDOM();
      this.frameStudy();
    }
  }

  async exportPoster({ scale = 3, download = true, forceHtmlCompositeFailure = false, includeExportMarker = false } = {}) {
    applyStudyPosterInsets(this.appRoot, {
      insetRight: 0,
      insetBottom: 0,
      availableWidth: window.innerWidth,
      availableHeight: window.innerHeight,
      layout: "full",
    });
    this.appRoot.classList.add("study-poster-exporting");
    this.frameStudy();
    try {
      return await exportPosterPng({
        renderer: this.renderer,
        scene: this.scene,
        camera: this.cameraController.getActiveCamera(),
        posterRoot: this.posterRoot,
        appRoot: this.appRoot,
        scale,
        filename: `${this.studyId}-poster.png`,
        download,
        forceHtmlCompositeFailure,
        includeExportMarker,
      });
    } finally {
      this.appRoot.classList.remove("study-poster-exporting");
      if (this._onLayoutSync) this._onLayoutSync();
      if (this.active) this.frameStudy();
    }
  }

  #applyPosterBackground(active) {
    if (active) {
      if (!this._backgroundSaved) {
        this._savedBackground = this.scene.background?.clone?.() ?? this.scene.background;
        this._savedFog = this.scene.fog;
        this._backgroundSaved = true;
      }
      this.scene.background = new THREE.Color(POSTER_PALETTE.background);
      this.scene.fog = null;
    } else if (this._backgroundSaved) {
      this.scene.background = this._savedBackground;
      this.scene.fog = this._savedFog;
      this._savedBackground = null;
      this._savedFog = undefined;
      this._backgroundSaved = false;
    }
  }
}
