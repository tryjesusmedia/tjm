(() => {
  "use strict";

  const exactCopy = new Set([
    "Use any available whole number. Every principle number must be unique.",
    "Write one principle at a time. It receives a permanent number so you can organize your discoveries throughout the journey.",
  ]);
  const prefixCopy = [
    "Give this principle a short, memorable name.",
    "Write one principle at a time.",
  ];
  let mobileCameraRepairScheduled = false;

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function removeRequestedCopy(root = document) {
    const elements = [];
    if (root instanceof Element && root.matches("p, small")) elements.push(root);
    if (root.querySelectorAll) elements.push(...root.querySelectorAll("p, small"));

    for (const element of elements) {
      const text = normalize(element.textContent);
      if (exactCopy.has(text) || prefixCopy.some((prefix) => text.startsWith(prefix))) {
        element.remove();
      }
    }
  }

  function syncVisualViewport() {
    const viewport = window.visualViewport;
    const width = Math.max(
      280,
      Math.floor(viewport?.width || document.documentElement.clientWidth || window.innerWidth),
    );
    const left = Math.max(0, Math.floor(viewport?.offsetLeft || 0));
    document.documentElement.style.setProperty("--tjm-map-visual-width", `${width}px`);
    document.documentElement.style.setProperty("--tjm-map-visual-left", `${left}px`);
  }

  function repairSavedMobileCameraOnce() {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    const map = document.querySelector(".tjm-fm-window .react-flow");
    const fitButton = map?.querySelector(".react-flow__controls-fitview");
    if (!map || !fitButton || mobileCameraRepairScheduled) return;

    const config = window.TJM_CONFLICT_CONFIG || window.TJM_CHRONBIBLE_CONFIG || {};
    const key = `tjm-mobile-principles-map-width-repair-v1:${config.planId || location.pathname}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch (_error) {
      // Storage is optional. Fitting once in this visit is still useful.
    }
    mobileCameraRepairScheduled = true;
    // Let React Flow remeasure after the corrected mobile width is applied.
    window.setTimeout(() => {
      fitButton.click();
      try { localStorage.setItem(key, "done"); } catch (_error) { /* The in-visit repair still succeeded. */ }
    }, 180);
  }

  function enhance() {
    removeRequestedCopy();
    syncVisualViewport();
    repairSavedMobileCameraOnce();
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) removeRequestedCopy(node);
      }
    }
    syncVisualViewport();
    repairSavedMobileCameraOnce();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", enhance, { once: true });
  window.addEventListener("resize", syncVisualViewport);
  window.addEventListener("orientationchange", () => window.setTimeout(syncVisualViewport, 120));
  window.visualViewport?.addEventListener("resize", syncVisualViewport);
  window.visualViewport?.addEventListener("scroll", syncVisualViewport);
  enhance();
})();
