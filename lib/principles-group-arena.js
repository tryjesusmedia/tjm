(() => {
  "use strict";

  const HOLD_MS = 360;
  const MOVE_TOLERANCE = 8;
  const CARD_WIDTH = 290;
  const ARENA_WIDTH = 1400;
  const ARENA_HEIGHT = 900;
  const config = window.TJM_CONFLICT_CONFIG || window.TJM_CHRONBIBLE_CONFIG;
  if (!config) return;

  let preparedKey = "";
  let pointerId = null;
  let downX = 0;
  let downY = 0;
  let pressTimer = null;
  let draggingCard = null;
  let dragging = false;
  let panStart = null;
  let suppressClickUntil = 0;

  const prefix = `tjm-focused-principle-arena:${config.planId}`;

  function read(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(`${prefix}:${key}`) || "null");
      return parsed ?? fallback;
    } catch (_error) { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(`${prefix}:${key}`, JSON.stringify(value)); } catch (_error) {}
  }

  function cardId(card) { return card?.id?.replace(/^principle-id-/, "") || ""; }

  function firstLine(card) {
    const text = card.querySelector(":scope > p")?.textContent || card.querySelector("p")?.textContent || "";
    return text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || "Untitled principle";
  }

  function arenaKey(cards) {
    return cards.map(cardId).filter(Boolean).sort().join(".");
  }

  function defaultPos(index) {
    const cols = 4;
    return { x: 30 + (index % cols) * 330, y: 30 + Math.floor(index / cols) * 190, z: index + 1 };
  }

  function positions(key) { return read(`positions:${key}`, {}); }
  function savePositions(key, value) { write(`positions:${key}`, value); }
  function pan(key) { return read(`pan:${key}`, { x: 0, y: 0 }); }
  function savePan(key, value) { write(`pan:${key}`, value); }

  function enhanceCard(card, index, key) {
    if (card.dataset.groupArenaReady === "true") return;
    card.dataset.groupArenaReady = "true";
    card.classList.add("group-arena-card");
    const id = cardId(card);
    const number = card.dataset.principleNumber || card.querySelector(".principle-circle")?.textContent?.trim() || "";
    const summary = document.createElement("button");
    summary.type = "button";
    summary.className = "group-arena-summary";
    summary.dataset.groupArenaToggle = id;
    summary.innerHTML = `<span class="principle-circle group-arena-number">${number}</span><span class="group-arena-first-line"></span>`;
    summary.querySelector(".group-arena-first-line").textContent = firstLine(card);
    card.prepend(summary);

    const pos = positions(key);
    if (!pos[id]) {
      pos[id] = defaultPos(index);
      savePositions(key, pos);
    }
    card.style.left = `${Math.max(0, Number(pos[id].x) || 0)}px`;
    card.style.top = `${Math.max(0, Number(pos[id].y) || 0)}px`;
    card.style.zIndex = String(Number(pos[id].z) || index + 1);
  }

  function prepare() {
    const focused = document.querySelector(".focused-principle-group");
    const details = focused?.querySelector(".principle-group-details");
    if (!focused || !details) { preparedKey = ""; return; }
    const cards = [...details.querySelectorAll(":scope > .principle-detail-card")];
    if (!cards.length) return;
    const key = arenaKey(cards);
    if (!details.classList.contains("group-mindmap-arena")) {
      const viewport = document.createElement("div");
      viewport.className = "group-mindmap-viewport";
      details.parentNode.insertBefore(viewport, details);
      viewport.appendChild(details);
      const hint = document.createElement("div");
      hint.className = "group-mindmap-help";
      hint.innerHTML = `<strong>Group mind map</strong><span>Drag principles anywhere. Drag empty space to pan. Tap a principle to open or close it in place.</span>`;
      viewport.before(hint);
      details.classList.add("group-mindmap-arena");
      details.style.width = `${ARENA_WIDTH}px`;
      details.style.height = `${ARENA_HEIGHT}px`;
    }

    cards.forEach((card, index) => enhanceCard(card, index, key));
    const savedPan = pan(key);
    details.style.transform = `translate(${Number(savedPan.x) || 0}px, ${Number(savedPan.y) || 0}px)`;
    details.dataset.groupArenaKey = key;
    preparedKey = key;
  }

  function clearTimer() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }

  function beginCardDrag(card) {
    dragging = true;
    draggingCard = card;
    suppressClickUntil = Date.now() + 1500;
    card.classList.add("is-group-arena-dragging");
    card.style.zIndex = "90";
    document.body.classList.add("principle-drag-active");
    if (navigator.vibrate) navigator.vibrate(16);
  }

  function saveCard(card) {
    const arena = card.closest(".group-mindmap-arena");
    const key = arena?.dataset.groupArenaKey;
    if (!key) return;
    const pos = positions(key);
    const id = cardId(card);
    pos[id] = {
      x: Math.max(0, parseFloat(card.style.left) || 0),
      y: Math.max(0, parseFloat(card.style.top) || 0),
      z: Date.now() % 1000000,
    };
    savePositions(key, pos);
  }

  function stopGesture(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  document.addEventListener("pointerdown", (event) => {
    const viewport = event.target.closest?.(".group-mindmap-viewport");
    if (!viewport) return;
    const card = event.target.closest?.(".group-arena-card");
    if (card && event.target.closest("button, a, input, textarea, select, label, form") && !event.target.closest(".group-arena-summary")) return;

    pointerId = event.pointerId;
    downX = event.clientX;
    downY = event.clientY;
    clearTimer();

    if (card) {
      stopGesture(event);
      pressTimer = setTimeout(() => beginCardDrag(card), HOLD_MS);
      draggingCard = card;
      return;
    }

    const arena = viewport.querySelector(".group-mindmap-arena");
    if (!arena) return;
    stopGesture(event);
    const key = arena.dataset.groupArenaKey;
    const saved = pan(key);
    panStart = { arena, key, x: Number(saved.x) || 0, y: Number(saved.y) || 0 };
  }, true);

  document.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const dx = event.clientX - downX;
    const dy = event.clientY - downY;

    if (panStart) {
      stopGesture(event);
      const next = { x: panStart.x + dx, y: panStart.y + dy };
      panStart.arena.style.transform = `translate(${next.x}px, ${next.y}px)`;
      return;
    }

    if (!draggingCard) return;
    if (!dragging && Math.hypot(dx, dy) > MOVE_TOLERANCE) {
      clearTimer();
      beginCardDrag(draggingCard);
    }
    if (!dragging) return;
    stopGesture(event);
    const startLeft = Number(draggingCard.dataset.dragStartLeft || parseFloat(draggingCard.style.left) || 0);
    const startTop = Number(draggingCard.dataset.dragStartTop || parseFloat(draggingCard.style.top) || 0);
    if (!draggingCard.dataset.dragStartLeft) {
      draggingCard.dataset.dragStartLeft = String(startLeft);
      draggingCard.dataset.dragStartTop = String(startTop);
    }
    draggingCard.style.left = `${Math.max(0, startLeft + dx)}px`;
    draggingCard.style.top = `${Math.max(0, startTop + dy)}px`;
  }, { capture: true, passive: false });

  document.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    clearTimer();
    if (panStart) {
      stopGesture(event);
      const transform = panStart.arena.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      if (transform) savePan(panStart.key, { x: Number(transform[1]), y: Number(transform[2]) });
      panStart = null;
      pointerId = null;
      return;
    }
    if (draggingCard && dragging) {
      stopGesture(event);
      suppressClickUntil = Date.now() + 1600;
      saveCard(draggingCard);
      draggingCard.classList.remove("is-group-arena-dragging");
      delete draggingCard.dataset.dragStartLeft;
      delete draggingCard.dataset.dragStartTop;
      document.body.classList.remove("principle-drag-active");
    }
    draggingCard = null;
    dragging = false;
    pointerId = null;
  }, true);

  document.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== pointerId) return;
    clearTimer();
    draggingCard?.classList.remove("is-group-arena-dragging");
    draggingCard = null;
    dragging = false;
    panStart = null;
    pointerId = null;
    document.body.classList.remove("principle-drag-active");
  }, true);

  document.addEventListener("click", (event) => {
    const summary = event.target.closest?.(".group-arena-summary");
    if (!summary) return;
    stopGesture(event);
    if (Date.now() < suppressClickUntil) return;
    const card = summary.closest(".group-arena-card");
    if (!card) return;
    card.classList.toggle("is-group-arena-expanded");
  }, true);

  const observer = new MutationObserver(() => requestAnimationFrame(prepare));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  requestAnimationFrame(prepare);
})();
