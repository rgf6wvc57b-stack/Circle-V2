/**
 * Tree of Life mode validation — Traditional / Spatial / Geometric.
 * Also writes a front-facing SVG fixture for visual verification.
 * Run: node scripts/verify-tree-of-life.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateTreeOfLife } from "../src/engine/generators/index.js";
import {
  buildCanonicalTreeGraph,
  treeConnectivityFingerprint,
  SEPHIROT_IDS,
} from "../src/engine/treeOfLife/graph.js";
import { traditionalPaths } from "../src/engine/treeOfLife/layout.js";
import { spatialZStats } from "../src/engine/treeOfLife/spatialLayout.js";
import { volumetricZStats } from "../src/engine/treeOfLife/volumetricLayout.js";
import { buildGeometricTreeLayout } from "../src/engine/treeOfLife/geometricLayout.js";
import { intersectCirclesEqualRadius, circlesCoplanar, CIRCLE_INTERSECTION_Z_EPS } from "../src/engine/construction/compass.js";
import { RENDER_MODES } from "../src/engine/renderer/GeometryRenderer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

const r = 1.2;
const PATHS = traditionalPaths();

function sephirotOf(data) {
  return data.points.filter((p) => p.meta?.role === "sephirah");
}
function treePathsOf(data) {
  return data.edges.filter((e) => e.meta?.kind === "treePath");
}
function connectivityOf(data) {
  const nodes = sephirotOf(data)
    .map((s) => s.id)
    .sort()
    .join(",");
  const edges = treePathsOf(data)
    .map((p) => [p.from, p.to].sort().join("-"))
    .sort()
    .join("|");
  return `${nodes}::${edges}`;
}

assert(
  RENDER_MODES.traditionalTreeOfLife === "traditionalTreeOfLife",
  "RENDER_MODES includes traditionalTreeOfLife"
);
assert(
  RENDER_MODES.geometricTreeOfLife === "geometricTreeOfLife",
  "RENDER_MODES includes geometricTreeOfLife"
);

const graph = buildCanonicalTreeGraph(r);
assert(graph.sephirot.length === 10, "Canonical graph: 10 Sephirot");
assert(graph.paths.length === 22, "Canonical graph: 22 paths");
assert(
  graph.paths.every((p) => SEPHIROT_IDS.includes(p.from) && SEPHIROT_IDS.includes(p.to)),
  "Every canonical path connects valid Sephirot"
);
const canonFp = treeConnectivityFingerprint(graph);

const traditional = generateTreeOfLife(r, { viewMode: "traditional" });
const spatial = generateTreeOfLife(r, { viewMode: "spatial" });
const geometric = generateTreeOfLife(r, {
  viewMode: "geometric",
  geometricFlags: {
    showTree: true,
    showConstructionGeometry: true,
    showFlowerOverlay: false,
    showIntersections: true,
    showSymmetryAxes: true,
  },
});
const volumetric = generateTreeOfLife(r, {
  viewMode: "volumetric",
  volumetric: { zSpacing: 0.42, layers: 5 },
});

for (const [name, data] of [
  ["Traditional", traditional],
  ["Spatial", spatial],
  ["Geometric", geometric],
  ["Volumetric", volumetric],
]) {
  const seph = sephirotOf(data);
  const paths = treePathsOf(data);
  assert(seph.length === 10, `${name}: 10 Sephirot (got ${seph.length})`);
  assert(paths.length === 22, `${name}: 22 paths (got ${paths.length})`);
  assert(
    paths.every((p) => SEPHIROT_IDS.includes(p.from) && SEPHIROT_IDS.includes(p.to)),
    `${name}: every path connects valid Sephirot`
  );
  assert(paths.every((p) => p.label), `${name}: every path has a label`);
  assert(seph.every((p) => p.label), `${name}: every Sephirah has a label`);
  const cx = seph.reduce((s, p) => s + p.x, 0) / 10;
  const cy = seph.reduce((s, p) => s + p.y, 0) / 10;
  const cz = seph.reduce((s, p) => s + p.z, 0) / 10;
  assert(Math.hypot(cx, cy, cz) < 1e-4, `${name}: centroid at origin`);
}

const tradSephirot = sephirotOf(traditional);
assert(tradSephirot.every((p) => Math.abs(p.z) < 1e-12), "Traditional: Sephirot are coplanar (z=0)");
assert(traditional.circleCenters.length >= 10, "Traditional has Sephirot circles");
assert(traditional.meta.layoutKind === undefined || traditional.meta.viewMode === "traditional");

const spatialStats = spatialZStats(sephirotOf(spatial));
assert(spatialStats.distinctLevels >= 3, "Spatial: at least three Z levels", String(spatialStats.distinctLevels));
assert(spatialStats.range > 0.2, "Spatial: meaningful pillar depth", spatialStats.range.toFixed(3));
assert(spatial.circleCenters.length === 0, "Spatial: no planar circle overlays");

const geoSephirot = sephirotOf(geometric);
const geoZ = [...new Set(geoSephirot.map((p) => Math.round(p.z * 1000) / 1000))];
assert(geoZ.length >= 3, "Geometric: layered Z depth", String(geoZ.length));
assert(
  geoSephirot.some((p) => Math.abs(p.z) > 0.05),
  "Geometric: Sephirot use non-zero Z"
);

const volStats = volumetricZStats(sephirotOf(volumetric));
assert(volStats.distinctLevels >= 3, "Volumetric: at least three Z levels");
assert(volStats.range > 0.5, "Volumetric: substantial Z range");

assert(
  connectivityOf(traditional) === connectivityOf(spatial),
  "Traditional and Spatial use identical graph connectivity"
);
assert(
  connectivityOf(traditional) === connectivityOf(geometric),
  "Geometric preserves the same graph connectivity as Traditional"
);
assert(
  connectivityOf(traditional) === canonFp,
  "Generated modes match canonical connectivity fingerprint"
);

// Traditional and Spatial share XY graph; Spatial adds pillar Z depth
for (const id of SEPHIROT_IDS) {
  const a = traditional.points.find((p) => p.id === id);
  const b = spatial.points.find((p) => p.id === id);
  assert(
    Math.hypot(a.x - b.x, a.y - b.y) < 1e-6,
    `Spatial preserves planar XY for ${id}`
  );
  if (["binah", "geburah", "hod"].includes(id)) {
    assert(b.z < -0.05, `Spatial: ${id} on Severity pillar (−Z)`);
  } else if (["chokmah", "chesed", "netzach"].includes(id)) {
    assert(b.z > 0.05, `Spatial: ${id} on Mercy pillar (+Z)`);
  }
}

// Geometric must NOT use hex packing displacement
assert(
  geometric.meta.preservesTraditionalGraph === true,
  "Geometric meta marks traditional graph preservation"
);
assert(
  geometric.meta.packing !== "hexEqualRadius",
  "Geometric does not use hexEqualRadius packing"
);

// Geometric scaffold present when flags on
assert(
  geometric.circleCenters.some((c) => c.meta?.role === "construction"),
  "Geometric includes construction circles"
);
assert(
  geometric.points.some((p) => p.meta?.role === "intersection"),
  "Geometric includes intersection points"
);
assert(
  geometric.edges.some((e) => e.meta?.kind === "symmetryAxis"),
  "Geometric includes symmetry axes"
);

// --- Scaffold intersections: same XY plane only ---
{
  const circleR = 1.2;
  const samePlaneA = { x: 0, y: 0, z: 0.42 };
  const samePlaneB = { x: 1.5, y: 0, z: 0.42 };
  const sameHits = intersectCirclesEqualRadius(samePlaneA, samePlaneB, circleR);
  assert(sameHits.length === 2, "same-plane circles still produce intersections", String(sameHits.length));
  assert(
    sameHits.every((h) => Math.abs(h.z - 0.42) < 1e-9),
    "same-plane intersection Z matches the shared plane",
    sameHits.map((h) => h.z).join(",")
  );

  const crossA = { x: 0, y: 0, z: 0 };
  const crossB = { x: 1.5, y: 0, z: 10 };
  assert(
    !circlesCoplanar(crossA, crossB, CIRCLE_INTERSECTION_Z_EPS),
    "different-Z centers are not treated as coplanar"
  );
  const crossHits = intersectCirclesEqualRadius(crossA, crossB, circleR);
  assert(crossHits.length === 0, "different-Z parallel circles produce no intersections", String(crossHits.length));

  const layout = buildGeometricTreeLayout(r, {
    flags: { showIntersections: true, showConstructionGeometry: true },
  });
  const sephirot = layout.sephirot;
  const cr = layout.constructionRadius;
  let crossPlaneWouldIntersect = 0;
  for (let i = 0; i < sephirot.length; i += 1) {
    for (let j = i + 1; j < sephirot.length; j += 1) {
      const a = sephirot[i];
      const b = sephirot[j];
      if (circlesCoplanar(a, b, CIRCLE_INTERSECTION_Z_EPS)) continue;
      const dxy = Math.hypot(a.x - b.x, a.y - b.y);
      if (dxy <= 2 * cr + 1e-10) crossPlaneWouldIntersect += 1;
    }
  }
  assert(crossPlaneWouldIntersect >= 1, "geometric layout has cross-plane pairs that would intersect in XY");
  assert(
    layout.intersections.every((ix) =>
      sephirot.some((s) => Math.abs(ix.z - s.z) < CIRCLE_INTERSECTION_Z_EPS)
    ),
    "geometric intersections lie on a Sephirah Z plane"
  );
  for (const ix of layout.intersections) {
    const parents = sephirot.filter((s) => ix.parents?.includes(s.id));
    assert(
      parents.length === 2 && Math.abs(parents[0].z - parents[1].z) < CIRCLE_INTERSECTION_Z_EPS,
      `intersection ${ix.id} parents share a Z plane`
    );
    assert(
      Math.abs(ix.z - parents[0].z) < CIRCLE_INTERSECTION_Z_EPS,
      `intersection ${ix.id} uses parent plane Z, not averaged depth`
    );
  }

  const sephirotById = new Map(layout.sephirot.map((s) => [s.id, s]));
  const xyPathLengths = layout.paths
    .map((p) => {
      const a = sephirotById.get(p.from);
      const b = sephirotById.get(p.to);
      return Math.hypot(a.x - b.x, a.y - b.y);
    })
    .sort((a, b) => a - b);
  const expectedXYRadius = xyPathLengths[Math.floor(xyPathLengths.length / 2)];
  assert(
    Math.abs(layout.constructionRadius - expectedXYRadius) < 1e-9,
    "construction radius uses XY-only path distances",
    `${layout.constructionRadius} vs ${expectedXYRadius}`
  );

  const amplifiedById = new Map(
    layout.sephirot.map((s) => [s.id, { ...s, z: s.z * 8 }])
  );
  const amplifiedXYLengths = layout.paths
    .map((p) => {
      const a = amplifiedById.get(p.from);
      const b = amplifiedById.get(p.to);
      return Math.hypot(a.x - b.x, a.y - b.y);
    })
    .sort((a, b) => a - b);
  const amplified3DLengths = layout.paths
    .map((p) => {
      const a = amplifiedById.get(p.from);
      const b = amplifiedById.get(p.to);
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    })
    .sort((a, b) => a - b);
  const amplifiedXYRadius = amplifiedXYLengths[Math.floor(amplifiedXYLengths.length / 2)];
  const amplified3DRadius = amplified3DLengths[Math.floor(amplified3DLengths.length / 2)];
  assert(
    Math.abs(amplifiedXYRadius - layout.constructionRadius) < 1e-9,
    "amplified Z separation does not change XY construction radius",
    `${amplifiedXYRadius} vs ${layout.constructionRadius}`
  );
  assert(
    Math.abs(amplified3DRadius - amplifiedXYRadius) > 1e-6,
    "3D path median would differ when only Z is amplified",
    `${amplified3DRadius} vs ${amplifiedXYRadius}`
  );
}

// Planar traditional mode remains unchanged (coplanar z=0 construction still works)
assert(
  tradSephirot.every((p) => Math.abs(p.z) < 1e-12),
  "Traditional planar mode keeps Sephirot at z=0"
);
assert(
  intersectCirclesEqualRadius(
    { x: 0, y: 0, z: 0 },
    { x: 1.2, y: 0, z: 0 },
    r
  ).length === 2,
  "planar z=0 circle intersections still work"
);

// Flower overlay optional — off by default, on when flagged
const withFlower = generateTreeOfLife(r, {
  viewMode: "geometric",
  geometricFlags: { showFlowerOverlay: true },
});
assert(
  withFlower.points.some((p) => p.meta?.role === "flowerOverlay"),
  "Flower overlay appears only when enabled"
);
assert(
  !geometric.points.some((p) => p.meta?.role === "flowerOverlay"),
  "Flower overlay absent by default"
);

// --- Visual fixture (front-facing SVG of all three modes) ---
const fixtureDir = join(__dirname, "fixtures");
mkdirSync(fixtureDir, { recursive: true });
const fixturePath = join(fixtureDir, "tree-of-life-modes.html");

function toSvg(data, title) {
  const seph = sephirotOf(data);
  const paths = treePathsOf(data);
  const byId = new Map(seph.map((p) => [p.id, p]));
  const pad = 40;
  const xs = seph.map((p) => p.x);
  const ys = seph.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = 320;
  const h = 420;
  const sx = (w - pad * 2) / (maxX - minX || 1);
  const sy = (h - pad * 2) / (maxY - minY || 1);
  const s = Math.min(sx, sy);
  const tx = (x) => pad + (x - minX) * s + ((w - pad * 2 - (maxX - minX) * s) / 2);
  // Flip Y for SVG (screen y down); Tree has +Y toward Kether
  const ty = (y) => h - pad - (y - minY) * s - ((h - pad * 2 - (maxY - minY) * s) / 2);
  const avgR =
    data.circleCenters
      .filter((c) => (c.meta?.role || "sephirah") === "sephirah")
      .reduce((sum, c) => sum + c.radius, 0) /
    Math.max(1, seph.length);
  const cr = Math.max(8, avgR * s * 0.9);

  const pathLines = paths
    .map((p) => {
      const a = byId.get(p.from);
      const b = byId.get(p.to);
      return `<line x1="${tx(a.x)}" y1="${ty(a.y)}" x2="${tx(b.x)}" y2="${ty(b.y)}" stroke="#7c6cff" stroke-width="2" />`;
    })
    .join("\n");
  const circles = seph
    .map(
      (p) =>
        `<circle cx="${tx(p.x)}" cy="${ty(p.y)}" r="${cr}" fill="none" stroke="#3ecfbf" stroke-width="2" />
         <text x="${tx(p.x)}" y="${ty(p.y) - cr - 4}" text-anchor="middle" font-size="11" fill="#e8f2f7">${p.label}</text>`
    )
    .join("\n");

  return `<figure>
    <figcaption>${title} — ${seph.length} Sephirot, ${paths.length} paths</figcaption>
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" style="background:#0e1a24;border-radius:12px">
      ${pathLines}
      ${circles}
    </svg>
  </figure>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Tree of Life — Mode Verification</title>
  <style>
    body { margin: 0; font-family: Georgia, serif; background: #081018; color: #e8f2f7; }
    h1 { text-align: center; font-weight: 500; padding: 24px 12px 8px; }
    p { text-align: center; color: #9bb0bc; max-width: 720px; margin: 0 auto 24px; }
    main { display: flex; flex-wrap: wrap; justify-content: center; gap: 28px; padding: 12px 24px 48px; }
    figcaption { text-align: center; margin-bottom: 8px; font-size: 14px; color: #c8e4ec; }
  </style>
</head>
<body>
  <h1>Tree of Life — Front-facing mode verification</h1>
  <p>All three modes must show the same 10 Sephirot and 22 traditional paths. Geometric may add scaffold overlays; it must not relocate the Tree.</p>
  <main>
    ${toSvg(traditional, "Traditional")}
    ${toSvg(spatial, "Spatial")}
    ${toSvg(geometric, "Geometric")}
  </main>
</body>
</html>`;

writeFileSync(fixturePath, html, "utf8");
console.log("Wrote visual fixture:", fixturePath);
assert(true, "Visual verification fixture generated");

console.log(failed ? `\n${failed} failure(s)` : "\nAll Tree of Life mode checks passed.");
process.exit(failed ? 1 : 0);
