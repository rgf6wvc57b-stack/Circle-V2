import { createEmptyConstruction } from "../schema.js";

export const CONCENTRIC_SHELL_MIN = 0;
export const CONCENTRIC_SHELL_MAX = 3;
export const CONCENTRIC_SHELL_DEFAULT = 3;
export const EXPLODE_SHELLS_MIN = 0;
export const EXPLODE_SHELLS_MAX = 2;
export const EXPLODE_SHELLS_DEFAULT = 0;

export const CONCENTRIC_SHELL_COLORS = Object.freeze([
  "#FFD166",
  "#EF476F",
  "#06D6A0",
  "#4D96FF",
]);

export const CONCENTRIC_SHELL_COUNTS = Object.freeze([1, 6, 12, 8]);

export function clampConcentricShellCount(value) {
  const n = Number.isFinite(Number(value)) ? Math.round(Number(value)) : CONCENTRIC_SHELL_DEFAULT;
  return Math.min(CONCENTRIC_SHELL_MAX, Math.max(CONCENTRIC_SHELL_MIN, n));
}

export function clampExplodeShells(value) {
  const n = Number.isFinite(Number(value)) ? Number(value) : EXPLODE_SHELLS_DEFAULT;
  return Math.min(EXPLODE_SHELLS_MAX, Math.max(EXPLODE_SHELLS_MIN, n));
}

export function concentricSphereCount(shellCount) {
  const count = clampConcentricShellCount(shellCount);
  return CONCENTRIC_SHELL_COUNTS.slice(0, count + 1).reduce((sum, n) => sum + n, 0);
}

function coordinateToken(value) {
  if (value < 0) return "n1";
  if (value > 0) return "p1";
  return "z0";
}

/**
 * Generate the center sphere plus complete cubic-lattice distance shells.
 *
 * Shell membership is mathematical: integer lattice coordinates (x,y,z) in
 * {-1,0,1} have shell index x²+y²+z². With center spacing 2r, every member of
 * shell s is therefore exactly 2r√s from the origin before explosion.
 *
 * @param {number} radius sphere radius
 * @param {{ shellCount?: number, explodeShells?: number }} [opts]
 */
export function generateConcentricShells(radius, opts = {}) {
  const shellCount = clampConcentricShellCount(
    opts.shellCount ?? CONCENTRIC_SHELL_DEFAULT
  );
  const explodeShells = clampExplodeShells(
    opts.explodeShells ?? EXPLODE_SHELLS_DEFAULT
  );
  const data = createEmptyConstruction(
    "concentricShells",
    "3D Cubic Sphere Lattice",
    radius
  );
  const centerSpacing = radius * 2;
  const shellMetadata = [];

  for (let shell = 0; shell <= shellCount; shell += 1) {
    let members = 0;

    // Positions come from the complete cubic lattice neighborhood. Iterating
    // all signs on X, Y, and Z guarantees opposite pairs and an exact centroid
    // at world origin instead of producing a flat XY approximation.
    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (let z = -1; z <= 1; z += 1) {
          if (x * x + y * y + z * z !== shell) continue;

          const token = `${coordinateToken(x)}-${coordinateToken(y)}-${coordinateToken(z)}`;
          const pointId = shell === 0 ? "origin" : `shell-${shell}-${token}`;
          const sphereId = shell === 0 ? "sphere-origin" : `sphere-${pointId}`;
          const baseX = x * centerSpacing;
          const baseY = y * centerSpacing;
          const baseZ = z * centerSpacing;
          const baseDistance = Math.hypot(baseX, baseY, baseZ);

          let px = baseX;
          let py = baseY;
          let pz = baseZ;
          let explodeDistance = 0;

          if (shell > 0 && baseDistance > 0) {
            // Explosion preserves each shell: all members receive the same
            // radial displacement, applied along their normalized direction
            // from the origin. The center has no direction and never moves.
            explodeDistance = explodeShells * radius * shell;
            px += (baseX / baseDistance) * explodeDistance;
            py += (baseY / baseDistance) * explodeDistance;
            pz += (baseZ / baseDistance) * explodeDistance;
          }

          const centerDistance = baseDistance + explodeDistance;
          data.points.push({
            id: pointId,
            x: px,
            y: py,
            z: pz,
            label: shell === 0 ? "center" : `shell ${shell}`,
            step: shell + 1,
            meta: {
              role: shell === 0 ? "origin" : "shellCenter",
              shell,
              lattice: [x, y, z],
              baseCenterDistance: baseDistance,
              centerDistance,
            },
          });
          data.sphereCenters.push({
            id: sphereId,
            pointId,
            radius,
            meta: {
              shell,
              shellColor: CONCENTRIC_SHELL_COLORS[shell],
            },
          });
          members += 1;
        }
      }
    }

    shellMetadata.push({
      shell,
      squaredLatticeDistance: shell,
      baseCenterDistance: centerSpacing * Math.sqrt(shell),
      centerDistance:
        shell === 0
          ? 0
          : centerSpacing * Math.sqrt(shell) + explodeShells * radius * shell,
      count: members,
      color: CONCENTRIC_SHELL_COLORS[shell],
    });
  }

  data.maxStep = shellCount + 1;
  data.meta = {
    sphereBased: true,
    true3D: true,
    shellCount,
    explodeShells,
    centerSpacing,
    shells: shellMetadata,
  };
  return data;
}
