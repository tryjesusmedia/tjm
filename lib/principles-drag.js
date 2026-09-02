(() => {
  "use strict";

  const HOLD_MS = 420;
  const MOVE_TOLERANCE = 10;
  const GROUP_ZONE_START = 0.22;
  const GROUP_ZONE_END = 0.78;
  const CLICK_SUPPRESS_MS = 1800;
  const config = window.TJM_CONFLICT_CONFIG || window.TJM_CHRONBIBLE_CONFIG;
  if (!config) return;

  let db = null;
  let pressTimer = null;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let source = null;
  let placeholder = null;
  let dragging = false;
  let candidate = null;
  let dropMode = "";
  let suppressClickUntil = 0;
  let busy = false;

  function boardStorageKey() {
    return `tjm-principle-board-order:${config.planId}`;
  }

  function groupStorageKey(list) {
    const ids = [...list.querySelectorAll(":scope > .principle-detail-card")]
      .map((card) => card.id.replace("principle-id-", ""))
      .filter(Boolean)
      .sort();
    return `tjm-principle-group-order:${config.planId}:${ids.join(".")}`;
  }

  function readStoredOrder(key) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
    } catch (_error) {
      return [];
    }
  }

  function writeStoredOrder(key, values) {
    try {
      window.localStorage.setItem(key, JSON.stringify(values));
    } catch (_error) {
      // Dragging still works for the current session when storage is unavailable.
    }
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

  function overviewList() {
    return document.querySelector(".principles-view .principle-group-list");
  }

  function overviewCards(list = overviewList()) {
    return list ? [...list.querySelectorAll(":scope > .principle-group-window")] : [];
  }

  function focusedList() {
    return document.querySelector(".focused-principle-group .principle-group-details");
  }

  function focusedCards(list = focusedList()) {
    return list ? [...list.querySelectorAll(":scope > .principle-detail-card")] : [];
  }

  function normalizeOverviewOrder(list = overviewList()) {
    if (!list) return;
    const cards = overviewCards(list);
    if (!cards.length) return;
    const byKey = new Map(cards.map((card) => [card.dataset.principleGroupWindow, card]));
    const saved = readStoredOrder(boardStorageKey()).filter((key) => byKey.has(key));
    const missing = cards.map((card) => card.dataset.principleGroupWindow).filter((key) => !saved.includes(key));
    const order = [...saved, ...missing];
    order.forEach((key) => list.appendChild(byKey.get(key)));
    writeStoredOrder(boardStorageKey(), order);
  }

  function normalizeFocusedOrder(list = focusedList()) {
    if (!list) return;
    const cards = focusedCards(list);
    if (cards.length < 2) return;
    const key = groupStorageKey(list);
    const byId = new Map(cards.map((card) => [card.id.replace("principle-id-", ""), card]));
    const saved = readStoredOrder(key).filter((id) => byId.has(id));
    const missing = cards.map((card) => card.id.replace("principle-id-", "")).filter((id) => !saved.includes(id));
    const order = [...saved, ...missing];
    order.forEach((id) => list.appendChild(byId.get(id)));
    writeStoredOrder(key, order);
  }

  function saveOverviewOrder(list = overviewList()) {
    if (!list) return;
    writeStoredOrder(boardStorageKey(), overviewCards(list).map((card) => card.dataset.principleGroupWindow));
  }

  function saveFocusedOrder(list = focusedList()) {
    if (!list) return;
    writeStoredOrder(groupStorageKey(list), focusedCards(list).map((card) => card.id.replace("principle-id-", "")));
  }

  function addOverviewInstruction(list) {
    if (!list || list.previousElementSibling?.classList?.contains("principle-drag-help")) return;
    const help = document.createElement("div");
    help.className = "principle-drag-help";
    help.innerHTML = `<span aria-hidden="true">☝️</span><span><strong>Press and hold to organize.</strong> Drag a window to move it. Drop it onto another window to group them. Open a group to rearrange the principles inside it.</span>`;
    list.before(help);
  }

  function addFocusedInstruction(list) {
    if (!list || list.previousElementSibling?.classList?.contains("principle-inner-drag-help")) return;
    const help = document.createElement("div");
    help.className = "principle-inner-drag-help";
    help.innerHTML = `<span aria-hidden="true">↕</span><span><strong>Reorder this group:</strong> press and hold a principle card, then drag it above or below another principle.</span>`;
    list.before(help);
  }

  function prepareBoard() {
    const overview = overviewList();
    if (overview) {
      normalizeOverviewOrder(overview);
      addOverviewInstruction(overview);
      overviewCards(overview).forEach((card) => {
        card.classList.add("is-touch-movable");
        card.setAttribute("aria-description", "Press and hold, then drag to move or group this window.");
      });
    }

    const focused = focusedList();
    if (focused) {
      normalizeFocusedOrder(focused);
      if (focusedCards(focused).length > 1) addFocusedInstruction(focused);
      focusedCards(focused).forEach((card) => {
        card.classList.add("is-touch-movable-principle");
        card.setAttribute("aria-description", "Press and hold, then drag to reorder this principle inside its group.");
      });
    }
  }

  function clearTimer() {
    if (pressTimer) window.clearTimeout(pressTimer);
    pressTimer = null;
  }

  function clearCandidate() {
    if (candidate) candidate.classList.remove("is-drop-target", "is-drop-before", "is-drop-after", "is-principle-drop-before", "is-principle-drop-after");
    candidate = null;
    dropMode = "";
  }

  function makeSource(element, type) {
    return {
      element,
      type,
      key: type === "window" ? element.dataset.principleGroupWindow : element.id.replace("principle-id-", ""),
      list: element.parentElement,
    };
  }

  function draggableFromTarget(target) {
    if (!target?.closest) return null;

    const detail = target.closest(".focused-principle-group .principle-detail-card");
    if (detail) {
      if (target.closest("button, a, input, textarea, select, label, form")) return null;
      return makeSource(detail, "principle");
    }

    const windowCard = target.closest(".principles-view .principle-group-window");
    if (windowCard) {
      if (target.closest(".principles-toolbar, input, textarea, select, label, form")) return null;
      return makeSource(windowCard, "window");
    }

    return null;
  }

  function startDrag(event) {
    if (!source || busy) return;
    dragging = true;
    suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
    const element = source.element;
    const rect = element.getBoundingClientRect();

    placeholder = document.createElement("div");
    placeholder.className = source.type === "principle" ? "principle-inner-drag-placeholder" : "principle-drag-placeholder";
    placeholder.style.height = `${rect.height}px`;
    element.parentNode.insertBefore(placeholder, element.nextSibling);

    element.classList.add("is-dragging");
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.position = "fixed";
    element.style.zIndex = "80";
    element.style.pointerEvents = "none";
    element.style.margin = "0";
    document.body.classList.add("principle-drag-active");
    if (navigator.vibrate) navigator.vibrate(18);
    updateDrag(event.clientX, event.clientY);
  }

  function moveVisual(x, y) {
    if (!source) return;
    source.element.style.transform = `translate3d(${x - startX}px, ${y - startY}px, 0) rotate(.5deg)`;
  }

  function targetAt(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element || !source) return null;
    if (source.type === "principle") {
      const target = element.closest?.(".principle-detail-card") || null;
      return target?.parentElement === source.list ? target : null;
    }
    return element.closest?.(".principle-group-window") || null;
  }

  function updateDropTarget(x, y) {
    clearCandidate();
    const target = targetAt(x, y);
    if (!target || target === source?.element) return;
    const rect = target.getBoundingClientRect();
    const ratio = rect.height ? (y - rect.top) / rect.height : .5;
    candidate = target;

    if (source.type === "principle") {
      dropMode = ratio < .5 ? "before" : "after";
      target.classList.add(dropMode === "before" ? "is-principle-drop-before" : "is-principle-drop-after");
      return;
    }

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
    if (!source?.element) return;
    source.element.classList.remove("is-dragging");
    source.element.removeAttribute("style");
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
        if (key.startsWith("single:")) return rows.filter((row) => row.id === key.slice(7));
        if (key.startsWith("group:")) return rows.filter((row) => row.group_id === key.slice(6));
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

      writeStoredOrder(boardStorageKey(), readStoredOrder(boardStorageKey()).filter((key) => key !== sourceGroupKey));
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

  function reorder(sourceElement, targetElement, mode, type) {
    const list = sourceElement?.parentElement;
    if (!list || !targetElement || targetElement.parentElement !== list) return;
    if (mode === "before") list.insertBefore(sourceElement, targetElement);
    else list.insertBefore(sourceElement, targetElement.nextSibling);

    if (type === "principle") {
      saveFocusedOrder(list);
      toast("Principle order saved on this device.");
    } else {
      saveOverviewOrder(list);
      toast("Principle layout saved on this device.");
    }
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function finishDrag() {
    clearTimer();
    if (!dragging) {
      pointerId = null;
      source = null;
      return;
    }

    suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
    const droppedSource = source;
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

    if (!droppedTarget || !mode) {
      prepareBoard();
      return;
    }

    if (droppedSource.type === "principle") {
      reorder(droppedSource.element, droppedTarget, mode, "principle");
      return;
    }

    if (mode === "group") groupWindows(droppedSource.key, droppedTargetKey);
    else reorder(droppedSource.element, droppedTarget, mode, "window");
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const found = draggableFromTarget(event.target);
    if (!found) return;
    pointerId = event.pointerId;
    source = found;
    startX = event.clientX;
    startY = event.clientY;
    clearTimer();
    pressTimer = window.setTimeout(() => startDrag(event), HOLD_MS);
  }, { capture: true, passive: true });

  document.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || !source) return;
    if (!dragging) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE) {
        clearTimer();
        pointerId = null;
        source = null;
      }
      return;
    }
    event.preventDefault();
    updateDrag(event.clientX, event.clientY);
  }, { capture: true, passive: false });

  document.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    if (dragging) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    finishDrag();
  }, { capture: true, passive: false });

  document.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== pointerId) return;
    if (dragging) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    finishDrag();
  }, { capture: true, passive: false });

  document.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  const observer = new MutationObserver(() => window.requestAnimationFrame(prepareBoard));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", prepareBoard);
  window.requestAnimationFrame(prepareBoard);
})();
