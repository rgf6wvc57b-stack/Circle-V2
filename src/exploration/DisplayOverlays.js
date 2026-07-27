import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";
import { createCircleArcTubeXY, createConstructionPlaneXY, createParametricSphere } from "../engine/renderer/primitives.js";
import { pointMap } from "../engine/schema.js";
import { intersectCirclesEqualRadius } from "../engine/construction/compass.js";

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Independent display overlays with smooth opacity animation.
 * Does not alter geometry generation — reads construction data only.
 */
export class DisplayOverlays {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   container: HTMLElement,
   *   parentGroup?: THREE.Object3D,
   * }} opts
   */
  constructor({ scene, container, parentGroup = null }) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "displayOverlays";
    (parentGroup ?? scene).add(this.group);

    this.layers = {
      sphereCenters: new THREE.Group(),
      radiusLines: new THREE.Group(),
      circleOutlines: new THREE.Group(),
      constructionPlane: new THREE.Group(),
      grid: new THREE.Group(),
      labels: new THREE.Group(),
      intersectionPoints: new THREE.Group(),
    };
    Object.values(this.layers).forEach((g) => {
      g.userData.opacity = 0;
      g.userData.targetOpacity = 0;
      this.group.add(g);
    });

    this.flags = {
      sphereCenters: false,
      radiusLines: false,
      circleOutlines: false,
      constructionPlane: false,
      grid: false,
      labels: false,
      intersectionPoints: false,
    };

    this.data = null;
    this.resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = "absolute";
    this.labelRenderer.domElement.style.inset = "0";
    this.labelRenderer.domElement.style.pointerEvents = "none";
    this.labelRenderer.domElement.style.zIndex = "2";
    container.appendChild(this.labelRenderer.domElement);
  }

  setFlag(name, enabled) {
    if (!(name in this.flags)) return;
    this.flags[name] = Boolean(enabled);
    this.layers[name].userData.targetOpacity = enabled ? 1 : 0;
    if (enabled && this.layers[name].children.length === 0 && this.data) {
      this.#rebuildLayer(name);
    }
  }

  setData(data) {
    this.data = data;
    this.rebuild();
  }

  rebuild() {
    Object.keys(this.layers).forEach((name) => {
      this.#clearGroup(this.layers[name]);
      if (this.flags[name] || this.layers[name].userData.targetOpacity > 0.01) {
        this.#rebuildLayer(name);
      }
    });
    this.#applyOpacity();
  }

  #clearGroup(group) {
    while (group.children.length) {
      const c = group.children.pop();
      if (c instanceof CSS2DObject) {
        c.element?.remove?.();
      }
      c.geometry?.dispose?.();
      if (c.userData?.sharedMat) continue;
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.());
        else c.material.dispose?.();
      }
    }
  }

  #rebuildLayer(name) {
    if (!this.data) return;
    const points = pointMap(this.data);
    const r = this.data.radius;
    const g = this.layers[name];

    if (name === "constructionPlane") {
      const size = r * 4.6;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a3344,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        metalness: 0.05,
        roughness: 0.9,
      });
      const mesh = new THREE.Mesh(createConstructionPlaneXY(size), mat);
      mesh.userData.baseOpacity = 0.4;
      g.add(mesh);
      return;
    }

    if (name === "grid") {
      const size = r * 4.6;
      const grid = new THREE.GridHelper(size, 16, 0x3ecfbf, 0x2a3d4c);
      grid.rotation.x = Math.PI / 2;
      if (Array.isArray(grid.material)) {
        grid.material.forEach((m) => {
          m.transparent = true;
          m.opacity = 0.35;
        });
      } else {
        grid.material.transparent = true;
        grid.material.opacity = 0.35;
      }
      grid.userData.baseOpacity = 0.35;
      g.add(grid);
      return;
    }

    if (name === "sphereCenters") {
      this.data.points.forEach((p) => {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffd166,
          transparent: true,
          opacity: 0.95,
        });
        const mesh = new THREE.Mesh(createParametricSphere(Math.max(r * 0.045, 0.03), 12, 10), mat);
        mesh.position.set(p.x, p.y, p.z);
        mesh.userData.baseOpacity = 0.95;
        mesh.renderOrder = 60;
        g.add(mesh);
      });
      return;
    }

    if (name === "radiusLines") {
      const origin = this.data.points.find((p) => p.x === 0 && p.y === 0 && p.z === 0) ?? this.data.points[0];
      if (!origin) return;
      const mat = new LineMaterial({
        color: 0x8ecae6,
        linewidth: 1.75,
        transparent: true,
        opacity: 0.75,
        worldUnits: false,
        resolution: this.resolution.clone(),
      });
      this.data.sphereCenters.forEach((spec) => {
        const p = points.get(spec.pointId);
        if (!p || p.id === origin.id) return;
        const geo = new LineGeometry();
        geo.setPositions([origin.x, origin.y, origin.z, p.x, p.y, p.z]);
        const line = new Line2(geo, mat);
        line.computeLineDistances();
        line.userData.baseOpacity = 0.75;
        line.userData.sharedMat = true;
        g.add(line);
      });
      return;
    }

    if (name === "circleOutlines") {
      const tube = Math.max(r * 0.014, 0.01);
      this.data.circleCenters.forEach((spec, i) => {
        const p = points.get(spec.pointId);
        if (!p) return;
        const mat = new THREE.MeshBasicMaterial({
          color: 0xa8dadc,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(
          createCircleArcTubeXY([p.x, p.y, p.z], spec.radius, tube, 1, 5),
          mat
        );
        mesh.userData.baseOpacity = 0.7;
        mesh.renderOrder = 55;
        g.add(mesh);
      });
      return;
    }

    if (name === "labels") {
      this.data.points.forEach((p) => {
        // Scaffold lattice sites stay unlabeled so Sephirot remain readable
        if (p.meta?.role === "scaffold") return;
        const text = p.label || (p.meta?.role === "sephirah" ? p.id : "");
        if (!text) return;
        const el = document.createElement("div");
        el.className = "geo-label";
        el.textContent = text;
        const obj = new CSS2DObject(el);
        obj.position.set(p.x, p.y, p.z);
        obj.userData.baseOpacity = 1;
        g.add(obj);
      });
      // Path labels at midpoints (Tree of Life 22 paths — not lattice chords)
      (this.data.edges || []).forEach((edge) => {
        if (!edge.label) return;
        if (edge.meta?.kind === "lattice") return;
        const a = points.get(edge.from);
        const b = points.get(edge.to);
        if (!a || !b) return;
        const el = document.createElement("div");
        el.className = "geo-label geo-label-path";
        el.textContent = edge.label;
        const obj = new CSS2DObject(el);
        obj.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        obj.userData.baseOpacity = 1;
        g.add(obj);
      });
      return;
    }

    if (name === "intersectionPoints") {
      const centers = this.data.sphereCenters
        .map((s) => {
          const p = points.get(s.pointId);
          return p ? { p, r: s.radius } : null;
        })
        .filter(Boolean);

      const seen = [];
      for (let i = 0; i < centers.length; i += 1) {
        for (let j = i + 1; j < centers.length; j += 1) {
          const a = centers[i];
          const b = centers[j];
          if (Math.abs(a.r - b.r) > 1e-6) continue;
          const hits = intersectCirclesEqualRadius(a.p, b.p, a.r);
          hits.forEach((h) => {
            if (seen.some((s) => Math.hypot(s.x - h.x, s.y - h.y, s.z - h.z) < 1e-6)) return;
            // Skip if coincides with an existing center
            if (
              this.data.points.some(
                (pt) => Math.hypot(pt.x - h.x, pt.y - h.y, pt.z - h.z) < 1e-6
              )
            ) {
              return;
            }
            seen.push(h);
            const mat = new THREE.MeshBasicMaterial({
              color: 0xff6b6b,
              transparent: true,
              opacity: 0.9,
            });
            const mesh = new THREE.Mesh(
              createParametricSphere(Math.max(r * 0.04, 0.028), 10, 8),
              mat
            );
            mesh.position.set(h.x, h.y, h.z);
            mesh.userData.baseOpacity = 0.9;
            mesh.renderOrder = 58;
            g.add(mesh);
          });
        }
      }
    }
  }

  #applyOpacity() {
    Object.entries(this.layers).forEach(([name, group]) => {
      const o = group.userData.opacity;
      group.visible = o > 0.01;
      group.traverse((obj) => {
        if (obj instanceof CSS2DObject) {
          obj.element.style.opacity = String(o);
          return;
        }
        const base = obj.userData.baseOpacity ?? 1;
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if ("opacity" in m) {
              m.transparent = true;
              m.opacity = base * o;
              m.needsUpdate = true;
            }
          });
        }
      });
    });
  }

  update(dt) {
    let dirty = false;
    Object.values(this.layers).forEach((group) => {
      const target = group.userData.targetOpacity;
      const cur = group.userData.opacity;
      if (Math.abs(cur - target) < 0.001) {
        if (cur !== target) {
          group.userData.opacity = target;
          dirty = true;
        }
        return;
      }
      group.userData.opacity = lerp(cur, target, 1 - Math.pow(0.001, dt));
      // smoother ~0.35s feel
      const speed = 6;
      group.userData.opacity = cur + (target - cur) * Math.min(1, dt * speed);
      dirty = true;
      if (target > 0.01 && group.children.length === 0 && this.data) {
        // rebuild if fading in empty
      }
    });
    if (dirty) this.#applyOpacity();

    // Rebuild empty layers that are fading in
    Object.entries(this.layers).forEach(([name, group]) => {
      if (group.userData.targetOpacity > 0.01 && group.children.length === 0 && this.data) {
        this.#rebuildLayer(name);
        this.#applyOpacity();
      }
    });
  }

  render(camera) {
    this.labelRenderer.render(this.scene, camera);
  }

  setSize(width, height) {
    this.resolution.set(width, height);
    this.labelRenderer.setSize(width, height);
    this.group.traverse((obj) => {
      if (obj.material?.resolution) obj.material.resolution.set(width, height);
    });
  }
}
