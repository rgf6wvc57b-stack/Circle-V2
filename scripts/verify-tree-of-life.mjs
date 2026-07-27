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

for (const [name, data] of [
  ["Traditional", traditional],
  ["Spatial", spatial],
  ["Geometric", geometric],
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
  assert(seph.every((p) => Math.abs(p.z) < 1e-12), `${name}: Sephirot are coplanar (z=0)`);
  const cx = seph.reduce((s, p) => s + p.x, 0) / 10;
  const cy = seph.reduce((s, p) => s + p.y, 0) / 10;
  assert(Math.hypot(cx, cy) < 1e-5, `${name}: centroid at origin`);
}

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

// Traditional must include circle centers for all Sephirot AND path edges
assert(traditional.circleCenters.length >= 10, "Traditional has Sephirot circles");
assert(traditional.edges.filter((e) => e.meta?.kind === "treePath").length === 22, "Traditional emits 22 path edges");

// Spatial uses same coords as Traditional
for (const id of SEPHIROT_IDS) {
  const a = traditional.points.find((p) => p.id === id);
  const b = spatial.points.find((p) => p.id === id);
  const c = geometric.points.find((p) => p.id === id);
  assert(
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-9,
    `Spatial preserves Traditional coordinates for ${id}`
  );
  assert(
    Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z) < 1e-9,
    `Geometric preserves Traditional coordinates for ${id}`
  );
}

// Geometric must NOT use hex packing displacement — coords match Traditional
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
