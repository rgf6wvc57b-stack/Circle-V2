/**
 * Capture study mode screenshots and exported poster for PR artifacts.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = "/opt/cursor/artifacts/screenshots";
mkdirSync(outDir, { recursive: true });

const port = "4312";
const base = `http://127.0.0.1:${port}/`;
const preview = spawn(
  process.execPath,
  [join(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", port],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
);

try {
  await waitForServer(base);
  const puppeteer = createRequire(import.meta.url)("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem("geometry-explor:show-intro-on-open", "0");
  });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__studyTestHooks, { timeout: 15000 });

  await page.click("#studyModeEnabled");
  await sleep(1000);
  await page.screenshot({ path: join(outDir, "study-merkaba.png"), fullPage: false });

  await page.select("#studySelect", "dimensional-relationships");
  await sleep(900);
  await page.screenshot({ path: join(outDir, "study-dimensional.png"), fullPage: false });

  const posterBytes = await page.evaluate(async () => {
    const blob = await window.__studyTestHooks.exportPosterBlob({ scale: 2, includeExportMarker: false });
    const buf = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buf));
  });
  writeFileSync(join(outDir, "study-poster-export.png"), Buffer.from(posterBytes));

  await browser.close();
  console.log("Saved:", join(outDir, "study-merkaba.png"));
  console.log("Saved:", join(outDir, "study-dimensional.png"));
  console.log("Saved:", join(outDir, "study-poster-export.png"));
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
