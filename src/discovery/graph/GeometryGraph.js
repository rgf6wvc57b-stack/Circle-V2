import { distance3, pointMap } from "../../engine/schema.js";
import { intersectCirclesEqualRadius } from "../../engine/construction/compass.js";
import { NODE_TYPES, REL, EPS, REL_EPS } from "./types.js";

function close(a, b, rel = REL_EPS, abs = 1e-4) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) <= Math.max(abs, rel * scale);
}

function fingerprint(data, ctx = {}) {
  if (!data) return "empty";
  return [
    data.id,
    data.radius,
    ctx.step ?? "",
    ctx.maxStep ?? "",
    data.points.map((p) => `${p.id}:${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)},${p.step}`).join("|"),
    data.sphereCenters.map((s) => `${s.id}:${s.pointId}:${s.radius}`).join("|"),
    data.circleCenters.map((c) => `${c.id}:${c.pointId}:${c.radius}`).join("|"),
    data.edges.map((e) => `${e.id}:${e.from}:${e.to}:${e.step}`).join("|"),
    data.faces.map((f) => `${f.id}:${f.pointIds.join(",")}:${f.step}`).join("|"),
  ].join(";;");
}

/**
 * Construction-independent geometry relationship graph.
 * Built purely from ConstructionData — no Seed/Flower/Tesseract special cases.
 */
export class GeometryGraph {
  constructor() {
    /** @type {Map<string, object>} */
    this.nodes = new Map();
    /** @type {Array<object>} */
    this.relations = [];
    /** @type {Map<string, Set<string>>} */
    this.adjacency = new Map();
    this.fingerprint = "empty";
    this.data = null;
    this.ctx = {};
    this.origin = { x: 0, y: 0, z: 0 };
  }

  /**
   * Incremental entry: rebuild only when fingerprint changes.
   * @param {import('../../engine/schema.js').ConstructionData|null} data
   * @param {{ step?: number, maxStep?: number }} ctx
   * @returns {{ changed: boolean, graph: GeometryGraph, ms: number }}
   */
  update(data, ctx = {}) {
    const t0 = performance.now();
    const fp = fingerprint(data, ctx);
    if (fp === this.fingerprint && this.data) {
      return { changed: false, graph: this, ms: performance.now() - t0 };
    }
    this.#rebuild(data, ctx, fp);
    return { changed: true, graph: this, ms: performance.now() - t0 };
  }

  getNode(id) {
    return this.nodes.get(id) ?? null;
  }

  nodesOfType(type) {
    return [...this.nodes.values()].filter((n) => n.type === type);
  }

  relationsOf(kind) {
    return this.relations.filter((r) => r.kind === kind);
  }

  neighbors(id) {
    return [...(this.adjacency.get(id) ?? [])];
  }

  relationsFor(id) {
    return this.relations.filter((r) => r.a === id || r.b === id);
  }

  #rebuild(data, ctx, fp) {
    this.data = data;
    this.ctx = ctx;
    this.fingerprint = fp;
    this.nodes.clear();
    this.relations = [];
    this.adjacency.clear();

    if (!data) return;

    const points = pointMap(data);
    this.#addPoints(data);
    this.#addSpheres(data, points);
    this.#addCircles(data, points);
    this.#addEdges(data, points);
    this.#addFaces(data, points);
    this.#linkHierarchy();
    this.#computeOrigin();
    this.#computeCircleRelations();
    this.#computeEdgeRelations();
    this.#addIntersectionNodes();
    this.#computeSymmetryRelations();
  }

  #addNode(node) {
    const n = {
      parentIds: [],
      childIds: [],
      adjacency: [],
      center: null,
      radius: null,
      length: null,
      label: node.id,
      step: 1,
      constructionStep: node.step ?? 1,
      ...node,
    };
    // Spec aliases: parents / children
    n.parents = n.parentIds;
    n.children = n.childIds;
    this.nodes.set(n.id, n);
    if (!this.adjacency.has(n.id)) this.adjacency.set(n.id, new Set());
    return n;
  }

  #link(a, b, kind, meta = {}) {
    if (!a || !b || a === b) return;
    const key = [a, b].sort().join("|") + ":" + kind;
    if (this.relations.some((r) => r.key === key)) return;
    const rel = { key, a, b, kind, ...meta };
    this.relations.push(rel);
    if (!this.adjacency.has(a)) this.adjacency.set(a, new Set());
    if (!this.adjacency.has(b)) this.adjacency.set(b, new Set());
    this.adjacency.get(a).add(b);
    this.adjacency.get(b).add(a);
    const na = this.nodes.get(a);
    const nb = this.nodes.get(b);
    if (na && !na.adjacency.includes(b)) na.adjacency.push(b);
    if (nb && !nb.adjacency.includes(a)) nb.adjacency.push(a);
  }

  #addParentChild(parentId, childId) {
    const p = this.nodes.get(parentId);
    const c = this.nodes.get(childId);
    if (!p || !c) return;
    if (!p.childIds.includes(childId)) p.childIds.push(childId);
    if (!c.parentIds.includes(parentId)) c.parentIds.push(parentId);
    this.#link(parentId, childId, REL.CONTAINS);
  }

  #addPoints(data) {
    data.points.forEach((p) => {
      this.#addNode({
        id: p.id,
        type: NODE_TYPES.POINT,
        constructionStep: p.step ?? 1,
        step: p.step ?? 1,
        center: { x: p.x, y: p.y, z: p.z },
        label: p.label || p.id,
        source: "point",
      });
    });
  }

  #addSpheres(data, points) {
    data.sphereCenters.forEach((s) => {
      const p = points.get(s.pointId);
      if (!p) return;
      this.#addNode({
        id: s.id,
        type: NODE_TYPES.SPHERE,
        constructionStep: p.step ?? 1,
        step: p.step ?? 1,
        center: { x: p.x, y: p.y, z: p.z },
        radius: s.radius,
        label: p.label || s.id,
        pointId: s.pointId,
        source: "sphere",
      });
    });
  }

  #addCircles(data, points) {
    data.circleCenters.forEach((c) => {
      const p = points.get(c.pointId);
      if (!p) return;
      this.#addNode({
        id: c.id,
        type: NODE_TYPES.CIRCLE,
        constructionStep: p.step ?? 1,
        step: p.step ?? 1,
        center: { x: p.x, y: p.y, z: p.z },
        radius: c.radius,
        normal: c.normal ?? [0, 0, 1],
        label: p.label || c.id,
        pointId: c.pointId,
        source: "circle",
      });
    });
  }

  #addEdges(data, points) {
    data.edges.forEach((e) => {
      const a = points.get(e.from);
      const b = points.get(e.to);
      if (!a || !b) return;
      const len = distance3(a, b);
      const dir = {
        x: b.x - a.x,
        y: b.y - a.y,
        z: b.z - a.z,
      };
      this.#addNode({
        id: e.id,
        type: NODE_TYPES.EDGE,
        constructionStep: e.step ?? Math.max(a.step ?? 1, b.step ?? 1),
        step: e.step ?? 1,
        center: {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          z: (a.z + b.z) / 2,
        },
        length: len,
        direction: dir,
        from: e.from,
        to: e.to,
        a: { x: a.x, y: a.y, z: a.z },
        b: { x: b.x, y: b.y, z: b.z },
        label: e.label || e.id,
        source: "edge",
        meta: e.meta,
      });
    });
  }

  #addFaces(data, points) {
    data.faces.forEach((f) => {
      const pts = f.pointIds.map((id) => points.get(id)).filter(Boolean);
      if (!pts.length) return;
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
      const vertices = pts.map((p) => ({ x: p.x, y: p.y, z: p.z }));
      let normal = { x: 0, y: 0, z: 1 };
      if (pts.length >= 3) {
        const ux = pts[1].x - pts[0].x;
        const uy = pts[1].y - pts[0].y;
        const uz = pts[1].z - pts[0].z;
        const vx = pts[2].x - pts[0].x;
        const vy = pts[2].y - pts[0].y;
        const vz = pts[2].z - pts[0].z;
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        normal = { x: nx / nl, y: ny / nl, z: nz / nl };
      }
      this.#addNode({
        id: f.id,
        type: NODE_TYPES.FACE,
        constructionStep: f.step ?? 1,
        step: f.step ?? 1,
        center: { x: cx, y: cy, z: cz },
        pointIds: [...f.pointIds],
        vertices,
        normal,
        label: f.id,
        source: "face",
      });
    });
  }

  #linkHierarchy() {
    this.nodesOfType(NODE_TYPES.SPHERE).forEach((s) => {
      if (s.pointId) this.#addParentChild(s.pointId, s.id);
    });
    this.nodesOfType(NODE_TYPES.CIRCLE).forEach((c) => {
      if (c.pointId) this.#addParentChild(c.pointId, c.id);
    });
    this.nodesOfType(NODE_TYPES.EDGE).forEach((e) => {
      if (e.from) this.#addParentChild(e.from, e.id);
      if (e.to) this.#addParentChild(e.to, e.id);
      this.#link(e.from, e.to, REL.INCIDENT, { via: e.id });
    });
    this.nodesOfType(NODE_TYPES.FACE).forEach((f) => {
      (f.pointIds || []).forEach((pid) => this.#addParentChild(pid, f.id));
    });
  }

  #computeOrigin() {
    const pts = this.nodesOfType(NODE_TYPES.POINT);
    const at0 = pts.find(
      (p) =>
        Math.abs(p.center.x) < EPS && Math.abs(p.center.y) < EPS && Math.abs(p.center.z) < EPS
    );
    if (at0) {
      this.origin = { ...at0.center };
      return;
    }
    if (!pts.length) {
      this.origin = { x: 0, y: 0, z: 0 };
      return;
    }
    this.origin = {
      x: pts.reduce((s, p) => s + p.center.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.center.y, 0) / pts.length,
      z: pts.reduce((s, p) => s + p.center.z, 0) / pts.length,
    };
  }

  /** Circles + spheres participate as radial objects */
  #radialNodes() {
    return [
      ...this.nodesOfType(NODE_TYPES.SPHERE),
      ...this.nodesOfType(NODE_TYPES.CIRCLE),
    ];
  }

  #computeCircleRelations() {
    const radials = this.#radialNodes();
    for (let i = 0; i < radials.length; i += 1) {
      for (let j = i + 1; j < radials.length; j += 1) {
        const a = radials[i];
        const b = radials[j];
        const d = distance3(a.center, b.center);
        const r1 = a.radius;
        const r2 = b.radius;

        if (close(r1, r2)) {
          this.#link(a.id, b.id, REL.EQUAL_RADIUS, { radius: (r1 + r2) / 2 });
        }

        if (d < Math.max(r1, r2) * 0.03) {
          if (!close(r1, r2)) {
            this.#link(a.id, b.id, REL.CONCENTRIC, { distance: d });
          }
          continue;
        }

        const ext = r1 + r2;
        const inn = Math.abs(r1 - r2);
        if (Math.abs(d - ext) / Math.max(ext, EPS) <= 0.05) {
          this.#link(a.id, b.id, REL.TANGENT, { mode: "external", distance: d });
        } else if (inn > EPS && Math.abs(d - inn) / Math.max(inn, EPS) <= 0.05) {
          this.#link(a.id, b.id, REL.TANGENT, { mode: "internal", distance: d });
        } else if (d < ext - EPS && d > inn + EPS) {
          this.#link(a.id, b.id, REL.INTERSECTS, { distance: d });
        }
      }
    }
  }

  #computeEdgeRelations() {
    const edges = this.nodesOfType(NODE_TYPES.EDGE);
    for (let i = 0; i < edges.length; i += 1) {
      for (let j = i + 1; j < edges.length; j += 1) {
        const a = edges[i];
        const b = edges[j];
        if (a.length > EPS && b.length > EPS && close(a.length, b.length)) {
          this.#link(a.id, b.id, REL.EQUAL_LENGTH, { length: (a.length + b.length) / 2 });
        }
        const da = a.direction;
        const db = b.direction;
        const la = Math.hypot(da.x, da.y, da.z);
        const lb = Math.hypot(db.x, db.y, db.z);
        if (la < EPS || lb < EPS) continue;
        const ux = da.x / la;
        const uy = da.y / la;
        const uz = da.z / la;
        const vx = db.x / lb;
        const vy = db.y / lb;
        const vz = db.z / lb;
        const dot = Math.abs(ux * vx + uy * vy + uz * vz);
        if (dot > 0.98) {
          this.#link(a.id, b.id, REL.PARALLEL, { dot });
        } else if (dot < 0.08) {
          this.#link(a.id, b.id, REL.PERPENDICULAR, { dot });
        }
      }
    }
  }

  #addIntersectionNodes() {
    const radials = this.#radialNodes().filter((n) => n.type === NODE_TYPES.SPHERE || n.type === NODE_TYPES.CIRCLE);
    // Prefer spheres; fall back to circles if no spheres
    const pool = this.nodesOfType(NODE_TYPES.SPHERE);
    const use = pool.length ? pool : this.nodesOfType(NODE_TYPES.CIRCLE);
    const seen = [];

    for (let i = 0; i < use.length; i += 1) {
      for (let j = i + 1; j < use.length; j += 1) {
        const a = use[i];
        const b = use[j];
        if (!close(a.radius, b.radius)) continue;
        const hits = intersectCirclesEqualRadius(a.center, b.center, a.radius);
        hits.forEach((h, k) => {
          const dup = seen.find((s) => distance3(s, h) < a.radius * 0.02);
          if (dup) {
            this.#link(dup.id, a.id, REL.INTERSECTS);
            this.#link(dup.id, b.id, REL.INTERSECTS);
            return;
          }
          const id = `ix-${a.id}-${b.id}-${k}`;
          this.#addNode({
            id,
            type: NODE_TYPES.INTERSECTION,
            constructionStep: Math.max(a.step, b.step),
            step: Math.max(a.step, b.step),
            center: { x: h.x, y: h.y, z: h.z },
            label: id,
            parentIds: [a.id, b.id],
            source: "intersection",
          });
          seen.push({ id, ...h });
          this.#addParentChild(a.id, id);
          this.#addParentChild(b.id, id);
          this.#link(a.id, b.id, REL.INTERSECTS, { via: id });
        });
      }
    }
  }

  #computeSymmetryRelations() {
    const pts = this.nodesOfType(NODE_TYPES.POINT);
    if (pts.length < 3) return;
    const origin = this.origin;

    // Rotational equivalents for orders 2..12
    [2, 3, 4, 5, 6, 8, 12].forEach((order) => {
      const ang = (Math.PI * 2) / order;
      pts.forEach((p) => {
        const dx = p.center.x - origin.x;
        const dy = p.center.y - origin.y;
        if (Math.hypot(dx, dy) < EPS) return;
        const rx = origin.x + dx * Math.cos(ang) - dy * Math.sin(ang);
        const ry = origin.y + dx * Math.sin(ang) + dy * Math.cos(ang);
        let best = null;
        let bestD = Infinity;
        pts.forEach((q) => {
          if (q.id === p.id) return;
          const d = Math.hypot(q.center.x - rx, q.center.y - ry);
          if (d < bestD) {
            bestD = d;
            best = q;
          }
        });
        const tol = Math.max(this.data?.radius ?? 1, 0.5) * 0.08;
        if (best && bestD <= tol) {
          this.#link(p.id, best.id, REL.ROTATIONAL_EQUIVALENT, { order, error: bestD });
        }
      });
    });

    // Mirror pairs across candidate axes every 15°
    for (let k = 0; k < 12; k += 1) {
      const theta = (k * Math.PI) / 12;
      const ux = Math.cos(theta);
      const uy = Math.sin(theta);
      pts.forEach((p) => {
        const dx = p.center.x - origin.x;
        const dy = p.center.y - origin.y;
        const proj = dx * ux + dy * uy;
        const mx = origin.x + 2 * proj * ux - dx;
        const my = origin.y + 2 * proj * uy - dy;
        let best = null;
        let bestD = Infinity;
        pts.forEach((q) => {
          if (q.id === p.id) return;
          const d = Math.hypot(q.center.x - mx, q.center.y - my);
          if (d < bestD) {
            bestD = d;
            best = q;
          }
        });
        const tol = Math.max(this.data?.radius ?? 1, 0.5) * 0.08;
        if (best && bestD <= tol) {
          this.#link(p.id, best.id, REL.MIRROR_PAIR, { angle: theta, error: bestD });
        }
      });
    }
  }
}

export { fingerprint as fingerprintConstruction };
