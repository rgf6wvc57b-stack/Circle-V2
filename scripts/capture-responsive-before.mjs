/**
 * Capture pre-fix study layout screenshots at tablet/phone viewports.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = "/opt/cursor/artifacts/screenshots";
mkdirSync(outDir, { recursive: true });

const port = "4313";
const base = `http://127.0.0.1:${port}/`;
const preview = spawn(
  process.execPath,
  [join(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", port],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
);

const viewports = [
  { name: "ipad-landscape", width: 2048, height: 1536 },
  { name: "ipad-portrait", width: 1536, height: 2048 },
  { name: "iphone-portrait", width: 1179, height: 2556 },
];

try {
  await waitForServer(base);
  const puppeteer = createRequire(import.meta.url)("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem("geometry-explor:show-intro-on-open", "0");
  });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__studyTestHooks, { timeout: 15000 });
  await page.click("#studyModeEnabled");
  await sleep(800);
  await page.select("#studySelect", "dimensional-relationships");
  await sleep(800);

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await sleep(700);
    const path = join(outDir, `study-dimensional-${vp.name}-before.png`);
    await page.screenshot({ path, fullPage: false });
    console.log("Saved:", path);
  }

  await browser.close();
} finally {
  preview.kill("SIGTERM");
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
