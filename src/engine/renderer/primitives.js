import * as THREE from "three";

/** Parametric UV sphere mesh data for the renderer (not a generator). */
export function createParametricSphere(radius, widthSegments = 20, heightSegments = 14) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let y = 0; y <= heightSegments; y += 1) {
    const v = y / heightSegments;
    const phi = v * Math.PI;
    for (let x = 0; x <= widthSegments; x += 1) {
      const u = x / widthSegments;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      positions.push(radius * nx, radius * ny, radius * nz);
      normals.push(nx, ny, nz);
    }
  }

  for (let y = 0; y < heightSegments; y += 1) {
    for (let x = 0; x < widthSegments; x += 1) {
      const a = y * (widthSegments + 1) + x;
      const b = a + widthSegments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Thin tube along an XY-plane circular arc (renderer primitive). */
export function createCircleArcTubeXY(center, planeRadius, tubeRadius, arcProgress = 1, radialSegments = 5) {
  const progress = Math.min(1, Math.max(0, arcProgress));
  if (progress <= 1e-6) return new THREE.BufferGeometry();

  const sweep = progress * Math.PI * 2;
  const segments = Math.max(3, Math.ceil(64 * progress));
  const [cx, cy, cz] = center;
  const positions = [];
  const normals = [];
  const indices = [];

  for (let j = 0; j <= segments; j += 1) {
    const theta = (j / segments) * sweep;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const px = cx + planeRadius * cosT;
    const py = cy + planeRadius * sinT;
    const pz = cz;

    for (let i = 0; i <= radialSegments; i += 1) {
      const v = (i / radialSegments) * Math.PI * 2;
      const nx = Math.cos(v) * cosT;
      const ny = Math.cos(v) * sinT;
      const nz = Math.sin(v);
      positions.push(px + nx * tubeRadius, py + ny * tubeRadius, pz + nz * tubeRadius);
      normals.push(nx, ny, nz);
    }
  }

  for (let j = 0; j < segments; j += 1) {
    for (let i = 0; i < radialSegments; i += 1) {
      const a = j * (radialSegments + 1) + i;
      const b = a + radialSegments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Tube between two 3D points (renderer primitive). */
export function createTubeBetween(a, b, radius, radialSegments = 5, tubularSegments = 4) {
  const start = new THREE.Vector3(a[0], a[1], a[2]);
  const end = new THREE.Vector3(b[0], b[1], b[2]);
  const axis = new THREE.Vector3().subVectors(end, start);
  const length = axis.length();
  if (length < 1e-8) return new THREE.BufferGeometry();
  axis.normalize();

  const up = Math.abs(axis.y) < 0.999 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3().crossVectors(axis, up).normalize();
  const bitangent = new THREE.Vector3().crossVectors(axis, tangent).normalize();

  const positions = [];
  const normals = [];
  const indices = [];

  for (let j = 0; j <= tubularSegments; j += 1) {
    const t = j / tubularSegments;
    const center = new THREE.Vector3().lerpVectors(start, end, t);
    for (let i = 0; i <= radialSegments; i += 1) {
      const theta = (i / radialSegments) * Math.PI * 2;
      const normal = new THREE.Vector3()
        .addScaledVector(tangent, Math.cos(theta))
        .addScaledVector(bitangent, Math.sin(theta))
        .normalize();
      positions.push(
        center.x + normal.x * radius,
        center.y + normal.y * radius,
        center.z + normal.z * radius
      );
      normals.push(normal.x, normal.y, normal.z);
    }
  }

  for (let j = 0; j < tubularSegments; j += 1) {
    for (let i = 0; i < radialSegments; i += 1) {
      const aIdx = j * (radialSegments + 1) + i;
      const bIdx = aIdx + radialSegments + 1;
      indices.push(aIdx, bIdx, aIdx + 1, bIdx, bIdx + 1, aIdx + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Flat rectangular construction plane in XY (z = 0). */
export function createConstructionPlaneXY(size) {
  const h = size / 2;
  const positions = [-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const indices = [0, 1, 2, 0, 2, 3];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}
