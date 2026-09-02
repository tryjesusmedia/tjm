(() => {
  "use strict";

  const MOVE_THRESHOLD = 8;
  const BLOCK_MS = 2200;

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let moved = false;
  let startedInsidePrinciples = false;
  let blockClicksUntil = 0;

  function isPrinciplesTarget(target) {
    return Boolean(target?.closest?.(
      ".principles-view, .focused-principle-group, .principle-mindmap-arena, .mindmap-node, .mindmap-principle-circle, .mindmap-detail-draggable"
    ));
  }

  function cancelEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  }

  document.addEventListener("pointerdown", (event) => {
    if (!isPrinciplesTarget(event.target)) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    moved = false;
    startedInsidePrinciples = true;
  }, true);

  document.addEventListener("pointermove", (event) => {
    if (!startedInsidePrinciples || event.pointerId !== pointerId) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) >= MOVE_THRESHOLD) moved = true;
  }, true);

  document.addEventListener("pointerup", (event) => {
    if (!startedInsidePrinciples || event.pointerId !== pointerId) return;
    if (moved) {
      blockClicksUntil = Date.now() + BLOCK_MS;
      cancelEvent(event);
    }
    pointerId = null;
    startedInsidePrinciples = false;
    moved = false;
  }, true);

  document.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    startedInsidePrinciples = false;
    moved = false;
  }, true);

  // Capture-phase suppression is intentional: the reading page's root click handler
  // runs during bubbling. Blocking here prevents a synthetic click after dragging
  // from reaching "Go to reading" or any other principle click action.
  document.addEventListener("click", (event) => {
    if (Date.now() >= blockClicksUntil) return;
    if (!isPrinciplesTarget(event.target)) return;
    cancelEvent(event);
  }, true);

  document.addEventListener("auxclick", (event) => {
    if (Date.now() >= blockClicksUntil) return;
    if (!isPrinciplesTarget(event.target)) return;
    cancelEvent(event);
  }, true);
})();
