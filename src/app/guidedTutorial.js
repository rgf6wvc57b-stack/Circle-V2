/**
 * Guided, step-by-step tutorial (coach marks + compact instruction card).
 * Highlights use live DOM geometry — never fixed screenshot coordinates.
 *
 * On screens < 600 CSS px, uses a dedicated mobile layout: half-open bottom
 * sheet, card docked above the sheet, face-on camera framing.
 */

import {
  SHEET_STATE,
  isMobileTutorialLayout,
  setSheetState,
  getSheetState,
} from "./mobileSheet.js";

export const TUTORIAL_STEPS = Object.freeze({
  WELCOME: "welcome",
  SELECT_FLOWER: "selectFlower",
  ENABLE_CONSTRUCTION: "enableConstruction",
  SCRUB_CONSTRUCTION: "scrubConstruction",
  COMPLETE: "complete",
});

const STEP_ORDER = [
  TUTORIAL_STEPS.WELCOME,
  TUTORIAL_STEPS.SELECT_FLOWER,
  TUTORIAL_STEPS.ENABLE_CONSTRUCTION,
  TUTORIAL_STEPS.SCRUB_CONSTRUCTION,
  TUTORIAL_STEPS.COMPLETE,
];

const STEP_PROGRESS = {
  [TUTORIAL_STEPS.WELCOME]: { index: 1, label: "Welcome" },
  [TUTORIAL_STEPS.SELECT_FLOWER]: { index: 2, label: "Geometry" },
  [TUTORIAL_STEPS.ENABLE_CONSTRUCTION]: { index: 3, label: "Construction Mode" },
  [TUTORIAL_STEPS.SCRUB_CONSTRUCTION]: { index: 4, label: "Construction Steps" },
  [TUTORIAL_STEPS.COMPLETE]: { index: 5, label: "Complete" },
};

/**
 * @typedef {{
 *   setIntroOpen: (open: boolean) => void,
 *   setPanelOpen: (open: boolean, opts?: object) => void,
 *   frameActiveConstruction: (opts?: object) => void,
 *   frameTutorialGeometry: (opts?: object) => void,
 *   getPlayerState: () => object,
 *   restartConstruction: () => void,
 *   isMobileLayout: () => boolean,
 *   isMobileTutorialLayout?: () => boolean,
 *   setSheetState: (state: string) => void,
 *   getSheetState: () => string,
 * }} TutorialHost
 */

export class GuidedTutorial {
  /** @param {TutorialHost} host */
  constructor(host) {
    this.host = host;
    this.active = false;
    this.stepId = null;
    /** @type {string | null} */
    this.highlightSelector = null;
    /** @type {HTMLElement | null} */
    this.highlightedEl = null;
    this.baselineStep = 1;
    this._raf = 0;
    this._onReposition = () => this.reposition();
    this._bound = false;

    this.layer = document.getElementById("tutorialLayer");
    this.card = document.getElementById("tutorialCard");
    this.highlight = document.getElementById("tutorialHighlight");
    this.pointer = document.getElementById("tutorialPointer");
    this.live = document.getElementById("tutorialLive");
    this.titleEl = document.getElementById("tutorialTitle");
    this.instructionEl = document.getElementById("tutorialInstruction");
    this.supportEl = document.getElementById("tutorialSupport");
    this.reportEl = document.getElementById("tutorialReport");
    this.progressEl = document.getElementById("tutorialProgress");
    this.actionsEl = document.getElementById("tutorialActions");
  }

  isActive() {
    return this.active;
  }

  getStepId() {
    return this.stepId;
  }

  /** True when the dedicated phone tutorial layout should be used. */
  isPhoneTutorial() {
    if (typeof this.host.isMobileTutorialLayout === "function") {
      return this.host.isMobileTutorialLayout();
    }
    return isMobileTutorialLayout();
  }

  /** Scrub step should not reframe/rotate the camera on phones. */
  shouldPreserveCamera() {
    return (
      this.active &&
      this.isPhoneTutorial() &&
      (this.stepId === TUTORIAL_STEPS.SCRUB_CONSTRUCTION ||
        this.stepId === TUTORIAL_STEPS.COMPLETE)
    );
  }

  start({ fromWelcome = true } = {}) {
    this.active = true;
    this.bindChrome();
    document.body.classList.add("tutorial-active");
    this.syncMobileBodyClass();
    if (this.isPhoneTutorial()) {
      this.host.setSheetState(SHEET_STATE.HALF);
      document.getElementById("app")?.classList.remove("panel-collapsed");
    } else {
      this.host.setPanelOpen(true, { reframe: true, animateFrame: false });
    }
    if (fromWelcome) this.goTo(TUTORIAL_STEPS.WELCOME);
    else this.goTo(TUTORIAL_STEPS.SELECT_FLOWER);
  }

  end() {
    this.active = false;
    this.stepId = null;
    this.clearHighlight();
    this.hideGuidedChrome();
    this.host.setIntroOpen(false);
    document.body.classList.remove("tutorial-active", "mobile-tutorial");
    // Restore normal panel behavior (legacy collapsed hide on phones).
    if (this.host.isMobileLayout()) {
      this.host.setSheetState(SHEET_STATE.HALF);
      this.host.setPanelOpen(true, { reframe: true, animateFrame: false });
    }
    this.unbindChrome();
    this.announce("Tutorial closed");
  }

  syncMobileBodyClass() {
    document.body.classList.toggle("mobile-tutorial", this.active && this.isPhoneTutorial());
  }

  bindChrome() {
    if (this._bound) return;
    this._bound = true;
    window.addEventListener("resize", this._onReposition);
    window.addEventListener("orientationchange", this._onReposition);
    document.getElementById("panel")?.addEventListener("scroll", this._onReposition, {
      passive: true,
    });
    document.getElementById("menuToggle")?.addEventListener("click", this._onReposition);
    document.getElementById("panelClose")?.addEventListener("click", this._onReposition);

    document.getElementById("tutorialBack")?.addEventListener("click", () => this.back());
    document.getElementById("tutorialSkip")?.addEventListener("click", () => this.end());
    document.getElementById("tutorialClose")?.addEventListener("click", () => this.end());
    document.getElementById("tutorialReplay")?.addEventListener("click", () => this.replay());
    document.getElementById("tutorialExplore")?.addEventListener("click", () => this.end());
    document.getElementById("tutorialFinish")?.addEventListener("click", () => this.end());
  }

  unbindChrome() {
    if (!this._bound) return;
    this._bound = false;
    window.removeEventListener("resize", this._onReposition);
    window.removeEventListener("orientationchange", this._onReposition);
    document.getElementById("panel")?.removeEventListener("scroll", this._onReposition);
    document.getElementById("menuToggle")?.removeEventListener("click", this._onReposition);
    document.getElementById("panelClose")?.removeEventListener("click", this._onReposition);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  /** Got it on the welcome modal — advance, do not end. */
  onWelcomeDone() {
    if (!this.active || this.stepId !== TUTORIAL_STEPS.WELCOME) {
      this.start({ fromWelcome: false });
      return;
    }
    this.host.setIntroOpen(false);
    this.goTo(TUTORIAL_STEPS.SELECT_FLOWER);
  }

  onGeometryChanged(geometryId) {
    if (!this.active || this.stepId !== TUTORIAL_STEPS.SELECT_FLOWER) return;
    if (geometryId !== "flowerOfLife") return;
    this.clearHighlight();
    this.frameGeometry({ duration: 0.7 });
    this.goTo(TUTORIAL_STEPS.ENABLE_CONSTRUCTION);
  }

  onConstructionModeChanged(enabled) {
    if (!this.active || this.stepId !== TUTORIAL_STEPS.ENABLE_CONSTRUCTION) return;
    if (!enabled) return;
    this.clearHighlight();
    this.goTo(TUTORIAL_STEPS.SCRUB_CONSTRUCTION);
  }

  onConstructionPlayerChange(state) {
    if (!this.active) return;
    if (this.stepId === TUTORIAL_STEPS.SCRUB_CONSTRUCTION) {
      this.renderConstructionReport(state);
      const step = Number(state?.displayStep ?? state?.step ?? 0);
      const total = Number(state?.totalSteps ?? 0);
      if (step > this.baselineStep && total > 0 && step >= total) {
        this.goTo(TUTORIAL_STEPS.COMPLETE);
      }
    } else if (this.stepId === TUTORIAL_STEPS.COMPLETE) {
      this.renderConstructionReport(state);
    }
  }

  frameGeometry(opts = {}) {
    if (typeof this.host.frameTutorialGeometry === "function") {
      this.host.frameTutorialGeometry(opts);
      return;
    }
    this.host.frameActiveConstruction(opts);
  }

  /** Reposition chrome first so available-view math sees the docked card. */
  frameAfterLayout(opts = { duration: 0.55 }) {
    this.reposition();
    requestAnimationFrame(() => {
      this.reposition();
      this.frameGeometry(opts);
      // Second pass after sheet height / card dock settles.
      setTimeout(() => {
        this.reposition();
        this.frameGeometry({ ...opts, duration: Math.min(0.45, opts.duration ?? 0.45) });
      }, 140);
    });
  }

  back() {
    if (!this.active) return;
    const idx = STEP_ORDER.indexOf(this.stepId);
    if (idx <= 0) {
      this.goTo(TUTORIAL_STEPS.WELCOME);
      return;
    }
    const prev = STEP_ORDER[idx - 1];
    if (prev === TUTORIAL_STEPS.WELCOME) {
      this.goTo(TUTORIAL_STEPS.WELCOME);
      return;
    }
    this.goTo(prev, { fromBack: true });
  }

  replay() {
    this.host.restartConstruction();
    this.goTo(TUTORIAL_STEPS.SCRUB_CONSTRUCTION, { fromBack: true });
  }

  /**
   * @param {string} stepId
   * @param {{ fromBack?: boolean }} [opts]
   */
  goTo(stepId, { fromBack = false } = {}) {
    this.stepId = stepId;
    this.clearHighlight();
    this.syncMobileBodyClass();
    this.updateProgress(stepId);

    if (stepId === TUTORIAL_STEPS.WELCOME) {
      this.hideGuidedChrome();
      this.host.setIntroOpen(true);
      this.announce("Welcome to Geometry Explor");
      return;
    }

    this.host.setIntroOpen(false);

    const phone = this.isPhoneTutorial();
    if (phone) {
      // Guided steps use half-open sheet; completion collapses slightly for the flower.
      const sheet =
        stepId === TUTORIAL_STEPS.COMPLETE ? SHEET_STATE.COLLAPSED : SHEET_STATE.HALF;
      this.host.setSheetState(sheet);
      document.getElementById("app")?.classList.remove("panel-collapsed");
    } else {
      this.host.setPanelOpen(true, { reframe: !fromBack, animateFrame: false });
    }

    this.showGuidedChrome();

    if (stepId === TUTORIAL_STEPS.SELECT_FLOWER) {
      document.getElementById("panel")?.scrollTo({ top: 0 });
      this.setCard({
        title: "Choose the Flower of Life",
        instruction: "Choose the Flower of Life.",
        support: "Open the Geometry dropdown and select Flower of Life.",
        mode: "guide",
        showReport: false,
      });
      this.setHighlight("#geometry", { label: "Geometry dropdown" });
      if (!fromBack) this.frameAfterLayout();
      this.announce(
        "Choose the Flower of Life. Open the Geometry dropdown and select Flower of Life."
      );
      return;
    }

    if (stepId === TUTORIAL_STEPS.ENABLE_CONSTRUCTION) {
      this.setCard({
        title: "Build the Flower of Life",
        instruction:
          "Turn on Construction Mode to reveal how the Flower of Life is created one step at a time.",
        support: "",
        mode: "guide",
        showReport: false,
      });
      this.setHighlight("#constructionMode", { label: "Construction Mode" });
      if (!fromBack) this.frameAfterLayout();
      this.announce(
        "Build the Flower of Life. Turn on Construction Mode to reveal how it is created one step at a time."
      );
      return;
    }

    if (stepId === TUTORIAL_STEPS.SCRUB_CONSTRUCTION) {
      const state = this.host.getPlayerState();
      this.baselineStep = Number(state?.displayStep ?? state?.step ?? 1) || 1;
      this.setCard({
        title: "Construction Steps",
        instruction:
          "Move the Construction Step bar to the right to reveal each new part of the Flower of Life.",
        support:
          "Each step adds geometry using exact centers, equal radii, and calculated intersections.",
        mode: "guide",
        showReport: !phone,
      });
      this.setHighlight("#constructionStepSlider", { label: "Construction Step slider" });
      this.renderConstructionReport(state);
      // Frame once face-on; subsequent slider moves preserve orientation.
      if (!fromBack) this.frameAfterLayout();
      this.announce(
        "Move the Construction Step bar to the right to reveal each new part of the Flower of Life."
      );
      return;
    }

    if (stepId === TUTORIAL_STEPS.COMPLETE) {
      this.setCard({
        title: "Flower of Life Complete",
        instruction:
          "You built the Flower of Life from one continuous mathematical construction. Every circle or sphere uses the same canonical centers and radius relationships.",
        support: phone
          ? "Drag on the canvas to orbit. Pinch or scroll to zoom. Use Menu to show or hide the control sheet."
          : "",
        mode: "complete",
        showReport: !phone,
      });
      this.renderConstructionReport(this.host.getPlayerState());
      // Collapse sheet slightly so the completed flower is easy to see, then reframe.
      if (phone) {
        this.host.setSheetState(SHEET_STATE.COLLAPSED);
        setTimeout(() => this.frameGeometry({ duration: 0.7 }), 120);
      }
      this.announce("Flower of Life Complete. Drag to orbit, pinch or scroll to zoom.");
    }
  }

  updateProgress(stepId) {
    const meta = STEP_PROGRESS[stepId];
    if (this.progressEl && meta) {
      this.progressEl.textContent = `Step ${meta.index} of ${STEP_ORDER.length}`;
      this.progressEl.hidden = false;
    }
  }

  setCard({ title, instruction, support, mode, showReport }) {
    if (!this.card) return;
    if (this.titleEl) this.titleEl.textContent = title;
    if (this.instructionEl) this.instructionEl.textContent = instruction;
    if (this.supportEl) {
      this.supportEl.textContent = support || "";
      this.supportEl.hidden = !support;
    }
    if (this.reportEl) this.reportEl.hidden = !showReport;
    this.card.dataset.mode = mode;
    const guideActions = this.card.querySelector("[data-tutorial-actions='guide']");
    const completeActions = this.card.querySelector("[data-tutorial-actions='complete']");
    if (guideActions) guideActions.hidden = mode !== "guide";
    if (completeActions) completeActions.hidden = mode !== "complete";
  }

  renderConstructionReport(state) {
    if (!this.reportEl) return;
    const report = state?.constructionReport;
    const step = state?.displayStep ?? state?.step ?? "—";
    const total = state?.totalSteps ?? "—";
    if (!report) {
      this.reportEl.innerHTML = `<p class="tutorial-report-line">Step ${step} / ${total}</p>
        <p class="tutorial-report-line muted">Construction report unavailable for this geometry.</p>`;
      return;
    }
    const parents = (report.parentGeometry || []).join(", ") || "—";
    const created = (report.newGeometryCreated || []).join(", ") || "—";
    const validation = report.validationResults;
    const ok = report.ok ?? validation?.ok;
    const checks = (validation?.checks || [])
      .slice(0, 4)
      .map((c) => `<li>${escapeHtml(typeof c === "string" ? c : c?.message || JSON.stringify(c))}</li>`)
      .join("");
    this.reportEl.innerHTML = `
      <p class="tutorial-report-line"><strong>Step</strong> ${escapeHtml(String(report.sphereStep ?? step))} / ${escapeHtml(String(total))}</p>
      <p class="tutorial-report-line"><strong>Rule</strong> ${escapeHtml(report.constructionRule || report.ruleType || "—")}</p>
      <p class="tutorial-report-line"><strong>Parent geometry</strong> ${escapeHtml(parents)}</p>
      <p class="tutorial-report-line"><strong>New geometry</strong> ${escapeHtml(created)}</p>
      <p class="tutorial-report-line"><strong>Validation</strong> ${ok ? "passed" : "failed"}</p>
      ${checks ? `<ul class="tutorial-report-checks">${checks}</ul>` : ""}
    `;
  }

  /**
   * @param {string} selector
   * @param {{ label?: string }} [opts]
   */
  setHighlight(selector, { label = "Highlighted control" } = {}) {
    this.highlightSelector = selector;
    const el = document.querySelector(selector);
    if (!el) {
      this.clearHighlight();
      return;
    }
    this.highlightedEl = el;
    el.classList.add("tutorial-spotlight");
    el.setAttribute("data-tutorial-target", "true");
    el.setAttribute("aria-describedby", "tutorialInstruction");
    if (this.highlight) {
      this.highlight.hidden = false;
      this.highlight.setAttribute("aria-label", label);
    }
    if (this.pointer) this.pointer.hidden = false;

    scrollPanelToReveal(el);
    this.scheduleReposition();
    setTimeout(() => {
      scrollPanelToReveal(el);
      this.reposition();
    }, 80);
    setTimeout(() => this.reposition(), 280);
  }

  clearHighlight() {
    document.querySelectorAll(".tutorial-spotlight").forEach((el) => {
      el.classList.remove("tutorial-spotlight");
      el.removeAttribute("data-tutorial-target");
      if (el.getAttribute("aria-describedby") === "tutorialInstruction") {
        el.removeAttribute("aria-describedby");
      }
    });
    this.highlightedEl = null;
    this.highlightSelector = null;
    if (this.highlight) this.highlight.hidden = true;
    if (this.pointer) this.pointer.hidden = true;
  }

  showGuidedChrome() {
    if (this.layer) this.layer.hidden = false;
    if (this.card) this.card.hidden = false;
  }

  hideGuidedChrome() {
    if (this.layer) this.layer.hidden = true;
    if (this.card) this.card.hidden = true;
    if (this.highlight) this.highlight.hidden = true;
    if (this.pointer) this.pointer.hidden = true;
  }

  scheduleReposition() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.reposition();
      requestAnimationFrame(() => this.reposition());
    });
  }

  reposition() {
    if (!this.active || !this.stepId || this.stepId === TUTORIAL_STEPS.WELCOME) return;
    this.syncMobileBodyClass();

    if (this.highlightSelector) {
      const el = document.querySelector(this.highlightSelector);
      if (el && el !== this.highlightedEl) {
        this.clearHighlight();
        this.setHighlight(this.highlightSelector);
        return;
      }
    }
    const target = this.highlightedEl;
    const panel = document.getElementById("panel");
    const phone = this.isPhoneTutorial();
    const mobile = this.host.isMobileLayout();

    if (target && this.highlight) {
      const r = target.getBoundingClientRect();
      // Keep highlight on-screen — clamp into the visible panel band.
      const pad = 6;
      const top = Math.max(0, Math.min(window.innerHeight - 8, r.top - pad));
      this.highlight.style.left = `${Math.max(0, r.left - pad)}px`;
      this.highlight.style.top = `${top}px`;
      this.highlight.style.width = `${r.width + pad * 2}px`;
      this.highlight.style.height = `${Math.max(8, r.height + pad * 2)}px`;
      this.highlight.hidden = false;
    }

    if (this.card) {
      placeTutorialCard(this.card, {
        target,
        panel,
        mobile,
        phoneTutorial: phone,
      });
    }

    if (target && this.card && this.pointer) {
      const t = target.getBoundingClientRect();
      // Only draw the pointer when the target is reasonably on-screen.
      if (t.bottom > 0 && t.top < window.innerHeight) {
        placeTutorialPointer(this.pointer, this.card, target);
      } else if (this.pointer) {
        this.pointer.hidden = true;
      }
    }
  }

  announce(message) {
    if (!this.live) return;
    this.live.textContent = "";
    requestAnimationFrame(() => {
      if (this.live) this.live.textContent = message;
    });
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Scroll the control panel so `el` is visible without sending it under browser chrome. */
function scrollPanelToReveal(el) {
  if (!el) return;
  const panel = document.getElementById("panel");
  if (panel && panel.contains(el)) {
    const panelRect = panel.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const pad = 24;
    const handle = document.getElementById("sheetHandle");
    const handleH = handle?.getBoundingClientRect().height || 0;
    const topPad = pad + handleH;
    if (r.top < panelRect.top + topPad) {
      panel.scrollTop += r.top - panelRect.top - topPad;
    } else if (r.bottom > panelRect.bottom - pad) {
      panel.scrollTop += r.bottom - panelRect.bottom + pad;
    }
  }
  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  } catch {
    el.scrollIntoView(true);
  }
}

/**
 * Place the compact card left of the right panel (desktop/iPad) or docked
 * to the top edge of the mobile bottom sheet during the phone tutorial.
 */
export function placeTutorialCard(card, { target, panel, mobile, phoneTutorial }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sat = cssInset("--sat");
  const sar = cssInset("--sar");
  const sab = cssInset("--sab");
  const sal = cssInset("--sal");

  card.style.position = "fixed";
  card.style.zIndex = "44";
  card.hidden = false;

  const panelRect = panel?.getBoundingClientRect();
  const targetRect = target?.getBoundingClientRect();

  if (phoneTutorial) {
    // Dock to the upper edge of the bottom sheet — never cover the geometry band
    // and never cover the highlighted control inside the sheet.
    const cardW = vw - sal - sar;
    card.style.width = `${cardW}px`;
    card.style.maxWidth = `${cardW}px`;
    card.style.left = `${sal}px`;
    card.style.right = "auto";
    card.style.bottom = "auto";

    const sheetTop = panelRect?.top ?? vh * 0.52;
    // Measure card height after width is set.
    const cardH = card.getBoundingClientRect().height || 140;
    let top = sheetTop - cardH;
    // Keep below the menu button / safe area.
    const menu = document.getElementById("menuToggle");
    const menuBottom = menu ? menu.getBoundingClientRect().bottom + 8 : sat + 56;
    top = Math.max(menuBottom, Math.min(top, vh - sab - cardH - 8));

    // If still overlapping the target control, shift upward within the geometry band.
    card.style.top = `${top}px`;
    const after = card.getBoundingClientRect();
    if (targetRect && overlaps(after, targetRect)) {
      card.style.top = `${Math.max(menuBottom, targetRect.top - after.height - 12)}px`;
    }
    return;
  }

  const cardW = Math.min(340, vw - sal - sar - 24);
  card.style.width = `${cardW}px`;
  card.style.maxWidth = `calc(100vw - ${sal + sar + 24}px)`;
  const cardH = card.getBoundingClientRect().height || 200;

  if (mobile) {
    const targetInLowerHalf = (targetRect?.top ?? vh) > vh * 0.45;
    if (targetInLowerHalf) {
      card.style.left = `${sal + 12}px`;
      card.style.right = "auto";
      card.style.top = `${sat + 12}px`;
      card.style.bottom = "auto";
    } else {
      card.style.left = `${sal + 12}px`;
      card.style.right = "auto";
      card.style.top = "auto";
      card.style.bottom = `${sab + 12}px`;
    }
    avoidOverlap(card, targetRect, vw, vh);
    return;
  }

  const panelLeft = panelRect && panelRect.width > 0 ? panelRect.left : vw - 320;
  let left = Math.max(sal + 12, panelLeft - cardW - 16);
  let top = targetRect
    ? clamp(targetRect.top + targetRect.height / 2 - cardH / 2, sat + 12, vh - sab - cardH - 12)
    : sat + 72;

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.right = "auto";
  card.style.bottom = "auto";

  avoidOverlap(card, targetRect, vw, vh);
  const after = card.getBoundingClientRect();
  if (panelRect && after.right > panelRect.left - 8) {
    card.style.left = `${Math.max(sal + 12, panelRect.left - after.width - 16)}px`;
  }
}

/**
 * Arrow from card toward the live DOM rect of the highlighted control.
 */
export function placeTutorialPointer(pointer, card, target) {
  const c = card.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const x1 = c.left + c.width / 2;
  const y1 = c.top + c.height / 2;
  const x2 = t.left + t.width / 2;
  const y2 = t.top + t.height / 2;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const startX = x1 + ux * Math.min(c.width, c.height) * 0.35;
  const startY = y1 + uy * Math.min(c.width, c.height) * 0.35;
  const endX = x2 - ux * Math.max(18, Math.min(t.width, t.height) * 0.35);
  const endY = y2 - uy * Math.max(18, Math.min(t.width, t.height) * 0.35);

  const lineLen = Math.hypot(endX - startX, endY - startY);
  const angle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI;

  pointer.hidden = false;
  pointer.style.left = `${startX}px`;
  pointer.style.top = `${startY}px`;
  pointer.style.width = `${Math.max(24, lineLen)}px`;
  pointer.style.transform = `rotate(${angle}deg)`;
}

function overlaps(a, b) {
  return (
    a.left < b.right + 8 &&
    a.right > b.left - 8 &&
    a.top < b.bottom + 8 &&
    a.bottom > b.top - 8
  );
}

function avoidOverlap(card, targetRect, vw, vh) {
  if (!targetRect) return;
  const r = card.getBoundingClientRect();
  if (!overlaps(r, targetRect)) return;

  if (targetRect.top > vh * 0.5) {
    card.style.top = `${Math.max(8, targetRect.top - r.height - 16)}px`;
    card.style.bottom = "auto";
  } else {
    card.style.top = `${Math.min(vh - r.height - 8, targetRect.bottom + 16)}px`;
    card.style.bottom = "auto";
  }
  const r2 = card.getBoundingClientRect();
  if (overlaps(r2, targetRect) && r2.right > targetRect.left) {
    card.style.left = `${Math.max(8, targetRect.left - r2.width - 16)}px`;
  }
}

function cssInset(varName) {
  if (typeof getComputedStyle === "undefined") return 0;
  const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName));
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Re-export sheet helpers for tests / host wiring convenience.
export { SHEET_STATE, isMobileTutorialLayout, setSheetState, getSheetState };
