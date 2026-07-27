import * as THREE from "three";
import { NODE_TYPES } from "./graph/types.js";

const COLORS = {
  discovery: 0xff9f1c,
  selection: 0xffffff,
  parent: 0x4cc9f0,
  child: 0x80ed99,
  connected: 0xf72585,
};

function v3(p) {
  if (!p) return null;
  if (p.isVector3) return p.clone();
  if (Array.isArray(p)) return new THREE.Vector3(p[0], p[1], p[2]);
  return new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0);
}

/**
 * Visual overlay for discovery graph selection / discovery highlighting.
 * Lives under explorationRoot — never mutates construction meshes.
 */
export class DiscoveryHighlights {
  constructor(rootOrOpts) {
    // Back-compat: accept { parentGroup } or a Group directly
    this.root = rootOrOpts?.parentGroup ?? rootOrOpts;
    this.group = new THREE.Group();
    this.group.name = "discoveryHighlights";
    this.root.add(this.group);

    this._geoCache = new Map();
    this._matCache = new Map();
    this._meshes = [];
    this._pulse = [];
    this._t = 0;
  }

  clear() {
    for (const mesh of this._meshes) {
      if (mesh.userData?._ownsGeo && mesh.geometry) {
        mesh.geometry.dispose();
      }
      this.group.remove(mesh);
    }
    this._meshes.length = 0;
    this._pulse.length = 0;
  }

  dispose() {
    this.clear();
    for (const g of this._geoCache.values()) g.dispose();
    this._geoCache.clear();
    for (const m of this._matCache.values()) m.dispose();
    this._matCache.clear();
    this.root.remove(this.group);
  }

  setResolution() {
    /* no-op: MeshBasic overlays don't need LineMaterial resolution */
  }

  update(dt = 0) {
    this._t += dt;
    const breathe = 0.72 + Math.sin(this._t * 2.4) * 0.18;
    for (const mesh of this._pulse) {
      if (!mesh.material || !("opacity" in mesh.material)) continue;
      const base = mesh.userData.baseOpacity ?? 0.8;
      mesh.material.opacity = base * breathe;
    }
  }

  /** Legacy API used by older callers */
  show(discovery) {
    if (!discovery) {
      this.clear();
      return;
    }
    // Without a graph, nothing to draw — engine uses highlightDiscovery
    this.clear();
  }

  _geo(key, factory) {
    let g = this._geoCache.get(key);
    if (!g) {
      g = factory();
      this._geoCache.set(key, g);
    }
    return g;
  }

  _mat(color, opacity = 0.85) {
    const key = `${color}|${opacity}`;
    let m = this._matCache.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this._matCache.set(key, m);
    }
    return m;
  }

  _add(mesh, { pulse = false, baseOpacity = 0.8 } = {}) {
    mesh.userData.baseOpacity = baseOpacity;
    this.group.add(mesh);
    this._meshes.push(mesh);
    if (pulse) this._pulse.push(mesh);
    return mesh;
  }

  /**
   * @param {import('./graph/GeometryGraph.js').GeometryGraph} graph
   * @param {string[]} nodeIds
   * @param {{ color?: number, opacity?: number, pulse?: boolean }} [opts]
   */
  highlightNodes(graph, nodeIds, opts = {}) {
    const color = opts.color ?? COLORS.discovery;
    const opacity = opts.opacity ?? 0.75;
    const pulse = Boolean(opts.pulse);
    const seen = new Set();
    for (const id of nodeIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const node = graph.getNode(id);
      if (!node) continue;
      this._drawNode(node, color, opacity, pulse);
    }
  }

  /**
   * Highlight every node referenced by a discovery item or type-group.
   * @param {import('./graph/GeometryGraph.js').GeometryGraph} graph
   * @param {{ nodeIds?: string[], objectIds?: string[], relatedIds?: string[] }} discovery
   */
  highlightDiscovery(graph, discovery) {
    this.clear();
    const ids = [
      ...(discovery.nodeIds || discovery.objectIds || []),
      ...(discovery.relatedIds || []),
    ];
    this.highlightNodes(graph, ids, {
      color: COLORS.discovery,
      opacity: 0.85,
      pulse: true,
    });
  }

  /**
   * Selection focus: selected node + parents/children/connections faintly.
   */
  highlightSelection(graph, nodeId, related = {}) {
    this.clear();
    const primary = graph.getNode(nodeId);
    if (!primary) return;

    this._drawNode(primary, COLORS.selection, 0.95, true);

    const parentIds = related.parents || primary.parentIds || [];
    const childIds = related.children || primary.childIds || [];
    const connected = related.connected || [];

    this.highlightNodes(graph, parentIds, { color: COLORS.parent, opacity: 0.55 });
    this.highlightNodes(graph, childIds, { color: COLORS.child, opacity: 0.55 });
    this.highlightNodes(graph, connected, { color: COLORS.connected, opacity: 0.45 });
  }

  _drawNode(node, color, opacity, pulse = false) {
    const c = v3(node.center);
    if (!c) return;

    if (node.type === NODE_TYPES.POINT || node.type === NODE_TYPES.INTERSECTION) {
      const mesh = new THREE.Mesh(
        this._geo("pt", () => new THREE.SphereGeometry(0.07, 16, 12)),
        this._mat(color, opacity)
      );
      mesh.position.copy(c);
      mesh.userData.discoveryOverlay = true;
      this._add(mesh, { pulse, baseOpacity: opacity });
      return;
    }

    if (node.type === NODE_TYPES.SPHERE) {
      const r = node.radius || 1;
      const mesh = new THREE.Mesh(
        this._geo(`sph:${r.toFixed(4)}`, () => new THREE.SphereGeometry(r * 1.02, 24, 18)),
        this._mat(color, opacity * 0.22)
      );
      mesh.position.copy(c);
      mesh.userData.discoveryOverlay = true;
      this._add(mesh, { pulse, baseOpacity: opacity * 0.22 });

      const core = new THREE.Mesh(
        this._geo("pt", () => new THREE.SphereGeometry(0.06, 16, 12)),
        this._mat(color, opacity)
      );
      core.position.copy(c);
      core.userData.discoveryOverlay = true;
      this._add(core, { pulse, baseOpacity: opacity });
      return;
    }

    if (node.type === NODE_TYPES.CIRCLE) {
      const r = node.radius || 1;
      const ring = new THREE.Mesh(
        this._geo(`ring:${r.toFixed(4)}`, () => new THREE.TorusGeometry(r, 0.035, 8, 64)),
        this._mat(color, opacity)
      );
      ring.position.copy(c);
      const n = v3(node.normal) || new THREE.Vector3(0, 0, 1);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.normalize());
      ring.userData.discoveryOverlay = true;
      this._add(ring, { pulse, baseOpacity: opacity });
      return;
    }

    if (node.type === NODE_TYPES.EDGE) {
      const a = v3(node.a);
      const b = v3(node.b);
      if (!a || !b) return;
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 1e-9) return;
      const cyl = new THREE.Mesh(
        this._geo(`edge:${len.toFixed(4)}`, () => new THREE.CylinderGeometry(0.028, 0.028, len, 8)),
        this._mat(color, opacity)
      );
      cyl.position.copy(a).add(b).multiplyScalar(0.5);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      cyl.userData.discoveryOverlay = true;
      this._add(cyl, { pulse, baseOpacity: opacity });
      return;
    }

    if (node.type === NODE_TYPES.FACE && Array.isArray(node.vertices) && node.vertices.length >= 3) {
      const n = (v3(node.normal) || new THREE.Vector3(0, 0, 1)).normalize();
      const xAxis =
        Math.abs(n.y) < 0.9
          ? new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize()
          : new THREE.Vector3().crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
      const yAxis = new THREE.Vector3().crossVectors(n, xAxis).normalize();
      const origin = c.clone();
      const to2 = (p) => {
        const d = v3(p).sub(origin);
        return new THREE.Vector2(d.dot(xAxis), d.dot(yAxis));
      };
      const shape = new THREE.Shape();
      const p0 = to2(node.vertices[0]);
      shape.moveTo(p0.x, p0.y);
      for (let i = 1; i < node.vertices.length; i++) {
        const p = to2(node.vertices[i]);
        shape.lineTo(p.x, p.y);
      }
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geo, this._mat(color, opacity * 0.35));
      mesh.position.copy(origin);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      mesh.userData.discoveryOverlay = true;
      mesh.userData._ownsGeo = true;
      this._add(mesh, { pulse, baseOpacity: opacity * 0.35 });
    }
  }
}
