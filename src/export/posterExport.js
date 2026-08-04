/**
 * High-resolution poster export compositing WebGL canvas + HTML overlay.
 */
import * as THREE from "three";

/** Deterministic marker used by export verification (inline-styled for SVG compositing). */
export const POSTER_EXPORT_MARKER = Object.freeze({
  color: "#ff00aa",
  rgb: [255, 0, 170],
  top: 8,
  left: 8,
  size: 24,
});

/**
 * @param {object} opts
 * @param {THREE.WebGLRenderer} opts.renderer
 * @param {THREE.Scene} opts.scene
 * @param {THREE.Camera} opts.camera
 * @param {HTMLElement} opts.posterRoot
 * @param {HTMLElement} opts.appRoot
 * @param {number} [opts.scale]
 * @param {string} [opts.filename]
 * @param {boolean} [opts.download]
 * @param {boolean} [opts.forceHtmlCompositeFailure] Test hook: simulate HTML compositing failure.
 * @param {boolean} [opts.includeExportMarker] Test hook: inject verification marker into export composite only.
 */
export async function exportPosterPng({
  renderer,
  scene,
  camera,
  posterRoot,
  appRoot,
  scale = 3,
  filename = "geometry-study-poster.png",
  download = true,
  forceHtmlCompositeFailure = false,
  includeExportMarker = false,
}) {
  const viewport = renderer.domElement;
  const rect = appRoot.getBoundingClientRect();
  const outW = Math.round(rect.width * scale);
  const outH = Math.round(rect.height * scale);

  const prevPixelRatio = renderer.getPixelRatio();
  const prevCssSize = new THREE.Vector2();
  renderer.getSize(prevCssSize);
  const prevAspect = camera.aspect;

  let wrap = null;

  try {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = outW;
    exportCanvas.height = outH;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not create export canvas");

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, outW, outH);

    renderer.setPixelRatio(1);
    renderer.setSize(outW, outH, false);
    camera.aspect = outW / outH;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    ctx.drawImage(viewport, 0, 0, outW, outH);

    try {
      if (forceHtmlCompositeFailure) {
        throw new Error("Forced HTML composite failure (test)");
      }
      const posterHtml = posterRoot.cloneNode(true);
      copyPosterCanvases(posterRoot, posterHtml);
      if (includeExportMarker) {
        injectExportMarker(posterHtml);
      }
      posterHtml.hidden = false;
      wrap = document.createElement("div");
      wrap.dataset.posterExportWrap = "true";
      wrap.style.cssText = `width:${rect.width}px;height:${rect.height}px;background:#050505;color:#f0e6c8;font-family:Georgia,serif;position:relative;`;
      wrap.appendChild(posterHtml);
      document.body.appendChild(wrap);
      const htmlCanvas = await htmlToCanvas(wrap, outW, outH);
      if (htmlCanvas && !isCanvasTainted(htmlCanvas) && !isCanvasBlank(htmlCanvas)) {
        ctx.drawImage(htmlCanvas, 0, 0);
      } else {
        compositeDomOverlay(ctx, posterRoot, appRoot, outW, outH, { includeExportMarker });
      }
    } catch {
      compositeDomOverlay(ctx, posterRoot, appRoot, outW, outH, { includeExportMarker });
    }

    const blob = await canvasToBlob(exportCanvas);
    if (download) {
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return blob;
  } finally {
    if (wrap?.parentNode) {
      wrap.parentNode.removeChild(wrap);
    }
    renderer.setPixelRatio(prevPixelRatio);
    renderer.setSize(prevCssSize.x, prevCssSize.y, false);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
}

function injectExportMarker(root) {
  const poster = root.querySelector(".study-poster") ?? root;
  const marker = document.createElement("div");
  marker.dataset.exportMarker = "true";
  marker.setAttribute("aria-hidden", "true");
  marker.style.cssText = `position:absolute;top:${POSTER_EXPORT_MARKER.top}px;left:${POSTER_EXPORT_MARKER.left}px;width:${POSTER_EXPORT_MARKER.size}px;height:${POSTER_EXPORT_MARKER.size}px;background:${POSTER_EXPORT_MARKER.color};z-index:9999;pointer-events:none;`;
  poster.prepend(marker);
  return marker;
}

function copyPosterCanvases(sourceRoot, cloneRoot) {
  const srcCanvases = sourceRoot.querySelectorAll("canvas");
  const dstCanvases = cloneRoot.querySelectorAll("canvas");
  srcCanvases.forEach((src, index) => {
    const dst = dstCanvases[index];
    if (!dst || !src.width || !src.height) return;
    dst.width = src.width;
    dst.height = src.height;
    const ctx = dst.getContext("2d");
    if (ctx) ctx.drawImage(src, 0, 0);
  });
}

function collectPosterStyles() {
  let css = "";
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.cssText && /\.study-/.test(rule.cssText)) css += `${rule.cssText}\n`;
      }
    } catch {
      // Cross-origin stylesheets are not readable.
    }
  }
  return css;
}

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Poster export failed"));
      else resolve(blob);
    }, "image/png");
  });
}

function isCanvasTainted(canvas) {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    ctx.getImageData(0, 0, 1, 1);
    return false;
  } catch {
    return true;
  }
}

function isCanvasBlank(canvas) {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    const sample = ctx.getImageData(0, 0, Math.min(canvas.width, 32), Math.min(canvas.height, 32));
    for (let i = 0; i < sample.data.length; i += 4) {
      const a = sample.data[i + 3];
      if (a > 8 && (sample.data[i] > 12 || sample.data[i + 1] > 12 || sample.data[i + 2] > 12)) {
        return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

/** Rasterize live poster DOM overlay when SVG foreignObject is blank or unavailable. */
function compositeDomOverlay(ctx, posterRoot, appRoot, outW, outH, { includeExportMarker = false } = {}) {
  const appRect = appRoot.getBoundingClientRect();
  if (!appRect.width || !appRect.height) return;
  const scaleX = outW / appRect.width;
  const scaleY = outH / appRect.height;

  if (includeExportMarker) {
    ctx.fillStyle = POSTER_EXPORT_MARKER.color;
    ctx.fillRect(
      POSTER_EXPORT_MARKER.left * scaleX,
      POSTER_EXPORT_MARKER.top * scaleY,
      POSTER_EXPORT_MARKER.size * scaleX,
      POSTER_EXPORT_MARKER.size * scaleY
    );
  }

  const title = posterRoot.querySelector(".study-title");
  if (title?.textContent) {
    const style = getComputedStyle(title);
    const r = title.getBoundingClientRect();
    const fontSize = (parseFloat(style.fontSize) || 24) * scaleY;
    ctx.fillStyle = style.color || "#d4af37";
    ctx.font = `${style.fontWeight || 600} ${fontSize}px ${style.fontFamily || "Georgia, serif"}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      title.textContent.trim(),
      (r.left - appRect.left + r.width / 2) * scaleX,
      (r.top - appRect.top + r.height / 2) * scaleY
    );
  }

  posterRoot.querySelectorAll(".study-mini-canvas").forEach((canvas) => {
    if (!canvas.width || !canvas.height) return;
    const r = canvas.getBoundingClientRect();
    ctx.drawImage(
      canvas,
      (r.left - appRect.left) * scaleX,
      (r.top - appRect.top) * scaleY,
      r.width * scaleX,
      r.height * scaleY
    );
  });
}

async function htmlToCanvas(element, width, height) {
  const posterCss = collectPosterStyles();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml">
        <style>${escapeXml(posterCss)}</style>
        ${element.outerHTML}
      </div>
    </foreignObject>
  </svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
