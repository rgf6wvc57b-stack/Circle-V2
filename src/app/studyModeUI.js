/**
 * Binds geometry study / poster engine UI controls.
 * @param {import("../studies/StudyController.js").StudyController} studyController
 * @param {object} hooks
 * @param {() => void} hooks.onStudyEnter
 * @param {() => void} hooks.onStudyExit
 * @param {() => void} hooks.syncWorldDecor
 */
export function bindStudyControls(studyController, hooks) {
  const studySelect = document.getElementById("studySelect");
  const studyEnabled = document.getElementById("studyModeEnabled");
  const studyPosterMode = document.getElementById("studyPosterMode");
  const studyExport = document.getElementById("studyExportPoster");
  const studyReset = document.getElementById("studyResetView");

  studyController.listStudies().forEach((study) => {
    const opt = document.createElement("option");
    opt.value = study.id;
    opt.textContent = study.title;
    studySelect?.appendChild(opt);
  });

  const applyVisibility = (enabled) => {
    document.getElementById("studyControls")?.toggleAttribute("hidden", !enabled);
    document.getElementById("studyRenderControls")?.toggleAttribute("hidden", !enabled);
  };

  studyEnabled?.addEventListener("change", (e) => {
    const on = e.target.checked;
    if (on) {
      studyController.enter(studySelect?.value ?? studyController.studyId);
      applyVisibility(true);
      hooks.onStudyEnter?.();
    } else {
      studyController.exit();
      applyVisibility(false);
      hooks.onStudyExit?.();
    }
  });

  studySelect?.addEventListener("change", (e) => {
    studyController.setStudy(e.target.value);
    if (studyController.isActive()) hooks.syncWorldDecor?.();
  });

  studyPosterMode?.addEventListener("change", (e) => {
    studyController.setPosterMode(e.target.checked);
  });

  studyReset?.addEventListener("click", () => studyController.resetCamera());

  studyExport?.addEventListener("click", async () => {
    try {
      await studyController.exportPoster({ scale: 3 });
    } catch (err) {
      console.error("Poster export failed:", err);
    }
  });

  document.getElementById("studyShowVertices")?.addEventListener("change", (e) => {
    studyController.setOptions({ showVertices: e.target.checked });
  });
  document.getElementById("studyShowEdges")?.addEventListener("change", (e) => {
    studyController.setOptions({ showEdges: e.target.checked });
  });
  document.getElementById("studyShowFaces")?.addEventListener("change", (e) => {
    studyController.setOptions({ showFaces: e.target.checked });
  });
  document.getElementById("studyShowInternal")?.addEventListener("change", (e) => {
    studyController.setOptions({ showInternal: e.target.checked });
  });
  document.getElementById("studyShowLabels")?.addEventListener("change", (e) => {
    studyController.setOptions({ showLabels: e.target.checked });
    if (studyController.isActive()) studyController.syncPosterDOM();
  });
  document.getElementById("studyShowCallouts")?.addEventListener("change", (e) => {
    studyController.setOptions({ showCallouts: e.target.checked });
    if (studyController.isActive()) studyController.syncPosterDOM();
  });
  document.getElementById("studyShowAxes")?.addEventListener("change", (e) => {
    studyController.setOptions({ showAxes: e.target.checked });
  });

  document.getElementById("studyFaceOpacity")?.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    document.getElementById("studyFaceOpacityValue").textContent = v.toFixed(2);
    studyController.setOptions({ faceOpacity: v });
  });

  document.getElementById("studySphereScale")?.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    document.getElementById("studySphereScaleValue").textContent = v.toFixed(2);
    studyController.setOptions({ sphereScale: v, vertexScale: v });
  });

  document.getElementById("studyLineWidth")?.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    document.getElementById("studyLineWidthValue").textContent = v.toFixed(2);
    studyController.setOptions({ lineWidth: v });
  });

  document.getElementById("studySeqBack")?.addEventListener("click", () => {
    studyController.stepSequenceBack();
  });
  document.getElementById("studySeqForward")?.addEventListener("click", () => {
    studyController.stepSequenceForward();
  });
  document.getElementById("studySeqPlay")?.addEventListener("change", (e) => {
    studyController.sequencePlaying = e.target.checked;
  });
}
