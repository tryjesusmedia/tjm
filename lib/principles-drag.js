(() => {
  "use strict";

  const HOLD_MS = 420;
  const MOVE_TOLERANCE = 10;
  const GROUP_ZONE_START = 0.22;
  const GROUP_ZONE_END = 0.78;
  const config = window.TJM_CONFLICT_CONFIG || window.TJM_CHRONBIBLE_CONFIG;
  if (!config) return;

  let db = null;
  let pressTimer = null;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let source = null;
  let sourceKey = "";
  let placeholder = null;
  let dragging = false;
  let candidate = null;
  let dropMode = "";
  let suppressClickUntil = 0;
  let busy = false;

  function storageKey() {
    return `tjm-principle-board-order:${config.planId}`;
  }

  function toast(message, type = "") {
    const region = document.getElementById("toast-region");
    if (!region) return;
    const item = document.createElement("div");
    item.className = `toast${type ? ` ${type}` : ""}`;
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 3600);
  }

  function syncStatus(label, mode = "") {
    const status = document.getElementById("sync-status");
    if (!status) return;
    status.className = `sync-status${mode ? ` is-${mode}` : ""}`;
    status.innerHTML = `<i></i>${escapeHTML(label)}`;
  }

  function escapeHTML(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getDb() {
    if (db) return db;
    if (!window.supabase?.createClient) throw new Error("Account sync is not available right now.");
    db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
    });
    return db;
  }

  function currentList() {
    return document.querySelector(".principles-view .principle-group-list");
  }

  function cards(list = currentList()) {
    return list ? [...list.querySelectorAll(":scope > .principle-group-window")] : [];
  }

  function readOrder() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey()) || "[]");
      return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
    } catch (_error) {
      return [];
    }
  }

  function writeOrder(keys) {
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(keys));
    } catch (_error) {
      // Reordering remains usable for the session if storage is unavailable.
    }
  }

  function normalizeOrder(list = currentList()) {
    if (!list) return;
    const currentCards = cards(list);
    if (!currentCards.length) return;
    const byKey = new Map(currentCards.map((card) => [card.dataset.principleGroupWindow, card]));
    const remembered = readOrder().filter((key) => byKey.has(key));
    const missing = currentCards.map((card) => card.dataset.principleGroupWindow).filter((key) => !remembered.includes(key));
    const order = [...remembered, ...missing];
    order.forEach((key) => list.appendChild(byKey.get(key)));
    if (order.join("|") !== readOrder().join("|")) writeOrder(order);
  }

  function saveDomOrder(list = currentList()) {
    if (!list) return;
    writeOrder(cards(list).map((card) => card.dataset.principleGroupWindow));
  }

  function addInstruction(list = currentList()) {
    if (!list || list.previousElementSibling?.classList?.contains("principle-drag-help")) return;
    const help = document.createElement("div");
    help.className = "principle-drag-help";
    help.innerHTML = `<span aria-hidden="true">☝️</span><span><strong>Press and hold to organize.</strong> Drag a window to move it. Drop it onto another window to group them.</span>`;
    list.before(help);
  }

  function prepareBoard() {
    const list = currentList();
    if (!list) return;
    normalizeOrder(list);
    addInstruction(list);
    cards(list).forEach((card) => {
      card.classList.add("is-touch-movable");
      card.setAttribute("aria-description", "Press and hold, then drag to move or group this window.");
    });
  }

  function clearTimer() {
    if (pressTimer) window.clearTimeout(pressTimer);
    pressTimer = null;
  }

  function clearCandidate() {
    if (candidate) candidate.classList.remove("is-drop-target", "is-drop-before", "is-drop-after");
    candidate = null;
    dropMode = "";
  }

  function startDrag(event) {
    if (!source || busy) return;
    dragging = true;
    suppressClickUntil = Date.now() + 800;
    const rect = source.getBoundingClientRect();
    placeholder = document.createElement("div");
    placeholder.className = "principle-drag-placeholder";
    placeholder.style.height = `${rect.height}px`;
    source.parentNode.insertBefore(placeholder, source.nextSibling);
    source.classList.add("is-dragging");
    source.style.width = `${rect.width}px`;
    source.style.height = `${rect.height}px`;
    source.style.left = `${rect.left}px`;
    source.style.top = `${rect.top}px`;
    source.style.position = "fixed";
    source.style.zIndex = "80";
    source.style.pointerEvents = "none";
    source.style.margin = "0";
    document.body.classList.add("principle-drag-active");
    if (navigator.vibrate) navigator.vibrate(18);
    updateDrag(event.clientX, event.clientY);
  }

  function moveVisual(x, y) {
    if (!source) return;
    const rect = source.getBoundingClientRect();
    source.style.transform = `translate3d(${x - startX}px, ${y - startY}px, 0) rotate(.5deg)`;
    source.dataset.dragWidth = String(rect.width);
  }

  function targetAt(x, y) {
    const element = document.elementFromPoint(x, y);
    return element?.closest?.(".principle-group-window") || null;
  }

  function updateDropTarget(x, y) {
    clearCandidate();
    const target = targetAt(x, y);
    if (!target || target === source || !target.dataset.principleGroupWindow) return;
    const rect = target.getBoundingClientRect();
    const ratio = rect.height ? (y - rect.top) / rect.height : .5;
    candidate = target;
    if (ratio >= GROUP_ZONE_START && ratio <= GROUP_ZONE_END) {
      dropMode = "group";
      target.classList.add("is-drop-target");
    } else if (ratio < GROUP_ZONE_START) {
      dropMode = "before";
      target.classList.add("is-drop-before");
    } else {
      dropMode = "after";
      target.classList.add("is-drop-after");
    }
  }

  function updateDrag(x, y) {
    moveVisual(x, y);
    updateDropTarget(x, y);
  }

  function resetSourceVisual() {
    if (!source) return;
    source.classList.remove("is-dragging");
    source.removeAttribute("style");
    delete source.dataset.dragWidth;
  }

  async function groupWindows(sourceGroupKey, targetGroupKey) {
    if (!sourceGroupKey || !targetGroupKey || sourceGroupKey === targetGroupKey) return;
    busy = true;
    syncStatus("Grouping principles…", "saving");
    try {
      const client = getDb();
      const { data: authData, error: authError } = await client.auth.getSession();
      if (authError) throw authError;
      if (!authData?.session) throw new Error("Sign in with Google before grouping principles.");

      const { data: rows, error: rowsError } = await client
        .from("conflict_principles")
        .select("id, group_id, principle_number")
        .eq("plan_id", config.planId)
        .is("deleted_at", null);
      if (rowsError) throw rowsError;

      const membersFor = (key) => {
        if (key.startsWith("single:")) {
          const id = key.slice(7);
          return rows.filter((row) => row.id === id);
        }
        if (key.startsWith("group:")) {
          const id = key.slice(6);
          return rows.filter((row) => row.group_id === id);
        }
        return [];
      };

      const moving = membersFor(sourceGroupKey);
      const targetMembers = membersFor(targetGroupKey);
      if (!moving.length || !targetMembers.length) throw new Error("That principle window could not be found. Refresh and try again.");

      const { error } = await client.rpc("move_conflict_principles", {
        p_principle_ids: moving.map((row) => row.id),
        p_target_principle_id: targetMembers[0].id,
        p_mode: "existing",
        p_group_title: null,
      });
      if (error) throw error;

      const order = readOrder().filter((key) => key !== sourceGroupKey);
      writeOrder(order);
      syncStatus("Principles grouped", "synced");
      toast(moving.length === 1 ? "Principle grouped." : "Principle group merged.");
      if (navigator.vibrate) navigator.vibrate([22, 35, 22]);
      window.setTimeout(() => window.location.reload(), 320);
    } catch (error) {
      syncStatus("Sync failed", "error");
      toast(error?.message || "The principles could not be grouped.", "error");
    } finally {
      busy = false;
    }
  }

  function reorderWindow(sourceCard, targetCard, mode) {
    const list = currentList();
    if (!list || !sourceCard || !targetCard) return;
    if (mode === "before") list.insertBefore(sourceCard, targetCard);
    else list.insertBefore(sourceCard, targetCard.nextSibling);
    saveDomOrder(list);
    toast("Principle layout saved on this device.");
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function finishDrag() {
    clearTimer();
    if (!dragging) {
      pointerId = null;
      source = null;
      sourceKey = "";
      return;
    }

    suppressClickUntil = Date.now() + 800;
    const droppedSource = source;
    const droppedSourceKey = sourceKey;
    const droppedTarget = candidate;
    const droppedTargetKey = candidate?.dataset?.principleGroupWindow || "";
    const mode = dropMode;

    resetSourceVisual();
    if (placeholder?.parentNode) placeholder.parentNode.removeChild(placeholder);
    placeholder = null;
    document.body.classList.remove("principle-drag-active");
    clearCandidate();
    dragging = false;
    pointerId = null;
    source = null;
    sourceKey = "";

    if (!droppedTarget || !mode) {
      prepareBoard();
      return;
    }
    if (mode === "group") groupWindows(droppedSourceKey, droppedTargetKey);
    else reorderWindow(droppedSource, droppedTarget, mode);
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const card = event.target.closest?.(".principles-view .principle-group-window");
    if (!card || event.target.closest(".principles-toolbar, input, textarea, select")) return;
    pointerId = event.pointerId;
    source = card;
    sourceKey = card.dataset.principleGroupWindow || "";
    startX = event.clientX;
    startY = event.clientY;
    clearTimer();
    pressTimer = window.setTimeout(() => startDrag(event), HOLD_MS);
  }, { passive: true });

  document.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || !source) return;
    if (!dragging) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE) {
        clearTimer();
        pointerId = null;
        source = null;
        sourceKey = "";
      }
      return;
    }
    event.preventDefault();
    updateDrag(event.clientX, event.clientY);
  }, { passive: false });

  document.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    finishDrag();
  });

  document.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== pointerId) return;
    finishDrag();
  });

  document.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  const observer = new MutationObserver(() => window.requestAnimationFrame(prepareBoard));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", prepareBoard);
  window.requestAnimationFrame(prepareBoard);
})();
