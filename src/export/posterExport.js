/**
 * High-resolution poster export compositing WebGL canvas + HTML overlay.
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
}) {
  const viewport = renderer.domElement;
  const rect = appRoot.getBoundingClientRect();
  const outW = Math.round(rect.width * scale);
  const outH = Math.round(rect.height * scale);

  const prevSize = { w: viewport.width, h: viewport.height };
  const prevPixelRatio = renderer.getPixelRatio();
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
      posterHtml.hidden = false;
      wrap = document.createElement("div");
      wrap.dataset.posterExportWrap = "true";
      wrap.style.cssText = `width:${rect.width}px;height:${rect.height}px;background:#050505;color:#f0e6c8;font-family:Georgia,serif;`;
      wrap.appendChild(posterHtml);
      document.body.appendChild(wrap);
      const htmlCanvas = await htmlToCanvas(wrap, outW, outH);
      if (htmlCanvas && !isCanvasTainted(htmlCanvas)) {
        ctx.drawImage(htmlCanvas, 0, 0);
      }
    } catch {
      // WebGL-only export still succeeds
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
    renderer.setSize(prevSize.w, prevSize.h, false);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
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

async function htmlToCanvas(element, width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml">${element.outerHTML}</div>
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
