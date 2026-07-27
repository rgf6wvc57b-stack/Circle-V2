import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { createParametricSphere } from "../engine/renderer/primitives.js";
import { computeMathematics } from "./analyze.js";
import { GeometryGraph } from "./graph/GeometryGraph.js";
import { DISCOVERY_LABELS, NODE_TYPES } from "./graph/types.js";
import { discoverFromGraph } from "./detect/discoverFromGraph.js";
import { DiscoveryHighlights } from "./DiscoveryHighlights.js";
import { inspectNode, renderInspectorHtml } from "./ObjectInspector.js";

/**
 * Discovery Engine v1 — geometry relationship graph + typed discoveries + object inspector.
 * Analysis layer only: does not alter construction, camera, palettes, export, or measurement modules.
 */
export class DiscoveryEngine {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   parentGroup: THREE.Object3D,
   *   designGroup: THREE.Group,
   *   cameraController: import('../exploration/CameraController.js').CameraController,
   *   focusSystem: import('../exploration/FocusSystem.js').FocusSystem,
   *   domElement: HTMLElement,
   *   discoveriesEl: HTMLElement,
   *   mathematicsEl: HTMLElement,
   *   inspectorEl?: HTMLElement,
   *   inspectorHud?: HTMLElement,
   *   intersectionHud?: HTMLElement,
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.parentGroup = opts.parentGroup;
    this.designGroup = opts.designGroup;
    this.cameraController = opts.cameraController;
    this.focusSystem = opts.focusSystem;
    this.domElement = opts.domElement;
    this.discoveriesEl = opts.discoveriesEl;
    this.mathematicsEl = opts.mathematicsEl;
    this.inspectorEl = opts.inspectorEl ?? null;
    this.inspectorHud = opts.inspectorHud ?? opts.intersectionHud ?? null;

    this.graph = new GeometryGraph();
    this.highlights = new DiscoveryHighlights(opts.parentGroup);

    this.graphGroup = new THREE.Group();
    this.graphGroup.name = "discoveryGraph";
    this.graphGroup.visible = false;
    opts.parentGroup.add(this.graphGroup);

    this.discoveryResult = { discoveries: [], summary: [], byType: new Map() };
    this.mathematics = null;
    this.lastUpdateMs = 0;
    this.selectedDiscoveryType = null;
    this.selectedObjectId = null;
    this.showGraph = false;
    this.inspectMode = false;
    this.resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.ctx = { step: 1, maxStep: 1 };
    this.data = null;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._pointerDown = null;

    this._onPointerDown = (e) => {
      if (e.button !== 0) return;
      this._pointerDown = { x: e.clientX, y: e.clientY };
    };
    this._onPointerUp = (e) => this.#onPointerUp(e);
    this.domElement.addEventListener("pointerdown", this._onPointerDown);
    this.domElement.addEventListener("pointerup", this._onPointerUp);

    this.#renderExplorer();
    this.#renderMathematics(null);
    this.#renderInspector(null);
  }

  setContext(ctx) {
    this.ctx = { ...this.ctx, ...ctx };
  }

  /**
   * Incremental update: rebuild graph + discoveries only when fingerprint changes.
   * @param {import('../engine/schema.js').ConstructionData|null} data
   */
  setData(data) {
    this.data = data;
    const t0 = performance.now();
    const { changed, ms: graphMs } = this.graph.update(data, this.ctx);

    if (changed) {
      this.discoveryResult = discoverFromGraph(this.graph);
      const ixNodes = this.graph.nodesOfType(NODE_TYPES.INTERSECTION).map((n) => ({
        id: n.id,
        x: n.center.x,
        y: n.center.y,
        z: n.center.z,
        firstStep: n.constructionStep,
        parents: (n.parentIds || []).map((id) => {
          const p = this.graph.getNode(id);
          return { id, label: p?.label || id };
        }),
        parentIds: n.parentIds || [],
      }));
      this.mathematics = computeMathematics(data, ixNodes, this.ctx);
      this.#renderExplorer();
      this.#renderMathematics(this.mathematics);
      if (this.showGraph) this.#rebuildGraph();

      // Refresh selection highlights if still valid
      if (this.selectedDiscoveryType) {
        const row = this.discoveryResult.summary.find((s) => s.type === this.selectedDiscoveryType);
        if (!row || row.count === 0) this.clearDiscoverySelection();
        else this.selectDiscoveryType(this.selectedDiscoveryType);
      } else if (this.selectedObjectId) {
        if (!this.graph.getNode(this.selectedObjectId)) this.clearObjectSelection();
        else this.selectObject(this.selectedObjectId);
      }
    }

    this.lastUpdateMs = performance.now() - t0;
    if (this.discoveriesEl) {
      const perf = this.discoveriesEl.querySelector("[data-discovery-perf]");
      if (perf) {
        perf.textContent = changed
          ? `Updated in ${this.lastUpdateMs.toFixed(1)} ms (graph ${graphMs.toFixed(1)} ms)`
          : `Cached · last ${this.lastUpdateMs.toFixed(1)} ms`;
      }
    }
  }

  setShowGraph(on) {
    this.showGraph = Boolean(on);
    this.graphGroup.visible = this.showGraph;
    if (this.showGraph) this.#rebuildGraph();
    else this.#clearGroup(this.graphGroup);
  }

  /** @deprecated Use setInspectMode — kept for main.js migration */
  setIntersectionMode(on) {
    this.setInspectMode(on);
  }

  setInspectMode(on) {
    this.inspectMode = Boolean(on);
    this.focusSystem.setMeasurementBlocking(this.inspectMode);
    if (this.inspectorHud) this.inspectorHud.hidden = !this.inspectMode;
    if (this.inspectMode) {
      this.#renderInspectorHud({ waiting: true });
    } else {
      this.clearObjectSelection();
      this.#renderInspectorHud(null);
    }
  }

  selectDiscoveryType(type) {
    this.selectedDiscoveryType = type;
    this.selectedObjectId = null;
    const items = this.discoveryResult.byType.get(type) || [];
    const nodeIds = [];
    items.forEach((d) => {
      (d.nodeIds || d.objectIds || []).forEach((id) => nodeIds.push(id));
      (d.relatedIds || []).forEach((id) => nodeIds.push(id));
    });
    this.highlights.clear();
    this.highlights.highlightNodes(this.graph, nodeIds, {
      color: 0xff9f1c,
      opacity: 0.85,
      pulse: true,
    });
    this.#syncExplorerActive();
    this.#renderInspector(null);
  }

  clearDiscoverySelection() {
    this.selectedDiscoveryType = null;
    if (!this.selectedObjectId) this.highlights.clear();
    this.#syncExplorerActive();
  }

  selectObject(nodeId) {
    const inspection = inspectNode(this.graph, nodeId, this.discoveryResult);
    if (!inspection) return;
    this.selectedObjectId = nodeId;
    this.selectedDiscoveryType = null;
    this.highlights.highlightSelection(this.graph, nodeId, {
      parents: inspection.parents,
      children: inspection.children,
      connected: inspection.connected.slice(0, 24),
    });
    this.#syncExplorerActive();
    this.#renderInspector(inspection);
    if (this.inspectMode) this.#renderInspectorHud({ inspection });
  }

  clearObjectSelection() {
    this.selectedObjectId = null;
    if (!this.selectedDiscoveryType) this.highlights.clear();
    this.#renderInspector(null);
    if (this.inspectMode) this.#renderInspectorHud({ waiting: true });
  }

  clearSelection() {
    this.clearDiscoverySelection();
    this.clearObjectSelection();
    this.highlights.clear();
  }

  setSize(w, h) {
    this.resolution.set(w, h);
    this.highlights.setResolution(w, h);
    this.graphGroup.traverse((obj) => {
      if (obj.material?.resolution) obj.material.resolution.set(w, h);
    });
  }

  update(dt) {
    this.highlights.update(dt);
    if (this.showGraph) {
      const breathe = 0.75 + Math.sin(performance.now() * 0.0012) * 0.1;
      this.graphGroup.traverse((obj) => {
        if (!obj.material || !("opacity" in obj.material)) return;
        const base = obj.userData.baseOpacity ?? 0.7;
        obj.material.opacity = base * breathe;
      });
    }
  }

  dispose() {
    this.domElement.removeEventListener("pointerdown", this._onPointerDown);
    this.domElement.removeEventListener("pointerup", this._onPointerUp);
    this.highlights.dispose();
    this.#clearGroup(this.graphGroup);
  }

  #clearGroup(group) {
    /** @type {Set<import('three').Material>} */
    const sharedMats = new Set();
    while (group.children.length) {
      const c = group.children.pop();
      c.geometry?.dispose?.();
      if (!c.material) continue;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      if (c.userData?.sharedMat) {
        mats.forEach((m) => sharedMats.add(m));
      } else {
        mats.forEach((m) => m.dispose?.());
      }
    }
    sharedMats.forEach((m) => m.dispose?.());
  }

  #onPointerUp(event) {
    if (!this.inspectMode) return;
    if (event.target.closest?.("#panel")) return;
    if (!this._pointerDown) return;
    const dx = event.clientX - this._pointerDown.x;
    const dy = event.clientY - this._pointerDown.y;
    this._pointerDown = null;
    if (dx * dx + dy * dy > 36) return;

    const nodeId = this.#pickObject(event);
    if (!nodeId) {
      this.clearObjectSelection();
      return;
    }
    this.selectObject(nodeId);
  }

  #pickObject(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const cam = this.cameraController.getActiveCamera();
    this.raycaster.setFromCamera(this.pointer, cam);
    const hits = this.raycaster.intersectObjects(this.designGroup.children, true);
    for (const hit of hits) {
      const ud = hit.object.userData || {};
      if (ud.specId && this.graph.getNode(ud.specId)) return ud.specId;
      if (ud.edgeId && this.graph.getNode(ud.edgeId)) return ud.edgeId;
      if (ud.pointId && this.graph.getNode(ud.pointId)) return ud.pointId;
      if (ud.kind === "sphere" && ud.pointId) {
        // Prefer sphere node over point when available
        const spheres = this.graph.nodesOfType(NODE_TYPES.SPHERE);
        const match = spheres.find((s) => s.pointId === ud.pointId);
        if (match) return match.id;
        return ud.pointId;
      }
      if (ud.kind === "circle" && ud.specId) return ud.specId;
    }
    return null;
  }

  #rebuildGraph() {
    this.#clearGroup(this.graphGroup);
    const nodes = [...this.graph.nodes.values()].filter((n) => n.center);
    if (!nodes.length) return;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const edgeMat = new LineMaterial({
      color: 0x7eb8c9,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.55,
      worldUnits: false,
      resolution: this.resolution.clone(),
    });

    this.graph.relations.forEach((e) => {
      const a = nodeMap.get(e.a);
      const b = nodeMap.get(e.b);
      if (!a?.center || !b?.center) return;
      // Skip dense equal-radius/mirror clutter for readability — keep structural links
      if (
        e.kind === "equalRadius" ||
        e.kind === "equalLength" ||
        e.kind === "mirrorPair" ||
        e.kind === "rotationalEquivalent"
      ) {
        return;
      }
      const geo = new LineGeometry();
      geo.setPositions([
        a.center.x,
        a.center.y,
        a.center.z,
        b.center.x,
        b.center.y,
        b.center.z,
      ]);
      const line = new Line2(geo, edgeMat);
      line.computeLineDistances();
      line.userData.baseOpacity = e.kind === "tangent" ? 0.7 : 0.45;
      line.userData.sharedMat = true;
      line.renderOrder = 60;
      this.graphGroup.add(line);
    });

    nodes.forEach((n) => {
      if (n.type === NODE_TYPES.EDGE || n.type === NODE_TYPES.FACE) return;
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9fd4e0,
        transparent: true,
        opacity: 0.8,
      });
      const r = Math.max((n.radius ?? this.data?.radius ?? 1) * 0.045, 0.035);
      const mesh = new THREE.Mesh(createParametricSphere(r, 10, 8), mat);
      mesh.position.set(n.center.x, n.center.y, n.center.z);
      mesh.userData.baseOpacity = 0.8;
      mesh.renderOrder = 61;
      this.graphGroup.add(mesh);
    });
  }

  #fmt(n) {
    return Number(n).toFixed(4);
  }

  #renderExplorer() {
    if (!this.discoveriesEl) return;
    const body = this.discoveriesEl.querySelector(".discoveries-list");
    if (!body) return;

    const summary = this.discoveryResult.summary?.length
      ? this.discoveryResult.summary
      : Object.keys(DISCOVERY_LABELS).map((type) => ({
          type,
          label: DISCOVERY_LABELS[type],
          count: 0,
          items: [],
        }));

    const total = summary.reduce((s, r) => s + r.count, 0);
    body.innerHTML = `
      <p class="hint" data-discovery-perf>Analysis ready</p>
      <p class="hint">${total} discoveries across ${summary.filter((s) => s.count > 0).length} categories</p>
      ${summary
        .map((row) => {
          const disabled = row.count === 0;
          const active = this.selectedDiscoveryType === row.type;
          return `
        <button type="button"
          class="discovery-item${active ? " active" : ""}${disabled ? " disabled" : ""}"
          data-discovery-type="${row.type}"
          ${disabled ? "disabled" : ""}>
          <div class="discovery-head">
            <span class="discovery-title">${row.label}</span>
            <span class="discovery-count">${row.count}</span>
          </div>
        </button>`;
        })
        .join("")}
    `;

    body.querySelectorAll("[data-discovery-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.getAttribute("data-discovery-type");
        if (this.selectedDiscoveryType === type) this.clearDiscoverySelection();
        else this.selectDiscoveryType(type);
      });
    });
  }

  #syncExplorerActive() {
    if (!this.discoveriesEl) return;
    this.discoveriesEl.querySelectorAll("[data-discovery-type]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.getAttribute("data-discovery-type") === this.selectedDiscoveryType
      );
    });
  }

  #renderMathematics(math) {
    if (!this.mathematicsEl) return;
    const body = this.mathematicsEl.querySelector(".math-grid");
    if (!body) return;
    if (!math) {
      body.innerHTML = "";
      return;
    }
    const euler = math.euler == null ? "—" : String(math.euler);
    body.innerHTML = `
      <span>Radius</span><strong>${this.#fmt(math.radius)}</strong>
      <span>Diameter</span><strong>${this.#fmt(math.diameter)}</strong>
      <span>Circumference</span><strong>${this.#fmt(math.circumference)}</strong>
      <span>Area (circle)</span><strong>${this.#fmt(math.area)}</strong>
      <span>Volume (sphere)</span><strong>${this.#fmt(math.volume)}</strong>
      <span>Intersections</span><strong>${math.intersections}</strong>
      <span>Unique vertices</span><strong>${math.uniqueVertices}</strong>
      <span>Circles</span><strong>${math.circles}</strong>
      <span>Spheres</span><strong>${math.spheres}</strong>
      <span>Construction depth</span><strong>${math.constructionDepth} / ${math.maxStep}</strong>
      <span>Euler χ</span><strong>${euler}</strong>
      <span>Graph nodes</span><strong>${this.graph.nodes.size}</strong>
      <span>Relations</span><strong>${this.graph.relations.length}</strong>
      <span class="math-centers-label">Centers</span>
      <div class="math-centers">${(math.centers || [])
        .slice(0, 12)
        .map(
          (c) =>
            `<div class="meas-mono">${c.label}: (${this.#fmt(c.x)}, ${this.#fmt(c.y)}, ${this.#fmt(c.z)})</div>`
        )
        .join("")}${(math.centers?.length || 0) > 12 ? `<div class="hint">+${math.centers.length - 12} more</div>` : ""}</div>
    `;
  }

  #renderInspector(inspection) {
    if (!this.inspectorEl) return;
    const body = this.inspectorEl.querySelector(".inspector-body");
    if (!body) return;
    body.innerHTML = renderInspectorHtml(this.graph, inspection);
  }

  #renderInspectorHud(data) {
    if (!this.inspectorHud) return;
    if (!data) {
      this.inspectorHud.innerHTML = "";
      return;
    }
    if (data.waiting) {
      this.inspectorHud.innerHTML = `
        <div class="meas-title">Object Inspector</div>
        <p>Click a sphere, circle, point, or edge to inspect relationships.</p>`;
      return;
    }
    if (data.inspection) {
      this.inspectorHud.innerHTML = `
        <div class="meas-title">Object Inspector</div>
        ${renderInspectorHtml(this.graph, data.inspection)}`;
    }
  }
}
