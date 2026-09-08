(() => {
  "use strict";

  const STORAGE_KEY = "tjm-principles-text-size";
  const VALID_SIZES = new Set(["small", "default", "large"]);
  let mountQueued = false;

  const safeStorage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (_error) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch (_error) { /* Keep the preference for this visit. */ }
    },
  };

  function preferredSize() {
    const saved = safeStorage.get(STORAGE_KEY);
    if (VALID_SIZES.has(saved)) return saved;
    const guideSize = safeStorage.get("tjm-guide-text-size");
    return VALID_SIZES.has(guideSize) ? guideSize : "default";
  }

  function updatePressedState() {
    const size = document.documentElement.dataset.principlesTextSize || "default";
    document.querySelectorAll(".tjm-fm-text-controls [data-principles-text-size]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.principlesTextSize === size));
    });
  }

  function applySize(size, save = true) {
    const normalized = VALID_SIZES.has(size) ? size : "default";
    document.documentElement.dataset.principlesTextSize = normalized;
    if (save) safeStorage.set(STORAGE_KEY, normalized);
    updatePressedState();

    // React Flow observes node dimensions, but a resize event makes the new
    // card sizes settle immediately in browsers with slower ResizeObserver delivery.
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  function makeControls() {
    const controls = document.createElement("div");
    controls.className = "tjm-fm-text-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Principles text size");
    controls.innerHTML = `
      <span>Text size</span>
      <button type="button" data-principles-text-size="small" aria-label="Use smaller Principles text">A−</button>
      <button type="button" data-principles-text-size="default" aria-label="Use standard Principles text">A</button>
      <button type="button" data-principles-text-size="large" aria-label="Use larger Principles text">A+</button>`;

    controls.addEventListener("click", (event) => {
      const button = event.target.closest("[data-principles-text-size]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      applySize(button.dataset.principlesTextSize);
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
    updatePressedState();
  }

  function queueEnhancement() {
    if (mountQueued) return;
    mountQueued = true;
    window.requestAnimationFrame(enhanceToolbars);
  }

  applySize(preferredSize(), false);

  const observer = new MutationObserver(queueEnhancement);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("DOMContentLoaded", queueEnhancement, { once: true });
  window.addEventListener("tjm-principles-bridge-ready", queueEnhancement);
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && VALID_SIZES.has(event.newValue)) applySize(event.newValue, false);
  });

  window.TJMPrinciplesTextSize = Object.freeze({
    get: () => document.documentElement.dataset.principlesTextSize || "default",
    set: applySize,
  });

  queueEnhancement();
})();
