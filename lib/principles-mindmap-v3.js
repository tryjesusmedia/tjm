(() => {
  "use strict";

  const config = window.TJM_CONFLICT_CONFIG || window.TJM_CHRONBIBLE_CONFIG;
  if (!config) return;

  const HOLD_MS = 300;
  const MOVE_TOLERANCE = 8;
  const MIN_SCALE = 0.45;
  const MAX_SCALE = 2.25;
  const ZOOM_STEP = 0.15;
  const storagePrefix = `tjm-principle-mindmap:${config.planId}`;

  let db = null;
  let rows = [];
  let rowsAt = 0;
  let queued = false;
  let preparing = false;
  let gesture = null;
  let holdTimer = null;
  let suppressUntil = 0;
  let zCounter = 100;
  let pinch = null;
  const touchPoints = new Map();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(`${storagePrefix}:${key}`) || "null");
      return value ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(`${storagePrefix}:${key}`, JSON.stringify(value)); } catch (_error) {}
  }

  function safeText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function escapeHTML(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function firstWords(text, max = 9) {
    const line = String(text || "").split(/\r?\n/).find((part) => part.trim())?.trim() || "Untitled principle";
    const words = line.split(/\s+/);
    return words.length > max ? `${words.slice(0, max).join(" ")}…` : line;
  }

  function getDb() {
    if (db) return db;
    if (!window.supabase?.createClient) throw new Error("Account sync is unavailable.");
    db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
    });
    return db;
  }

  async function refreshRows(force = false) {
    if (!force && rows.length && Date.now() - rowsAt < 2500) return rows;
    try {
      const client = getDb();
      const { data: authData } = await client.auth.getSession();
      if (!authData?.session) { rows = []; return rows; }
      const { data, error } = await client
        .from("conflict_principles")
        .select("id, reading_id, principle_number, body, group_id, group_title, deleted_at")
        .eq("plan_id", config.planId)
        .is("deleted_at", null);
      if (error) throw error;
      rows = data || [];
      rowsAt = Date.now();
    } catch (_error) {}
    return rows;
  }

  function rowById(id) { return rows.find((row) => row.id === id); }
  function rowByNumber(number) { return rows.find((row) => Number(row.principle_number) === Number(number)); }

  function groupOrders() { return readJSON("group-orders", {}); }
  function saveGroupOrders(value) { writeJSON("group-orders", value); }
  function leaders() { return readJSON("leaders", {}); }
  function saveLeaders(value) { writeJSON("leaders", value); }
  function mainPositions() { return readJSON("positions", {}); }
  function saveMainPositions(value) { writeJSON("positions", value); }
  function groupMapPositions(groupKey) { return readJSON(`group-map-positions:${groupKey}`, {}); }
  function saveGroupMapPositions(groupKey, value) { writeJSON(`group-map-positions:${groupKey}`, value); }
  function viewState(mapId) { return readJSON(`view:${mapId}`, { scale: 1, x: 0, y: 0 }); }
  function saveViewState(mapId, value) { writeJSON(`view:${mapId}`, value); }

  function toast(message, type = "") {
    const region = document.getElementById("toast-region");
    if (!region) return;
    const item = document.createElement("div");
    item.className = `toast${type ? ` ${type}` : ""}`;
    item.textContent = message;
    region.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }

  function reloadIntoPrinciples() {
    try { sessionStorage.setItem(`${storagePrefix}:return`, "1"); } catch (_error) {}
    location.reload();
  }

  function groupIdFromKey(key) {
    return String(key || "").startsWith("group:") ? String(key).slice(6) : "";
  }

  function customGroupTitle(groupId) {
    return String(rows.find((row) => row.group_id === groupId && String(row.group_title || "").trim())?.group_title || "").trim();
  }

  function memberIds(groupId) {
    return rows.filter((row) => row.group_id === groupId).map((row) => row.id);
  }

  function orderedIdsForGroup(groupId) {
    const ids = memberIds(groupId);
    const stored = groupOrders()[groupId] || [];
    const valid = stored.filter((id) => ids.includes(id));
    return [...valid, ...ids.filter((id) => !valid.includes(id))];
  }

  function setGroupOrder(groupId, ids) {
    if (!groupId) return;
    const validIds = ids.filter((id) => memberIds(groupId).includes(id));
    const allIds = memberIds(groupId);
    const finalIds = [...validIds, ...allIds.filter((id) => !validIds.includes(id))];
    const orders = groupOrders();
    if (JSON.stringify(orders[groupId] || []) !== JSON.stringify(finalIds)) {
      orders[groupId] = finalIds;
      saveGroupOrders(orders);
    }
    if (finalIds[0]) setLeader(groupId, finalIds[0], false);
  }

  function setLeader(groupId, principleId, reorder = true) {
    if (!groupId || !principleId) return;
    const value = leaders();
    if (value[groupId] !== principleId) {
      value[groupId] = principleId;
      saveLeaders(value);
    }
    if (reorder) {
      const ids = orderedIdsForGroup(groupId).filter((id) => id !== principleId);
      const orders = groupOrders();
      const finalIds = [principleId, ...ids];
      if (JSON.stringify(orders[groupId] || []) !== JSON.stringify(finalIds)) {
        orders[groupId] = finalIds;
        saveGroupOrders(orders);
      }
    }
  }

  function leaderForGroup(groupId) {
    const ids = memberIds(groupId);
    if (!ids.length) return null;
    const stored = leaders()[groupId];
    if (stored && ids.includes(stored)) return rowById(stored);
    const first = orderedIdsForGroup(groupId)[0] || ids[0];
    if (first) setLeader(groupId, first);
    return rowById(first) || null;
  }

  function reorderCircleDOM(container, orderedIds) {
    if (!container) return;
    const circles = [...container.querySelectorAll("[data-principle-id], .principle-circle")];
    const byId = new Map();
    const current = [];
    for (const circle of circles) {
      const id = circle.dataset.principleId || rowByNumber(circle.textContent.trim())?.id;
      if (!id) continue;
      byId.set(id, circle);
      current.push(id);
    }
    const target = [...orderedIds.filter((id) => byId.has(id)), ...current.filter((id) => !orderedIds.includes(id))];
    if (JSON.stringify(current) === JSON.stringify(target)) return;
    target.forEach((id) => container.appendChild(byId.get(id)));
  }

  function ensureDerivedGroupTitle(node, leaderNumber, custom) {
    const copy = node.querySelector(".principle-group-copy");
    if (!copy) return;
    let title = copy.querySelector(".principle-group-title");
    if (custom) return;
    if (!title) {
      title = document.createElement("span");
      title.className = "principle-group-title tjm-derived-group-title";
      const preview = copy.querySelector(".principle-first-line");
      if (preview) copy.insertBefore(title, preview);
      else copy.appendChild(title);
    }
    safeText(title, `Group led by #${leaderNumber}`);
  }

  function applyLeaderLabels() {
    document.querySelectorAll('.principles-view [data-principle-group-window^="group:"]').forEach((node) => {
      const groupId = groupIdFromKey(node.dataset.principleGroupWindow);
      const leader = leaderForGroup(groupId);
      if (!leader) return;
      const custom = customGroupTitle(groupId);
      safeText(node.querySelector(".principle-group-copy > small"), `GROUP · LED BY PRINCIPLE #${leader.principle_number}`);
      ensureDerivedGroupTitle(node, leader.principle_number, custom);
      safeText(node.querySelector(".principle-first-line"), firstWords(leader.body, 12));
      reorderCircleDOM(node.querySelector(".mindmap-circle-bar, .principle-circles"), orderedIdsForGroup(groupId));
    });

    const focused = document.querySelector(".focused-principle-group");
    if (!focused) return;
    const ids = [...focused.querySelectorAll(".principle-detail-card")].map((card) => card.id.replace(/^principle-id-/, ""));
    const groupId = ids.map(rowById).find((row) => row?.group_id)?.group_id || "";
    if (!groupId) return;
    const leader = leaderForGroup(groupId);
    if (!leader) return;
    const custom = customGroupTitle(groupId);
    safeText(focused.querySelector(".focused-group-heading .eyebrow"), `GROUP LED BY PRINCIPLE #${leader.principle_number}`);
    if (!custom) safeText(focused.querySelector("#focused-group-heading"), `Group led by #${leader.principle_number}`);
  }

  function enhanceCopy() {
    document.querySelectorAll(".principles-view-heading p").forEach((paragraph) => {
      if (/ordered by their lowest principle number/i.test(paragraph.textContent)) {
        safeText(paragraph, "Place groups and principles anywhere on your Mind Map. Their numbers never change, and your arrangement does not have to follow numerical order.");
      }
    });
    document.querySelectorAll(".principle-mindmap-help strong").forEach((item) => safeText(item, "Mind Map"));
    document.querySelectorAll(".principle-mindmap-help span, .mindmap-group-drag-help").forEach((item) => {
      const next = item.textContent.replace(/Mind map arena/gi, "Mind Map").replace(/arena/gi, "map");
      safeText(item, next);
    });
  }

  function compactStandaloneNodes() {
    document.querySelectorAll('.principles-view [data-principle-group-window^="single:"]').forEach((node) => {
      const id = node.dataset.principleGroupWindow.slice(7);
      const row = rowById(id);
      if (!row) return;
      node.classList.add("tjm-standalone-compact");
      let button = node.querySelector(":scope > .tjm-single-preview");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "tjm-single-preview";
        button.dataset.openPrinciple = row.id;
        button.innerHTML = `<span class="principle-circle mindmap-principle-circle" data-principle-id="${row.id}" data-principle-number="${row.principle_number}" data-source-node-key="single:${row.id}">${row.principle_number}</span><span></span>`;
        node.appendChild(button);
      }
      safeText(button.querySelector(":scope > span:last-child"), firstWords(row.body, 7));
    });
  }

  function ensureControls(viewport, mapId) {
    if (!viewport) return;
    let controls = viewport.previousElementSibling?.classList.contains("tjm-map-controls") ? viewport.previousElementSibling : null;
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "tjm-map-controls";
      controls.innerHTML = `<span>Mind Map</span><div><button type="button" data-map-zoom="out" aria-label="Zoom out">−</button><button type="button" data-map-zoom="reset">100%</button><button type="button" data-map-zoom="in" aria-label="Zoom in">+</button></div>`;
      viewport.before(controls);
    }
    controls.dataset.mapId = mapId;
  }

  function applyView(viewport, canvas, mapId) {
    if (!viewport || !canvas || !mapId) return;
    const state = viewState(mapId);
    state.scale = clamp(Number(state.scale) || 1, MIN_SCALE, MAX_SCALE);
    state.x = Number(state.x) || 0;
    state.y = Number(state.y) || 0;
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    const controls = viewport.previousElementSibling?.classList.contains("tjm-map-controls") ? viewport.previousElementSibling : null;
    safeText(controls?.querySelector('[data-map-zoom="reset"]'), `${Math.round(state.scale * 100)}%`);
  }

  function setupViewport(viewport, canvas, mapId) {
    if (!viewport || !canvas) return;
    viewport.classList.add("tjm-map-viewport");
    canvas.classList.add("tjm-map-canvas");
    viewport.dataset.mapId = mapId;
    canvas.dataset.mapId = mapId;
    ensureControls(viewport, mapId);
    applyView(viewport, canvas, mapId);
  }

  function setZoomAt(viewport, canvas, mapId, nextScale, clientX, clientY) {
    const state = viewState(mapId);
    const oldScale = clamp(Number(state.scale) || 1, MIN_SCALE, MAX_SCALE);
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const rect = viewport.getBoundingClientRect();
    const localX = (clientX ?? (rect.left + rect.width / 2)) - rect.left;
    const localY = (clientY ?? (rect.top + rect.height / 2)) - rect.top;
    const oldX = Number(state.x) || 0;
    const oldY = Number(state.y) || 0;
    const worldX = (localX - oldX) / oldScale;
    const worldY = (localY - oldY) / oldScale;
    state.scale = scale;
    state.x = localX - worldX * scale;
    state.y = localY - worldY * scale;
    saveViewState(mapId, state);
    applyView(viewport, canvas, mapId);
  }

  function resetView(viewport, canvas, mapId) {
    saveViewState(mapId, { scale: 1, x: 0, y: 0 });
    applyView(viewport, canvas, mapId);
  }

  function prepareMainMap() {
    const canvas = document.querySelector(".principles-view .principle-group-list");
    if (!canvas) return;
    const viewport = canvas.parentElement?.classList.contains("principle-arena-scroll") ? canvas.parentElement : null;
    if (!viewport) return;
    setupViewport(viewport, canvas, "main");
    compactStandaloneNodes();
  }

  function focusedInfo(focused) {
    const cards = [...focused.querySelectorAll(".principle-detail-card")];
    const ids = cards.map((card) => card.id.replace(/^principle-id-/, ""));
    const memberRows = ids.map(rowById).filter(Boolean);
    const groupId = memberRows.find((row) => row.group_id)?.group_id || `single:${ids[0] || "empty"}`;
    return { cards, ids, groupId };
  }

  function ensureGroupSummary(card, row) {
    if (!row) return;
    let summary = card.querySelector(":scope > .tjm-group-card-summary");
    if (!summary) {
      summary = document.createElement("button");
      summary.type = "button";
      summary.className = "tjm-group-card-summary";
      summary.dataset.tjmTogglePrinciple = row.id;
      summary.innerHTML = `<span class="principle-circle" data-tjm-drag-principle="${row.id}">${row.principle_number}</span><span></span>`;
      card.prepend(summary);
      card.classList.remove("is-group-card-expanded");
    }
    safeText(summary.querySelector(":scope > span:last-child"), firstWords(row.body, 10));
  }

  function recomputeLeaderFromFocused(focused, groupId) {
    if (!focused || !groupId || String(groupId).startsWith("single:")) return;
    const cards = [...focused.querySelectorAll(".tjm-group-map-node")];
    if (!cards.length) return;
    cards.sort((a, b) => {
      const ay = parseFloat(a.style.top) || 0;
      const by = parseFloat(b.style.top) || 0;
      if (Math.abs(ay - by) > 18) return ay - by;
      return (parseFloat(a.style.left) || 0) - (parseFloat(b.style.left) || 0);
    });
    const ids = cards.map((card) => card.dataset.tjmPrincipleId).filter(Boolean);
    setGroupOrder(groupId, ids);
    applyLeaderLabels();
  }

  function prepareGroupMap() {
    const focused = document.querySelector(".focused-principle-group");
    if (!focused) return;
    const details = focused.querySelector(".principle-group-details");
    if (!details) return;
    const info = focusedInfo(focused);

    let viewport = details.parentElement?.classList.contains("tjm-group-map-viewport") ? details.parentElement : null;
    if (!viewport) {
      viewport = document.createElement("div");
      viewport.className = "tjm-group-map-viewport";
      details.parentNode.insertBefore(viewport, details);
      viewport.appendChild(details);
    }
    details.classList.add("tjm-group-map-canvas");
    setupViewport(viewport, details, `group:${info.groupId}`);

    const positions = groupMapPositions(info.groupId);
    const order = orderedIdsForGroup(info.groupId);
    const orderedCards = [...info.cards].sort((a, b) => {
      const aid = a.id.replace(/^principle-id-/, "");
      const bid = b.id.replace(/^principle-id-/, "");
      const ai = order.indexOf(aid), bi = order.indexOf(bid);
      return (ai < 0 ? 99999 : ai) - (bi < 0 ? 99999 : bi);
    });

    orderedCards.forEach((card, index) => {
      const id = card.id.replace(/^principle-id-/, "");
      if (!positions[id]) positions[id] = { x: 35 + (index % 3) * 295, y: 35 + Math.floor(index / 3) * 155, z: index + 1 };
      const pos = positions[id];
      card.classList.add("tjm-group-map-node");
      card.dataset.tjmPrincipleId = id;
      card.style.left = `${Number(pos.x) || 0}px`;
      card.style.top = `${Number(pos.y) || 0}px`;
      card.style.zIndex = String(Number(pos.z) || index + 1);
      ensureGroupSummary(card, rowById(id));
    });
    saveGroupMapPositions(info.groupId, positions);
    details.style.width = "1200px";
    details.style.height = `${Math.max(780, ...Object.values(positions).map((p) => (Number(p.y) || 0) + 280))}px`;
    recomputeLeaderFromFocused(focused, info.groupId);
  }

  function mapContext(target) {
    const groupViewport = target.closest?.(".tjm-group-map-viewport");
    if (groupViewport) return { viewport: groupViewport, canvas: groupViewport.querySelector(".tjm-group-map-canvas"), mapId: groupViewport.dataset.mapId };
    const mainViewport = target.closest?.(".principle-arena-scroll.tjm-map-viewport");
    if (mainViewport) return { viewport: mainViewport, canvas: mainViewport.querySelector(".principle-group-list"), mapId: mainViewport.dataset.mapId };
    return null;
  }

  function pointerToWorld(event, context) {
    const rect = context.viewport.getBoundingClientRect();
    const state = viewState(context.mapId);
    const scale = clamp(Number(state.scale) || 1, MIN_SCALE, MAX_SCALE);
    return {
      x: (event.clientX - rect.left - (Number(state.x) || 0)) / scale,
      y: (event.clientY - rect.top - (Number(state.y) || 0)) / scale,
    };
  }

  function markDragging() {
    suppressUntil = Date.now() + 2200;
    window.__TJM_MINDMAP_DRAGGING = true;
  }

  function releaseDraggingLater() {
    setTimeout(() => {
      if (Date.now() >= suppressUntil) window.__TJM_MINDMAP_DRAGGING = false;
    }, 2300);
  }

  function clearHold() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  }

  function promoteNode(pending, event) {
    const point = pointerToWorld({ clientX: pending.startClientX, clientY: pending.startClientY }, pending.context);
    const element = pending.element;
    gesture = {
      type: "node",
      pointerId: pending.pointerId,
      element,
      kind: pending.kind,
      context: pending.context,
      startClientX: pending.startClientX,
      startClientY: pending.startClientY,
      startWorldX: point.x,
      startWorldY: point.y,
      startX: parseFloat(element.style.left) || 0,
      startY: parseFloat(element.style.top) || 0,
      dragging: true,
    };
    element.classList.add("tjm-v3-dragging");
    markDragging();
    if (navigator.vibrate) navigator.vibrate(15);
    moveNodeGesture(event);
  }

  function promoteCircle(pending, event) {
    const principleId = pending.principleId;
    if (!principleId) return;
    if (pending.context.mapId?.startsWith("group:")) {
      const card = pending.circle.closest(".tjm-group-map-node");
      if (card) promoteNode({ ...pending, element: card, kind: "group-principle" }, event);
      return;
    }
    gesture = {
      type: "circle",
      pointerId: pending.pointerId,
      circle: pending.circle,
      principleId,
      sourceNodeKey: pending.sourceNodeKey,
      context: pending.context,
      startClientX: pending.startClientX,
      startClientY: pending.startClientY,
      dragging: true,
    };
    pending.circle.classList.add("tjm-v3-circle-dragging");
    markDragging();
    if (navigator.vibrate) navigator.vibrate(15);
    moveCircleGesture(event);
  }

  function beginPan(event, context) {
    const state = viewState(context.mapId);
    gesture = {
      type: "pan",
      pointerId: event.pointerId,
      context,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(state.x) || 0,
      startY: Number(state.y) || 0,
      dragging: false,
    };
  }

  function moveNodeGesture(event) {
    const point = pointerToWorld(event, gesture.context);
    gesture.element.style.left = `${Math.max(0, gesture.startX + (point.x - gesture.startWorldX))}px`;
    gesture.element.style.top = `${Math.max(0, gesture.startY + (point.y - gesture.startWorldY))}px`;
    gesture.element.style.zIndex = String(++zCounter);
  }

  function moveCircleGesture(event) {
    gesture.circle.style.transform = `translate(${event.clientX - gesture.startClientX}px, ${event.clientY - gesture.startClientY}px) scale(1.1)`;
  }

  function startPinchIfReady(context) {
    const points = [...touchPoints.entries()].filter(([, point]) => point.context?.viewport === context.viewport);
    if (points.length < 2) return false;
    clearHold();
    gesture?.element?.classList.remove("tjm-v3-dragging");
    if (gesture?.circle) gesture.circle.style.transform = "";
    gesture = null;
    const [[idA, a], [idB, b]] = points.slice(0, 2);
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const state = viewState(context.mapId);
    const scale = clamp(Number(state.scale) || 1, MIN_SCALE, MAX_SCALE);
    const rect = context.viewport.getBoundingClientRect();
    pinch = {
      ids: [idA, idB], context, startDistance: distance, startScale: scale,
      worldX: (midX - rect.left - (Number(state.x) || 0)) / scale,
      worldY: (midY - rect.top - (Number(state.y) || 0)) / scale,
    };
    markDragging();
    return true;
  }

  function updatePinch() {
    if (!pinch) return;
    const a = touchPoints.get(pinch.ids[0]);
    const b = touchPoints.get(pinch.ids[1]);
    if (!a || !b) return;
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const scale = clamp(pinch.startScale * (distance / pinch.startDistance), MIN_SCALE, MAX_SCALE);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const rect = pinch.context.viewport.getBoundingClientRect();
    const state = viewState(pinch.context.mapId);
    state.scale = scale;
    state.x = midX - rect.left - pinch.worldX * scale;
    state.y = midY - rect.top - pinch.worldY * scale;
    saveViewState(pinch.context.mapId, state);
    applyView(pinch.context.viewport, pinch.context.canvas, pinch.context.mapId);
  }

  async function movePrincipleToNode(principleId, sourceNodeKey, targetNode, pointerX) {
    const principle = rowById(principleId);
    if (!principle) return;
    const targetKey = targetNode?.dataset.principleGroupWindow || targetNode?.dataset.mindmapNodeKey || "";
    if (!targetKey) return;

    if (targetKey === sourceNodeKey && targetKey.startsWith("group:")) {
      const groupId = groupIdFromKey(targetKey);
      const bar = targetNode.querySelector(".mindmap-circle-bar, .principle-circles");
      const circles = [...(bar?.querySelectorAll("[data-principle-id]") || [])].filter((circle) => circle.dataset.principleId !== principleId);
      let insertAt = circles.length;
      for (let i = 0; i < circles.length; i++) {
        const rect = circles[i].getBoundingClientRect();
        if (pointerX < rect.left + rect.width / 2) { insertAt = i; break; }
      }
      const ids = circles.map((circle) => circle.dataset.principleId);
      ids.splice(insertAt, 0, principleId);
      setGroupOrder(groupId, ids);
      setLeader(groupId, ids[0]);
      reorderCircleDOM(bar, ids);
      applyLeaderLabels();
      toast(`Principle #${principle.principle_number} repositioned.`);
      return;
    }

    const client = getDb();
    const { data: authData } = await client.auth.getSession();
    if (!authData?.session) throw new Error("Sign in to organize principles.");

    if (targetKey.startsWith("localgroup:")) {
      const localId = targetKey.slice(11);
      const localGroups = readJSON("empty-groups", []);
      const local = localGroups.find((item) => item.id === localId);
      const { data, error } = await client.rpc("move_conflict_principles", {
        p_principle_ids: [principleId], p_target_principle_id: null, p_mode: "new", p_group_title: local?.title || null,
      });
      if (error) throw error;
      const returned = Array.isArray(data) ? data : [];
      const created = returned.find((row) => row.id === principleId);
      if (created?.group_id) {
        const orders = groupOrders();
        orders[created.group_id] = [principleId];
        saveGroupOrders(orders);
        setLeader(created.group_id, principleId);
      }
      writeJSON("empty-groups", localGroups.filter((item) => item.id !== localId));
      rowsAt = 0;
      reloadIntoPrinciples();
      return;
    }

    let targetId = "";
    if (targetKey.startsWith("single:")) targetId = targetKey.slice(7);
    else if (targetKey.startsWith("group:")) targetId = orderedIdsForGroup(groupIdFromKey(targetKey))[0] || memberIds(groupIdFromKey(targetKey))[0] || "";
    if (!targetId || targetId === principleId) return;

    const targetRow = rowById(targetId);
    const sourceGroup = principle.group_id;
    const targetGroupBefore = targetRow?.group_id;
    const { data, error } = await client.rpc("move_conflict_principles", {
      p_principle_ids: [principleId], p_target_principle_id: targetId, p_mode: "existing", p_group_title: null,
    });
    if (error) throw error;
    const returned = Array.isArray(data) ? data : [];
    const moved = returned.find((row) => row.id === principleId);
    const targetAfter = returned.find((row) => row.id === targetId);
    const destination = moved?.group_id || targetAfter?.group_id;
    if (destination) {
      const existing = groupOrders()[destination] || [];
      const base = targetGroupBefore ? existing : [targetId];
      setGroupOrder(destination, [...base.filter((id) => id !== principleId), principleId]);
      const leader = (groupOrders()[destination] || [targetId])[0] || targetId;
      setLeader(destination, leader);
    }
    if (sourceGroup && sourceGroup !== destination) {
      const remaining = orderedIdsForGroup(sourceGroup).filter((id) => id !== principleId);
      setGroupOrder(sourceGroup, remaining);
      if (remaining[0]) setLeader(sourceGroup, remaining[0]);
    }
    rowsAt = 0;
    reloadIntoPrinciples();
  }

  async function makeStandalone(principleId) {
    const principle = rowById(principleId);
    if (!principle?.group_id) return;
    const oldGroup = principle.group_id;
    const client = getDb();
    const { error } = await client.rpc("move_conflict_principles", {
      p_principle_ids: [principleId], p_target_principle_id: null, p_mode: "standalone", p_group_title: null,
    });
    if (error) throw error;
    const remaining = orderedIdsForGroup(oldGroup).filter((id) => id !== principleId);
    setGroupOrder(oldGroup, remaining);
    if (remaining[0]) setLeader(oldGroup, remaining[0]);
    rowsAt = 0;
    reloadIntoPrinciples();
  }

  document.addEventListener("pointerdown", (event) => {
    const context = mapContext(event.target);
    if (!context || (event.button !== undefined && event.button !== 0)) return;

    if (event.pointerType === "touch") {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY, context });
      if (startPinchIfReady(context)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }

    const interactive = event.target.closest?.("input, textarea, select, form, .principle-menu, .principle-visible-actions, [contenteditable='true']");
    const circle = event.target.closest?.("[data-principle-id], [data-tjm-drag-principle]");
    const groupCard = event.target.closest?.(".tjm-group-map-node");
    const mainNode = event.target.closest?.(".principle-group-list > .mindmap-node");

    event.stopImmediatePropagation();
    clearHold();

    if (interactive) {
      gesture = null;
      return;
    }

    if (circle) {
      const principleId = circle.dataset.principleId || circle.dataset.tjmDragPrinciple || circle.closest("[data-tjm-principle-id]")?.dataset.tjmPrincipleId;
      gesture = {
        type: "pending", kind: "circle", pointerId: event.pointerId, context, circle, principleId,
        sourceNodeKey: circle.dataset.sourceNodeKey || circle.closest("[data-principle-group-window]")?.dataset.principleGroupWindow || "",
        startClientX: event.clientX, startClientY: event.clientY,
      };
      const pending = gesture;
      holdTimer = setTimeout(() => { if (gesture === pending) promoteCircle(pending, { clientX: pending.startClientX, clientY: pending.startClientY }); }, HOLD_MS);
      return;
    }

    if (groupCard) {
      gesture = { type: "pending", kind: "group-principle", pointerId: event.pointerId, context, element: groupCard, startClientX: event.clientX, startClientY: event.clientY };
      const pending = gesture;
      holdTimer = setTimeout(() => { if (gesture === pending) promoteNode(pending, { clientX: pending.startClientX, clientY: pending.startClientY }); }, HOLD_MS);
      return;
    }

    if (mainNode) {
      gesture = { type: "pending", kind: "main-node", pointerId: event.pointerId, context, element: mainNode, startClientX: event.clientX, startClientY: event.clientY };
      const pending = gesture;
      holdTimer = setTimeout(() => { if (gesture === pending) promoteNode(pending, { clientX: pending.startClientX, clientY: pending.startClientY }); }, HOLD_MS);
      return;
    }

    beginPan(event, context);
  }, { capture: true, passive: false });

  document.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && touchPoints.has(event.pointerId)) {
      const point = touchPoints.get(event.pointerId);
      point.x = event.clientX; point.y = event.clientY;
      if (pinch?.ids.includes(event.pointerId)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        updatePinch();
        return;
      }
    }

    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - gesture.startClientX, event.clientY - gesture.startClientY);

    if (gesture.type === "pending") {
      if (distance <= MOVE_TOLERANCE) return;
      clearHold();
      const pending = gesture;
      if (pending.kind === "circle") promoteCircle(pending, event);
      else promoteNode(pending, event);
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (gesture.type === "pan") {
      if (distance > MOVE_TOLERANCE && !gesture.dragging) {
        gesture.dragging = true;
        markDragging();
      }
      if (!gesture.dragging) return;
      const state = viewState(gesture.context.mapId);
      state.x = gesture.startX + (event.clientX - gesture.startClientX);
      state.y = gesture.startY + (event.clientY - gesture.startClientY);
      saveViewState(gesture.context.mapId, state);
      applyView(gesture.context.viewport, gesture.context.canvas, gesture.context.mapId);
      return;
    }

    if (gesture.type === "node") moveNodeGesture(event);
    else if (gesture.type === "circle") moveCircleGesture(event);
  }, { capture: true, passive: false });

  document.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") {
      touchPoints.delete(event.pointerId);
      if (pinch?.ids.includes(event.pointerId)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        pinch = null;
        markDragging();
        releaseDraggingLater();
        return;
      }
    }

    if (!gesture || gesture.pointerId !== event.pointerId) return;
    clearHold();
    const current = gesture;
    gesture = null;

    if (current.type === "pending") return;
    if (current.type === "pan" && !current.dragging) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    markDragging();

    if (current.type === "node") {
      current.element.classList.remove("tjm-v3-dragging");
      const x = parseFloat(current.element.style.left) || 0;
      const y = parseFloat(current.element.style.top) || 0;
      if (current.kind === "main-node") {
        const key = current.element.dataset.principleGroupWindow || current.element.dataset.mindmapNodeKey;
        const positions = mainPositions();
        positions[key] = { x, y, z: parseInt(current.element.style.zIndex || "1", 10) };
        saveMainPositions(positions);
      } else {
        const focused = current.element.closest(".focused-principle-group");
        if (focused) {
          const info = focusedInfo(focused);
          const positions = groupMapPositions(info.groupId);
          const id = current.element.dataset.tjmPrincipleId;
          positions[id] = { x, y, z: parseInt(current.element.style.zIndex || "1", 10) };
          saveGroupMapPositions(info.groupId, positions);
          recomputeLeaderFromFocused(focused, info.groupId);
        }
      }
      releaseDraggingLater();
      return;
    }

    if (current.type === "circle") {
      current.circle.classList.remove("tjm-v3-circle-dragging");
      current.circle.style.transform = "";
      current.circle.style.visibility = "hidden";
      const target = document.elementFromPoint(event.clientX, event.clientY);
      current.circle.style.visibility = "";
      const targetNode = target?.closest?.(".mindmap-node");
      const mainCanvas = target?.closest?.(".principle-group-list");
      Promise.resolve()
        .then(() => targetNode ? movePrincipleToNode(current.principleId, current.sourceNodeKey, targetNode, event.clientX) : mainCanvas ? makeStandalone(current.principleId) : null)
        .catch((error) => toast(error?.message || "That principle could not be moved.", "error"))
        .finally(releaseDraggingLater);
      return;
    }

    releaseDraggingLater();
  }, { capture: true, passive: false });

  document.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch") touchPoints.delete(event.pointerId);
    if (gesture?.pointerId === event.pointerId) {
      clearHold();
      gesture?.element?.classList.remove("tjm-v3-dragging");
      if (gesture?.circle) gesture.circle.style.transform = "";
      gesture = null;
    }
    pinch = null;
    markDragging();
    releaseDraggingLater();
  }, { capture: true });

  function shouldSuppress(event) {
    return Date.now() < suppressUntil || Boolean(window.__TJM_MINDMAP_DRAGGING);
  }

  for (const type of ["click", "auxclick", "mouseup", "touchend"]) {
    document.addEventListener(type, (event) => {
      if (!shouldSuppress(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, passive: false });
  }

  document.addEventListener("click", (event) => {
    const zoom = event.target.closest?.("[data-map-zoom]");
    if (zoom) {
      const controls = zoom.closest(".tjm-map-controls");
      const viewport = controls?.nextElementSibling;
      const mapId = controls?.dataset.mapId;
      const canvas = viewport?.querySelector(".tjm-map-canvas");
      if (!viewport || !canvas || !mapId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const state = viewState(mapId);
      if (zoom.dataset.mapZoom === "in") setZoomAt(viewport, canvas, mapId, (Number(state.scale) || 1) + ZOOM_STEP);
      else if (zoom.dataset.mapZoom === "out") setZoomAt(viewport, canvas, mapId, (Number(state.scale) || 1) - ZOOM_STEP);
      else resetView(viewport, canvas, mapId);
      return;
    }

    const summary = event.target.closest?.(".tjm-group-card-summary");
    if (summary && !shouldSuppress(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      summary.closest(".tjm-group-map-node")?.classList.toggle("is-group-card-expanded");
    }
  }, { capture: true });

  document.addEventListener("wheel", (event) => {
    const context = mapContext(event.target);
    if (!context || !event.ctrlKey) return;
    event.preventDefault();
    const state = viewState(context.mapId);
    setZoomAt(context.viewport, context.canvas, context.mapId, (Number(state.scale) || 1) + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), event.clientX, event.clientY);
  }, { capture: true, passive: false });

  async function prepare() {
    if (preparing) return;
    preparing = true;
    try {
      await refreshRows();
      enhanceCopy();
      prepareMainMap();
      prepareGroupMap();
      applyLeaderLabels();
    } finally {
      preparing = false;
    }
  }

  function schedulePrepare() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      prepare().catch(() => {});
    });
  }

  const observer = new MutationObserver(schedulePrepare);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  schedulePrepare();
})();
