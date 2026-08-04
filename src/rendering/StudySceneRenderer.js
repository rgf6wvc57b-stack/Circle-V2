import * as THREE from "three";
import { POSTER_PALETTE } from "./studyPalette.js";

/**
 * Renders polyhedron specs into a Three.js group with gold poster styling.
 */
export class StudySceneRenderer {
  /**
   * @param {THREE.Group} root
   * @param {import("./studyPalette.js").typeof DEFAULT_STUDY_RENDER_OPTIONS} [options]
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = { ...options };
    this.materials = this.#createMaterials();
    this.setOptions(this.options);
  }

  #createMaterials() {
    return {
      edge: new THREE.LineBasicMaterial({
        color: POSTER_PALETTE.goldLine,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
      internal: new THREE.LineBasicMaterial({
        color: POSTER_PALETTE.goldDim,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
      guide: new THREE.LineBasicMaterial({
        color: POSTER_PALETTE.goldDim,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
      faceA: new THREE.MeshBasicMaterial({
        color: POSTER_PALETTE.tetraA,
        transparent: true,
        opacity: POSTER_PALETTE.faceAlpha,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      faceB: new THREE.MeshBasicMaterial({
        color: POSTER_PALETTE.tetraB,
        transparent: true,
        opacity: POSTER_PALETTE.faceAlpha,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      faceNeutral: new THREE.MeshBasicMaterial({
        color: POSTER_PALETTE.accentPurple,
        transparent: true,
        opacity: POSTER_PALETTE.faceAlpha,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      vertex: new THREE.MeshStandardMaterial({
        color: POSTER_PALETTE.gold,
        emissive: POSTER_PALETTE.sphereEmissive,
        emissiveIntensity: 0.45,
        metalness: 0.35,
        roughness: 0.35,
        transparent: true,
        opacity: 0.92,
      }),
      vertexEmphasis: new THREE.MeshStandardMaterial({
        color: POSTER_PALETTE.textPrimary,
        emissive: POSTER_PALETTE.gold,
        emissiveIntensity: 0.65,
        metalness: 0.4,
        roughness: 0.25,
      }),
    };
  }

  setOptions(partial) {
    Object.assign(this.options, partial);
    this.materials.faceA.opacity = this.options.faceOpacity ?? POSTER_PALETTE.faceAlpha;
    this.materials.faceB.opacity = this.options.faceOpacity ?? POSTER_PALETTE.faceAlpha;
    this.materials.faceNeutral.opacity = this.options.faceOpacity ?? POSTER_PALETTE.faceAlpha;
    const lineWidth = this.options.lineWidth ?? 1.4;
    this.materials.edge.linewidth = lineWidth;
    this.materials.internal.linewidth = lineWidth * 0.85;
    this.materials.guide.linewidth = lineWidth * 0.75;
  }

  clear() {
    while (this.root.children.length) {
      const child = this.root.children[0];
      this.root.remove(child);
      child.traverse((node) => {
        node.geometry?.dispose?.();
        if (node.material) {
          if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose?.());
          else node.material.dispose?.();
        }
      });
    }
  }

  /**
   * @param {import("../geometry/primitives/polyhedron.js").PolyhedronSpec} spec
   * @param {object} opts
   */
  drawPolyhedron(spec, opts = {}) {
    const {
      scale = 1,
      position = [0, 0, 0],
      faceMaterial = "faceNeutral",
      edgeMaterial = "edge",
      vertexIndices = null,
      emphasisIndices = [],
      name = spec.id,
    } = opts;
    const group = new THREE.Group();
    group.name = name;
    group.position.set(position[0], position[1], position[2]);
    group.scale.setScalar(scale);

    const verts = spec.vertices.map((v) => new THREE.Vector3(v[0], v[1], v[2]));

    if (this.options.showFaces !== false && spec.triFaces?.length) {
      spec.triFaces.forEach((face, fi) => {
        const geometry = new THREE.BufferGeometry();
        const [a, b, c] = face;
        geometry.setFromPoints([verts[a], verts[b], verts[c]]);
        geometry.setIndex([0, 1, 2]);
        geometry.computeVertexNormals();
        const matKey = fi < (spec.triFaces.length / 2) ? faceMaterial : "faceB";
        const mesh = new THREE.Mesh(geometry, this.materials[matKey] ?? this.materials.faceNeutral);
        mesh.name = `${name}-face-${fi}`;
        mesh.renderOrder = 1;
        group.add(mesh);
      });
    }

    if (this.options.showFaces !== false && spec.quadFaces?.length) {
      spec.quadFaces.forEach((face, fi) => {
        const geometry = new THREE.BufferGeometry();
        const [a, b, c, d] = face;
        geometry.setFromPoints([verts[a], verts[b], verts[c], verts[d]]);
        geometry.setIndex([0, 1, 2, 0, 2, 3]);
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, this.materials[faceMaterial] ?? this.materials.faceNeutral);
        mesh.name = `${name}-quad-${fi}`;
        mesh.renderOrder = 1;
        group.add(mesh);
      });
    }

    if (this.options.showEdges !== false) {
      spec.edges.forEach(([a, b], ei) => {
        const geometry = new THREE.BufferGeometry().setFromPoints([verts[a], verts[b]]);
        const mat = edgeMaterial === "internal" ? this.materials.internal : this.materials.edge;
        const line = new THREE.Line(geometry, mat);
        line.name = `${name}-edge-${ei}`;
        line.renderOrder = 5;
        group.add(line);
      });
    }

    if (this.options.showVertices !== false) {
      const indices = vertexIndices ?? verts.map((_, i) => i);
      const sphereR = 0.055 * (this.options.sphereScale ?? 1) * (this.options.vertexScale ?? 1);
      indices.forEach((i) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(sphereR, 20, 20),
          emphasisIndices.includes(i) ? this.materials.vertexEmphasis : this.materials.vertex
        );
        mesh.position.copy(verts[i]);
        mesh.name = `${name}-vertex-${i}`;
        mesh.renderOrder = 10;
        group.add(mesh);
      });
    }

    this.root.add(group);
    return group;
  }

  drawCircle(center, radius, segments = 96, opts = {}) {
    const { plane = "xy", material = "guide", name = "circle" } = opts;
    const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
    const points2 = curve.getPoints(segments);
    const points3 = points2.map((p) => {
      if (plane === "xy") return new THREE.Vector3(p.x + center[0], p.y + center[1], center[2]);
      return new THREE.Vector3(p.x + center[0], center[1], p.y + center[2]);
    });
    points3.push(points3[0].clone());
    const geometry = new THREE.BufferGeometry().setFromPoints(points3);
    const line = new THREE.Line(geometry, this.materials[material] ?? this.materials.guide);
    line.name = name;
    line.renderOrder = 4;
    this.root.add(line);
    return line;
  }

  drawLine(a, b, opts = {}) {
    const { material = "edge", name = "line" } = opts;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...a),
      new THREE.Vector3(...b),
    ]);
    const line = new THREE.Line(geometry, this.materials[material] ?? this.materials.edge);
    line.name = name;
    line.renderOrder = 5;
    this.root.add(line);
    return line;
  }

  drawAxes(length = 2) {
    const axes = [
      { color: 0xff5555, from: [-length, 0, 0], to: [length, 0, 0] },
      { color: 0x55dd88, from: [0, -length, 0], to: [0, length, 0] },
      { color: 0x5588ff, from: [0, 0, -length], to: [0, 0, length] },
    ];
    axes.forEach((axis) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...axis.from),
        new THREE.Vector3(...axis.to),
      ]);
      const material = new THREE.LineBasicMaterial({ color: axis.color, transparent: true, opacity: 0.55 });
      const line = new THREE.Line(geometry, material);
      line.name = `axis-${axis.color}`;
      this.root.add(line);
    });
  }
}
