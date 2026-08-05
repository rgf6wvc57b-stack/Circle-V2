/**
 * Spatial Tree layout — pillar-based Z depth (3 distinct levels).
 * Severity (−Z), Middle (0), Mercy (+Z). Distinct from full volumetric layering.
 */

const SEVERITY_PILLAR = new Set(["binah", "geburah", "hod"]);
const MERCY_PILLAR = new Set(["chokmah", "chesed", "netzach"]);

/**
 * @param {{ id: string, x: number, y: number, z?: number }[]} sephirot
 * @param {number} radius
 * @param {number} [depthRatio=0.22]
 */
export function applyPillarDepth(sephirot, radius, depthRatio = 0.22) {
  const depth = radius * depthRatio;
  return sephirot.map((s) => {
    let z = 0;
    if (SEVERITY_PILLAR.has(s.id)) z = -depth;
    else if (MERCY_PILLAR.has(s.id)) z = depth;
    return { ...s, z };
  });
}

/**
 * Re-center Sephirot so geometric centroid is at the origin (all axes).
 * @param {{ x: number, y: number, z: number }[]} sephirot
 */
export function centerSephirot(sephirot) {
  const n = sephirot.length || 1;
  const cx = sephirot.reduce((sum, p) => sum + p.x, 0) / n;
  const cy = sephirot.reduce((sum, p) => sum + p.y, 0) / n;
  const cz = sephirot.reduce((sum, p) => sum + p.z, 0) / n;
  return sephirot.map((s) => ({
    ...s,
    x: s.x - cx,
    y: s.y - cy,
    z: s.z - cz,
  }));
}

/**
 * @param {{ z: number }[]} sephirot
 */
export function spatialZStats(sephirot) {
  const zValues = sephirot.map((s) => s.z);
  const distinct = [...new Set(zValues.map((z) => Math.round(z * 1000) / 1000))];
  return {
    min: Math.min(...zValues),
    max: Math.max(...zValues),
    range: Math.max(...zValues) - Math.min(...zValues),
    distinctLevels: distinct.length,
  };
}
