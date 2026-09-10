(() => {
  "use strict";

  const STORAGE_KEY = "tjm-principles-text-size";
  const STEP_COUNT = 40;
  const MIN_STEP = 0;
  const MAX_STEP = STEP_COUNT - 1;
  const DEFAULT_STEP = 6;
  const MIN_SCALE = 0.76;
  const SCALE_PER_STEP = 0.04;
  const LEGACY_STEPS = Object.freeze({ small: 3, default: DEFAULT_STEP, large: 10 });
  const TYPE_SIZES = Object.freeze({
    "--tjm-principles-copy": 1.18,
    "--tjm-principles-name": 1.22,
    "--tjm-principles-detail": 1.22,
    "--tjm-principles-meta": 1,
    "--tjm-principles-folder": 1.7,
  });
  let mountQueued = false;

  const safeStorage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (_error) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch (_error) { /* Keep the preference for this visit. */ }
    },
  };

  function resolveStep(value, fallback = DEFAULT_STEP) {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "string" && Object.prototype.hasOwnProperty.call(LEGACY_STEPS, value)) return LEGACY_STEPS[value];
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(MAX_STEP, Math.max(MIN_STEP, Math.round(numeric)));
  }

  function preferredStep() {
    const saved = safeStorage.get(STORAGE_KEY);
    if (saved !== null) {
      const step = resolveStep(saved);
      if (saved !== String(step)) safeStorage.set(STORAGE_KEY, String(step));
      return step;
    }
    return resolveStep(safeStorage.get("tjm-guide-text-size"));
  }

  function currentStep() {
    return resolveStep(document.documentElement.dataset.principlesTextStep);
  }

  function legacySizeForStep(step) {
    if (step < DEFAULT_STEP) return "small";
    if (step > DEFAULT_STEP) return "large";
    return "default";
  }

  function formatRem(value) {
    return `${Number(value.toFixed(4))}rem`;
  }

  function applyCssVariables(step) {
    const rootStyle = document.documentElement.style;
    const scale = MIN_SCALE + (step * SCALE_PER_STEP);
    Object.entries(TYPE_SIZES).forEach(([property, baseSize]) => {
      rootStyle.setProperty(property, formatRem(baseSize * scale));
    });
    rootStyle.setProperty("--tjm-principles-node-width", `${300 + (step * 7)}px`);
    rootStyle.setProperty("--tjm-principles-expanded-width", `${Number((390 + (step * (65 / DEFAULT_STEP))).toFixed(2))}px`);
  }

  function updateControls() {
    const step = currentStep();
    document.querySelectorAll(".tjm-fm-text-controls").forEach((controls) => {
      const decrease = controls.querySelector('[data-principles-text-action="decrease"]');
      const increase = controls.querySelector('[data-principles-text-action="increase"]');
      if (decrease) decrease.disabled = step <= MIN_STEP;
      if (increase) increase.disabled = step >= MAX_STEP;
      controls.dataset.principlesTextStep = String(step);
    });
  }

  function applyStep(value, save = true) {
    const step = resolveStep(value);
    document.documentElement.dataset.principlesTextStep = String(step);
    document.documentElement.dataset.principlesTextSize = legacySizeForStep(step);
    applyCssVariables(step);
    if (save) safeStorage.set(STORAGE_KEY, String(step));
    updateControls();

    // React Flow observes node dimensions, but a resize event makes the new
    // card sizes settle immediately in browsers with slower ResizeObserver delivery.
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new CustomEvent("tjm-principles-text-size-change", { detail: { step } }));
    });
  }

  function makeControls() {
    const controls = document.createElement("div");
    controls.className = "tjm-fm-text-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Principles text size");
    controls.innerHTML = `
      <button type="button" data-principles-text-action="decrease" aria-label="Use smaller Principles text">A−</button>
      <button type="button" data-principles-text-action="increase" aria-label="Use larger Principles text">A+</button>`;

    controls.addEventListener("click", (event) => {
      const button = event.target.closest("[data-principles-text-action]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const step = currentStep();
      if (button.dataset.principlesTextAction === "decrease") applyStep(step - 1);
      if (button.dataset.principlesTextAction === "increase") applyStep(step + 1);
    });
    return controls;
  }

  function enhanceToolbars() {
    mountQueued = false;
    document.querySelectorAll(".tjm-fm-workspace-toolbar").forEach((toolbar) => {
      if (toolbar.querySelector(":scope > .tjm-fm-text-controls")) return;
      const controls = makeControls();
      const hint = toolbar.querySelector(":scope > span");
      if (hint) toolbar.insertBefore(controls, hint);
      else toolbar.appendChild(controls);
    });
    updateControls();
  }

  function queueEnhancement() {
    if (mountQueued) return;
    mountQueued = true;
    window.requestAnimationFrame(enhanceToolbars);
  }

  applyStep(preferredStep(), false);

  const observer = new MutationObserver(queueEnhancement);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("DOMContentLoaded", queueEnhancement, { once: true });
  window.addEventListener("tjm-principles-bridge-ready", queueEnhancement);
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue !== null) applyStep(event.newValue, false);
  });

  window.TJMPrinciplesTextSize = Object.freeze({
    get: () => document.documentElement.dataset.principlesTextSize || "default",
    getStep: currentStep,
    set: applyStep,
    reset: () => applyStep(DEFAULT_STEP),
    min: MIN_STEP,
    max: MAX_STEP,
    count: STEP_COUNT,
  });

  queueEnhancement();
})();
