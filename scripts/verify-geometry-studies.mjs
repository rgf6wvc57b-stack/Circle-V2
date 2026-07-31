/**
 * Geometry study / poster engine verification.
 * Run: node scripts/verify-geometry-studies.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { STUDY_REGISTRY, getStudyById } from "../src/studies/registry.js";
import { stellatedOctahedron, vesicaPiscisConstruction } from "../src/geometry/solids/catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
let failed = 0;

function assert(condition, message, detail = "") {
  if (condition) console.log("PASS:", message, detail ? `— ${detail}` : "");
  else {
    failed += 1;
    console.error("FAIL:", message, detail ? `— ${detail}` : "");
  }
}

assert(STUDY_REGISTRY.length === 2, "study registry has two studies");
assert(getStudyById("merkaba-stellated-octahedron"), "merkaba study registered");
assert(getStudyById("dimensional-relationships"), "dimensional study registered");

const merkaba = stellatedOctahedron(1);
assert(merkaba.vertices.length === 8, "stellated octahedron has 8 vertices");
assert(merkaba.edges.length === 12, "stellated octahedron has 12 edges");
assert(merkaba.triFaces.length === 8, "stellated octahedron has 8 triangular faces");

const vesica = vesicaPiscisConstruction(1);
assert(vesica.squareVerts.length === 4, "vesica construction includes inscribed square");
assert(Math.abs(vesica.width - 1) < 1e-9, "vesica width matches radius");

const html = readFileSync(join(root, "index.html"), "utf8");
assert(/Geometry Studies/.test(html), "study UI section present");
assert(/studyModeEnabled/.test(html), "study mode toggle present");
assert(/studyExportPoster/.test(html), "poster export button present");

const main = readFileSync(join(root, "src/main.js"), "utf8");
assert(/StudyController/.test(main), "StudyController wired in main.js");
assert(/studyGroup/.test(main), "study group added to scene");

await run("npm", ["run", "build"]);

const port = "4311";
const base = `http://127.0.0.1:${port}/`;
const preview = spawn(
  process.execPath,
  [join(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", port],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
);

try {
  await waitForServer(base);
  const puppeteer = await ensurePuppeteer();
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem("geometry-explor:show-intro-on-open", "0");
  });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });

  await page.click("#studyModeEnabled");
  await sleep(800);
  const merkabaActive = await page.evaluate(() => ({
    studyOn: document.getElementById("studyModeEnabled").checked,
    posterVisible: !document.getElementById("studyPosterRoot").hidden,
    title: document.querySelector(".study-title")?.textContent ?? "",
  }));
  assert(merkabaActive.studyOn, "study mode enables");
  assert(merkabaActive.posterVisible, "poster overlay visible");
  assert(/Merkaba|Stellated/i.test(merkabaActive.title), "merkaba study title shown", merkabaActive.title);

  await page.select("#studySelect", "dimensional-relationships");
  await sleep(600);
  const dimensional = await page.$eval(".study-title", (el) => el.textContent);
  assert(/Dimensional Relationships/i.test(dimensional), "dimensional study loads");

  await page.click("#studyPosterMode");
  await sleep(300);
  assert(await page.evaluate(() => document.getElementById("app").classList.contains("study-poster-mode")), "poster mode class applied");

  await page.click("#studyPosterMode");
  await sleep(200);
  await page.click("#studyModeEnabled");
  await sleep(500);
  const restored = await page.evaluate(() => !document.getElementById("studyModeEnabled").checked);
  assert(restored, "study mode can be disabled");

  assert(errors.length === 0, "browser study test has no runtime errors", errors[0]);
  await browser.close();
} finally {
  preview.kill("SIGTERM");
}

if (failed > 0) {
  console.error(`\n${failed} geometry-study assertion(s) failed`);
  process.exit(1);
}

console.log("\nAll geometry study checks passed.");

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd: root, stdio: "inherit" });
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

async function ensurePuppeteer() {
  const require = createRequire(import.meta.url);
  try {
    return require("puppeteer-core");
  } catch {
    await run("npm", ["install", "--no-save", "puppeteer-core@24"]);
    return createRequire(import.meta.url)("puppeteer-core");
  }
}

async function waitForServer(url) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // waiting
    }
    await sleep(250);
  }
  throw new Error(`Server did not start at ${url}`);
}
