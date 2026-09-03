(() => {
  "use strict";

  const config = window.TJM_CONFLICT_CONFIG || window.TJM_CHRONBIBLE_CONFIG;
  if (!config || window.__TJM_MINDMAP_UX_GUARD_LOADED) return;
  window.__TJM_MINDMAP_UX_GUARD_LOADED = true;

  const STORAGE = `tjm-principle-mindmap-v4:${config.planId}`;
  const TAP_SLOP = 14;
  const LONG_PRESS_MS = 260;
  const SYNTHETIC_CLICK_BLOCK_MS = 900;

  let press = null;
  let blockedUntil = 0;
  let clampQueued = false;
  const observedCanvases = new WeakSet();
  const observedViewports = new WeakSet();

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (_error) {
      // The interaction still works for this visit if storage is unavailable.
    }
  }

  function viewState(mapId) {
    const views = readJSON(`${STORAGE}:views`, {});
    return views[mapId] || readJSON(`${STORAGE}:view:${mapId}`, { scale: 1, x: 0, y: 0 });
  }

  function saveViewState(mapId, state) {
    const views = readJSON(`${STORAGE}:views`, {});
    views[mapId] = state;
    writeJSON(`${STORAGE}:views`, views);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numericSize(element, property, fallback) {
    const inline = Number.parseFloat(element.style[property]);
    if (Number.isFinite(inline) && inline > 0) return inline;
    const computed = Number.parseFloat(window.getComputedStyle(element)[property]);
    if (Number.isFinite(computed) && computed > 0) return computed;
    return fallback;
  }

  function boundedAxis(position, viewportSize, canvasSize, scale) {
    const scaledSize = canvasSize * scale;
    const lower = Math.min(0, viewportSize - scaledSize);
    const upper = Math.max(0, viewportSize - scaledSize);
    return clamp(Number(position) || 0, lower, upper);
  }

  function clampCanvas(viewport, canvas) {
    if (!viewport?.isConnected || !canvas?.isConnected) return;
    const mapId = viewport.dataset.mapId || canvas.dataset.mapId;
    if (!mapId) return;

    const state = viewState(mapId);
    const scale = clamp(Number(state.scale) || 1, 0.4, 2.5);
    const width = numericSize(canvas, "width", canvas.scrollWidth || 1);
    const height = numericSize(canvas, "height", canvas.scrollHeight || 1);
    const x = boundedAxis(state.x, viewport.clientWidth, width, scale);
    const y = boundedAxis(state.y, viewport.clientHeight, height, scale);

    if (x !== state.x || y !== state.y || scale !== state.scale) {
      state.x = x;
      state.y = y;
      state.scale = scale;
      saveViewState(mapId, state);
    }

    const expected = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    if (canvas.style.transform !== expected) canvas.style.transform = expected;

    const controls = viewport.previousElementSibling?.classList.contains("tjm-v4-map-controls")
      ? viewport.previousElementSibling
      : null;
    const reset = controls?.querySelector('[data-v4-zoom="reset"]');
    if (reset) reset.textContent = `${Math.round(scale * 100)}%`;
  }

  function scheduleClamp() {
    if (clampQueued) return;
    clampQueued = true;
    window.requestAnimationFrame(() => {
      clampQueued = false;
      document.querySelectorAll(".tjm-v4-map-viewport").forEach((viewport) => {
        const canvas = viewport.querySelector(":scope > .tjm-v4-map-canvas");
        if (canvas) clampCanvas(viewport, canvas);
      });
    });
  }

  function observeMaps() {
    document.querySelectorAll(".tjm-v4-map-viewport").forEach((viewport) => {
      const canvas = viewport.querySelector(":scope > .tjm-v4-map-canvas");
      if (!canvas) return;

      if (!observedCanvases.has(canvas)) {
        observedCanvases.add(canvas);
        new MutationObserver(scheduleClamp).observe(canvas, {
          attributes: true,
          attributeFilter: ["style"],
        });
      }

      if (!observedViewports.has(viewport) && "ResizeObserver" in window) {
        observedViewports.add(viewport);
        const resizeObserver = new ResizeObserver(scheduleClamp);
        resizeObserver.observe(viewport);
      }
    });
    scheduleClamp();
  }

  function isOpenGroupSummary(target) {
    return target?.closest?.(".tjm-v4-card-summary") || null;
  }

  function isCircleHandle(target) {
    return target?.closest?.("[data-v4-principle-id], [data-v4-card-handle]") || null;
  }

  function principleIdFromEditButton(button) {
    return button?.dataset?.principleEdit
      || button?.closest?.(".principle-detail-card")?.id?.replace(/^principle-id-/, "")
      || "";
  }

  function rememberExpandedPrinciple(id) {
    if (!id) return;
    try {
      window.sessionStorage.setItem(`${STORAGE}:expanded-principle`, id);
    } catch (_error) {}
  }

  function restoreExpandedPrinciple() {
    let id = "";
    try {
      id = window.sessionStorage.getItem(`${STORAGE}:expanded-principle`) || "";
    } catch (_error) {}
    if (!id) return;

    const card = document.getElementById(`principle-id-${id}`);
    if (!card) return;
    card.classList.add("tjm-v4-expanded");
    const summary = card.querySelector(":scope > .tjm-v4-card-summary");
    if (summary) summary.setAttribute("aria-expanded", "true");
  }

  function toggleSummary(summary) {
    const card = summary?.closest?.(".tjm-v4-group-card");
    if (!card) return;
    const opening = !card.classList.contains("tjm-v4-expanded");
    card.classList.toggle("tjm-v4-expanded", opening);
    summary.setAttribute("aria-expanded", opening ? "true" : "false");
    const id = card.dataset.v4PrincipleId || card.id.replace(/^principle-id-/, "");
    if (opening) rememberExpandedPrinciple(id);
    else {
      try {
        if (window.sessionStorage.getItem(`${STORAGE}:expanded-principle`) === id) {
          window.sessionStorage.removeItem(`${STORAGE}:expanded-principle`);
        }
      } catch (_error) {}
    }
  }

  function cancelEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  document.addEventListener("pointerdown", (event) => {
    const summary = isOpenGroupSummary(event.target);
    const circle = isCircleHandle(event.target);
    if (!summary && !circle) return;
    press = {
      pointerId: event.pointerId,
      summary,
      circle,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      moved: false,
    };
  }, true);

  document.addEventListener("pointermove", (event) => {
    if (!press || press.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    if (distance >= TAP_SLOP) press.moved = true;

    // A normal finger tap often jitters several pixels. Keep that jitter from
    // being promoted into a drag before the long-press timer has elapsed.
    if (press.summary && !press.moved && performance.now() - press.startedAt < LONG_PRESS_MS) {
      event.stopImmediatePropagation?.();
    }
  }, true);

  document.addEventListener("pointerup", (event) => {
    if (!press || press.pointerId !== event.pointerId) return;
    const elapsed = performance.now() - press.startedAt;
    const distance = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    const moved = press.moved || distance >= TAP_SLOP || elapsed >= LONG_PRESS_MS;
    if (moved) blockedUntil = Date.now() + SYNTHETIC_CLICK_BLOCK_MS;
    press = { ...press, moved, releasedAt: Date.now() };
  }, true);

  document.addEventListener("pointercancel", (event) => {
    if (press?.pointerId === event.pointerId) {
      blockedUntil = Date.now() + SYNTHETIC_CLICK_BLOCK_MS;
      press = null;
    }
  }, true);

  // Registered before the main Mind Map runtime. This gives a genuine short tap
  // one deterministic open/close path and blocks the synthetic click after a drag.
  document.addEventListener("click", (event) => {
    const summary = isOpenGroupSummary(event.target);
    if (summary) {
      const genuineTap = !press?.moved && (event.detail === 0 || Date.now() - (press?.releasedAt || 0) < 700);
      if (Date.now() < blockedUntil || !genuineTap) {
        cancelEvent(event);
        press = null;
        return;
      }
      cancelEvent(event);
      toggleSummary(summary);
      press = null;
      return;
    }

    if (Date.now() < blockedUntil && event.target.closest?.(
      ".tjm-v4-map-viewport, .principles-view, .focused-principle-group"
    )) {
      cancelEvent(event);
      press = null;
      return;
    }

    const editButton = event.target.closest?.("[data-principle-edit]");
    if (editButton) rememberExpandedPrinciple(principleIdFromEditButton(editButton));
    press = null;
  }, true);

  const domObserver = new MutationObserver(() => {
    observeMaps();
    restoreExpandedPrinciple();
  });
  domObserver.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("resize", scheduleClamp);
  window.addEventListener("DOMContentLoaded", () => {
    observeMaps();
    restoreExpandedPrinciple();
  }, { once: true });

  observeMaps();
})();
