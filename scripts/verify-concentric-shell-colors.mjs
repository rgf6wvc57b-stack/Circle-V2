/**
 * Browser-level shell color selection, override, info, and reset checks.
 * Run: node scripts/verify-concentric-shell-colors.mjs
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { CONCENTRIC_SHELL_COLORS } from "../src/engine/generators/concentricShells.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const port = "4297";
const base = `http://127.0.0.1:${port}/`;
let failed = 0;

function assert(condition, message, detail = "") {
  if (condition) {
    console.log("PASS:", message, detail ? `— ${detail}` : "");
  } else {
    failed += 1;
    console.error("FAIL:", message, detail ? `— ${detail}` : "");
  }
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const process = spawn(command, args, { cwd: root, stdio: "inherit" });
    process.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))
    );
  });
}

async function ensurePuppeteer() {
  const require = createRequire(import.meta.url);
  try {
    return require("puppeteer-core");
  } catch {
    await run("npm", ["install", "--no-save", "puppeteer-core@latest"]);
    return createRequire(import.meta.url)("puppeteer-core");
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await sleep(250);
  }
  throw new Error(`Preview did not start at ${base}`);
}

async function selectVisibleShellSphere(page) {
  const candidates = [];
  for (let radius = 0; radius <= 240; radius += 30) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      candidates.push({
        x: 460 + Math.cos(angle) * radius,
        y: 390 + Math.sin(angle) * radius,
      });
    }
  }

  for (const point of candidates) {
    await page.mouse.click(point.x, point.y);
    await sleep(30);
    const selectedId = await page.$eval(
      "#selectedSphereLabel",
      (element) => element.textContent.match(/\((sphere-shell-[^)]+)\)$/)?.[1] ?? null
    );
    if (selectedId) return selectedId;
  }
  return null;
}

await run("npm", ["run", "build"]);
const preview = spawn(
  process.execPath,
  [
    join(root, "node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    port,
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
);

try {
  await waitForServer();
  const puppeteer = await ensurePuppeteer();
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|font/i.test(message.text())) {
      runtimeErrors.push(message.text());
    }
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem("geometry-explor:show-intro-on-open", "0");
  });
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.select("#geometry", "concentricShells");
  await sleep(1000);

  const selectedId = await selectVisibleShellSphere(page);
  assert(Boolean(selectedId), "selecting a rendered shell sphere stores its sphere id");

  const shell = Number(selectedId?.match(/^sphere-shell-(\d)-/)?.[1]);
  const shellDefault = CONCENTRIC_SHELL_COLORS[shell]?.toLowerCase();
  const selectedState = await page.evaluate(() => ({
    controlColor: document.getElementById("individualSphereColor").value.toLowerCase(),
    info: document.getElementById("sphereInfoPanel").textContent,
  }));
  assert(
    selectedState.controlColor === shellDefault,
    "selected sphere control shows its shell default",
    `${selectedState.controlColor} for shell ${shell}`
  );
  assert(
    selectedState.info.toLowerCase().includes(shellDefault),
    "sphere info reports the selected shell default",
    shellDefault
  );

  const override = "#123456";
  await page.$eval(
    "#individualSphereColor",
    (element, color) => {
      element.value = color;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    },
    override
  );
  await sleep(150);
  const overriddenState = await page.evaluate(() => ({
    controlColor: document.getElementById("individualSphereColor").value.toLowerCase(),
    info: document.getElementById("sphereInfoPanel").textContent.toLowerCase(),
  }));
  assert(
    overriddenState.controlColor === override,
    "individual override is shown in the controls"
  );
  assert(
    overriddenState.info.includes(override),
    "sphere info reports the same individual override"
  );

  await page.$eval("#resetSphereColor", (element) => element.click());
  await sleep(150);
  const resetState = await page.evaluate(() => ({
    controlColor: document.getElementById("individualSphereColor").value.toLowerCase(),
    info: document.getElementById("sphereInfoPanel").textContent.toLowerCase(),
  }));
  assert(
    resetState.controlColor === shellDefault,
    "individual reset restores the shell default in controls"
  );
  assert(
    resetState.info.includes(shellDefault),
    "individual reset restores the shell default in sphere info"
  );

  const globalOverride = "#abcdef";
  await page.select("#sphereColorMode", "global");
  await page.$eval(
    "#globalSphereColor",
    (element, color) => {
      element.value = color;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    },
    globalOverride
  );
  await sleep(150);
  const globalInfo = await page.$eval(
    "#sphereInfoPanel",
    (element) => element.textContent.toLowerCase()
  );
  assert(globalInfo.includes(globalOverride), "global mode still controls sphere info color");

  await page.select("#sphereColorMode", "individual");
  await sleep(150);
  const restoredIndividual = await page.evaluate(() => ({
    controlColor: document.getElementById("individualSphereColor").value.toLowerCase(),
    info: document.getElementById("sphereInfoPanel").textContent.toLowerCase(),
  }));
  assert(
    restoredIndividual.controlColor === shellDefault &&
      restoredIndividual.info.includes(shellDefault),
    "returning to individual mode preserves the shell default"
  );
  assert(runtimeErrors.length === 0, "browser test has no runtime errors", runtimeErrors[0]);

  await browser.close();
} finally {
  preview.kill("SIGTERM");
  if (preview.exitCode == null) {
    await Promise.race([
      new Promise((resolve) => preview.once("exit", resolve)),
      sleep(2000),
    ]);
  }
  if (preview.exitCode == null) preview.kill("SIGKILL");
}

if (failed > 0) {
  console.error(`\n${failed} shell-color assertion(s) failed`);
  process.exit(1);
}

console.log("\nAll concentric-shell color UI checks passed.");
