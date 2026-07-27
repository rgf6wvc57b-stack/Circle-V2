/**
 * True 3D concentric-shell geometry verification.
 * Run: node scripts/verify-concentric-shells.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import {
  CONCENTRIC_SHELL_COLORS,
  CONCENTRIC_SHELL_COUNTS,
  generateConcentricShells,
} from "../src/engine/generators/concentricShells.js";
import { generateGeometry, listGeometryOptions } from "../src/engine/generators/index.js";
import { ConstructionEngine } from "../src/engine/index.js";
import { CameraController } from "../src/exploration/CameraController.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const radius = 1.2;
const epsilon = 1e-9;
let failed = 0;

function assert(condition, message, detail = "") {
  if (condition) {
    console.log("PASS:", message, detail ? `— ${detail}` : "");
  } else {
    failed += 1;
    console.error("FAIL:", message, detail ? `— ${detail}` : "");
  }
}

function near(a, b, tolerance = epsilon) {
  return Math.abs(a - b) <= tolerance;
}

function centroid(points) {
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }),
    { x: 0, y: 0, z: 0 }
  );
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
    z: sum.z / points.length,
  };
}

// Shell counts 0..3 and exact center-distance membership.
let cumulative = 0;
for (let shellCount = 0; shellCount <= 3; shellCount += 1) {
  cumulative += CONCENTRIC_SHELL_COUNTS[shellCount];
  const data = generateConcentricShells(radius, { shellCount, explodeShells: 0 });
  assert(
    data.sphereCenters.length === cumulative,
    `shell count ${shellCount} has ${cumulative} spheres`
  );
  const origin = data.points.find((p) => p.id === "origin");
  assert(
    origin && origin.x === 0 && origin.y === 0 && origin.z === 0,
    `shell count ${shellCount} keeps center exactly at origin`
  );

  for (let shell = 0; shell <= shellCount; shell += 1) {
    const points = data.points.filter((p) => p.meta?.shell === shell);
    const expectedDistance = 2 * radius * Math.sqrt(shell);
    assert(
      points.length === CONCENTRIC_SHELL_COUNTS[shell],
      `shell ${shell} is complete`,
      `${points.length} members`
    );
    assert(
      points.every((p) => near(Math.hypot(p.x, p.y, p.z), expectedDistance)),
      `shell ${shell} membership is equal center distance`
    );
    const c = centroid(points);
    assert(
      near(c.x, 0) && near(c.y, 0) && near(c.z, 0),
      `shell ${shell} is centered at the origin`
    );
  }
}

// Genuine three-dimensional growth and shell color metadata.
{
  const data = generateConcentricShells(radius, { shellCount: 3, explodeShells: 0 });
  assert(
    data.points.some((p) => p.z > epsilon) && data.points.some((p) => p.z < -epsilon),
    "positive and negative Z positions are generated"
  );
  assert(
    data.points.some((p) => p.x > epsilon) &&
      data.points.some((p) => p.x < -epsilon) &&
      data.points.some((p) => p.y > epsilon) &&
      data.points.some((p) => p.y < -epsilon),
    "positive and negative X/Y positions are generated"
  );
  const colors = new Set(data.meta.shells.map((shell) => shell.color));
  assert(
    colors.size === 4 && CONCENTRIC_SHELL_COLORS.every((color) => colors.has(color)),
    "center and each shell have distinct colors"
  );
}

// Explosion remains radial, leaves the center fixed, and preserves shell equality.
{
  const base = generateConcentricShells(radius, { shellCount: 3, explodeShells: 0 });
  const exploded = generateConcentricShells(radius, { shellCount: 3, explodeShells: 2 });
  const baseById = new Map(base.points.map((p) => [p.id, p]));

  assert(
    exploded.points.find((p) => p.id === "origin")?.x === 0 &&
      exploded.points.find((p) => p.id === "origin")?.y === 0 &&
      exploded.points.find((p) => p.id === "origin")?.z === 0,
    "explosion never moves center sphere"
  );

  for (let shell = 1; shell <= 3; shell += 1) {
    const members = exploded.points.filter((p) => p.meta?.shell === shell);
    const distances = members.map((p) => Math.hypot(p.x, p.y, p.z));
    assert(
      distances.every((distance) => near(distance, distances[0])),
      `exploded shell ${shell} retains equal center distances`
    );
    assert(
      members.every((p) => {
        const b = baseById.get(p.id);
        const displacement = { x: p.x - b.x, y: p.y - b.y, z: p.z - b.z };
        const cross = {
          x: b.y * displacement.z - b.z * displacement.y,
          y: b.z * displacement.x - b.x * displacement.z,
          z: b.x * displacement.y - b.y * displacement.x,
        };
        return (
          Math.hypot(cross.x, cross.y, cross.z) < epsilon &&
          b.x * displacement.x + b.y * displacement.y + b.z * displacement.z > 0
        );
      }),
      `exploded shell ${shell} moves outward along normalized radial directions`
    );
  }
}

// Registry, construction engine, UI controls, and camera policy integration.
{
  const menu = listGeometryOptions().map((item) => item.id);
  assert(menu.includes("concentricShells"), "3D Concentric Shells appears in geometry menu");
  const generated = generateGeometry("concentricShells", radius, {
    shellCount: 2,
    explodeShells: 0,
  });
  assert(generated.sphereCenters.length === 19, "generator registry forwards shell options");

  const engine = new ConstructionEngine(new THREE.Group());
  engine.geometryId = "concentricShells";
  engine.geometryOpts = { shellCount: 3, explodeShells: 0 };
  const loaded = engine.regenerate();
  engine.setStep(engine.getMaxStep());
  assert(loaded.sphereCenters.length === 27, "construction engine loads all three shells");

  const html = readFileSync(join(root, "index.html"), "utf8");
  const main = readFileSync(join(root, "src/main.js"), "utf8");
  const camera = readFileSync(
    join(root, "src/exploration/CameraController.js"),
    "utf8"
  );
  assert(/for="shellCount">Shell Count/.test(html), "Shell Count control is present");
  assert(
    /id="shellCount"[^>]*min="0"[^>]*max="3"/.test(html),
    "Shell Count range is 0..3"
  );
  assert(/for="explodeShells">Explode Shells/.test(html), "Explode Shells control is present");
  assert(
    /id="explodeShells"[^>]*min="0"[^>]*max="2"/.test(html),
    "Explode Shells range is 0..2"
  );
  assert(/Show XYZ Axes/.test(html), "Show XYZ Axes toggle is present");
  assert(
    /bySphereId\[spec\.id\]/.test(main) &&
      /setIndividualColor\([\s\S]*?ui\.sphereColors,[\s\S]*?spec\.id,/.test(main),
    "shell defaults are keyed by sphere center id"
  );
  assert(
    /resolveSphereColor\(ui\.sphereColors,\s*center\?\.id\s*\?\?\s*sel\.id\)/.test(main),
    "sphere info resolves color by sphere center id"
  );
  assert(
    /const id = sel\.mesh\?\.userData\?\.specId \?\? sel\.pointId/.test(main),
    "shell selection prefers the sphere center id"
  );
  assert(
    /resetSphereColor\([\s\S]*?ensureConcentricShellColors\(\)/.test(main),
    "individual reset reseeds the shell default"
  );
  assert(
    /id:\s*"z"[\s\S]*?\[0,\s*0,\s*-nextLength\]/.test(main),
    "Z axis spans forward and backward"
  );
  assert(/enablePan\s*=\s*false/.test(camera), "camera panning remains disabled");
  assert(
    /maxDistance\s*=\s*450/.test(camera),
    "camera distance cap accommodates maximum exploded shells"
  );
  assert(
    /ui\.geometry === "concentricShells"[\s\S]*?box\.min\.set\(-maxAbs/.test(main),
    "concentric fit bounds are symmetrized on world origin"
  );
}

// The camera receives an origin-centered box and targets the exact origin.
{
  const dom = {
    style: {},
    clientWidth: 800,
    clientHeight: 800,
    ownerDocument: { addEventListener() {}, removeEventListener() {} },
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    getRootNode() {
      return this;
    },
  };
  const controller = new CameraController({
    scene: new THREE.Scene(),
    domElement: dom,
    aspect: 1,
  });
  controller.frameBox(
    new THREE.Box3(
      new THREE.Vector3(-8, -8, -8),
      new THREE.Vector3(8, 8, 8)
    ),
    { animate: false }
  );
  assert(
    controller.controls.target.x === 0 &&
      controller.controls.target.y === 0 &&
      controller.controls.target.z === 0,
    "automatic fit and Reset View target exact world origin"
  );
}

if (failed > 0) {
  console.error(`\n${failed} concentric-shell assertion(s) failed`);
  process.exit(1);
}

console.log("\nAll 3D concentric-shell checks passed.");
