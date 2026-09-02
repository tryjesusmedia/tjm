(() => {
  "use strict";

  const config = window.TJM_CONFLICT_CONFIG || window.TJM_CHRONBIBLE_CONFIG;
  if (!config) return;

  const HOLD_MS = 330;
  const MOVE_TOLERANCE = 8;
  const MIN_SCALE = 0.45;
  const MAX_SCALE = 2.25;
  const ZOOM_STEP = 0.15;
  const storagePrefix = `tjm-principle-mindmap:${config.planId}`;

  let db = null;
  let rows = [];
  let rowsAt = 0;
  let preparing = false;
  let gesture = null;
  let holdTimer = null;
  let suppressUntil = 0;
  let zCounter = 50;

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(`${storagePrefix}:${key}`) || "null");
      return value ?? fallback;
    } catch (_error) { return fallback; }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(`${storagePrefix}:${key}`, JSON.stringify(value)); } catch (_error) {}
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
  function firstWords(text, max = 9) {
    const line = String(text || "").split(/\r?\n/).find((part) => part.trim())?.trim() || "Untitled principle";
    const words = line.split(/\s+/);
    return words.length > max ? `${words.slice(0, max).join(" ")}…` : line;
  }

  function groupOrders() { return readJSON("group-orders", {}); }
  function saveGroupOrders(value) { writeJSON("group-orders", value); }
  function leaders() { return readJSON("leaders", {}); }
  function saveLeaders(value) { writeJSON("leaders", value); }
  function mainPositions() { return readJSON("positions", {}); }
  function saveMainPositions(value) { writeJSON("positions", value); }

  function groupMapPositions(groupKey) {
    return readJSON(`group-map-positions:${groupKey}`, {});
  }
  function saveGroupMapPositions(groupKey, value) {
    writeJSON(`group-map-positions:${groupKey}`, value);
  }

  function viewState(mapId) {
    return readJSON(`view:${mapId}`, { scale: 1, x: 0, y: 0 });
  }
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
    if (!groupId) return "";
    return String(rows.find((row) => row.group_id === groupId && String(row.group_title || "").trim())?.group_title || "").trim();
  }

  function orderedIdsForGroup(groupId) {
    const members = rows.filter((row) => row.group_id === groupId);
    const ids = members.map((row) => row.id);
    const stored = groupOrders()[groupId] || [];
    const valid = stored.filter((id) => ids.includes(id));
    return [...valid, ...ids.filter((id) => !valid.includes(id))];
  }

  function setLeader(groupId, principleId) {
    if (!groupId || !principleId) return;
    const value = leaders();
    value[groupId] = principleId;
    saveLeaders(value);
    const orders = groupOrders();
    const ids = orderedIdsForGroup(groupId).filter((id) => id !== principleId);
    orders[groupId] = [principleId, ...ids];
    saveGroupOrders(orders);
  }

  function leaderForGroup(groupId) {
    if (!groupId) return null;
    const memberIds = rows.filter((row) => row.group_id === groupId).map((row) => row.id);
    const storedLeader = leaders()[groupId];
    if (storedLeader && memberIds.includes(storedLeader)) return rowById(storedLeader);
    const firstOrdered = orderedIdsForGroup(groupId)[0];
    const leader = rowById(firstOrdered) || rows.find((row) => row.group_id === groupId) || null;
    if (leader) setLeader(groupId, leader.id);
    return leader;
  }

  function reorderCircleDOM(container, orderedIds) {
    const buttons = [...container.querySelectorAll("[data-principle-id], .principle-circle")];
    const byId = new Map();
    for (const button of buttons) {
      const id = button.dataset.principleId || rowByNumber(button.textContent.trim())?.id;
      if (id) byId.set(id, button);
    }
    for (const id of orderedIds) if (byId.has(id)) container.appendChild(byId.get(id));
  }

  function applyLeaderLabels() {
    document.querySelectorAll('.principles-view [data-principle-group-window^="group:"]').forEach((node) => {
      const key = node.dataset.principleGroupWindow;
      const groupId = groupIdFromKey(key);
      const leader = leaderForGroup(groupId);
      if (!leader) return;
      const custom = customGroupTitle(groupId);
      const small = node.querySelector(".principle-group-copy > small");
      if (small) small.textContent = `GROUP · LED BY PRINCIPLE #${leader.principle_number}`;
      if (!custom) {
        const title = node.querySelector(".principle-group-title");
        if (title) title.remove();
        const preview = node.querySelector(".principle-first-line");
        if (preview) preview.textContent = firstWords(leader.body, 12);
      }
      const circles = node.querySelector(".mindmap-circle-bar, .principle-circles");
      if (circles) reorderCircleDOM(circles, orderedIdsForGroup(groupId));
    });

    const focused = document.querySelector(".focused-principle-group");
    if (focused) {
      const cards = [...focused.querySelectorAll(".principle-detail-card")];
      const ids = cards.map((card) => card.id.replace(/^principle-id-/, ""));
      const memberRows = ids.map(rowById).filter(Boolean);
      const groupId = memberRows.find((row) => row.group_id)?.group_id || "";
      if (groupId) {
        const leader = leaderForGroup(groupId);
        const custom = customGroupTitle(groupId);
        const eyebrow = focused.querySelector(".focused-group-heading .eyebrow");
        if (eyebrow && leader) eyebrow.textContent = `GROUP LED BY PRINCIPLE #${leader.principle_number}`;
        const heading = focused.querySelector("#focused-group-heading");
        if (heading && leader && !custom) heading.textContent = `Group led by #${leader.principle_number}`;
      }
    }
  }

  function compactStandaloneNodes() {
    document.querySelectorAll('.principles-view [data-principle-group-window^="single:"]').forEach((node) => {
      if (node.querySelector(".tjm-single-preview")) return;
      const id = node.dataset.principleGroupWindow.slice(7);
      const row = rowById(id);
      if (!row) return;
      node.classList.add("tjm-standalone-compact");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tjm-single-preview";
      button.dataset.openPrinciple = row.id;
      button.innerHTML = `<span class="principle-circle mindmap-principle-circle" data-principle-id="${row.id}" data-principle-number="${row.principle_number}" data-source-node-key="single:${row.id}">${row.principle_number}</span><span>${escapeHTML(firstWords(row.body, 7))}</span>`;
      node.appendChild(button);
    });
  }

  function replaceMindMapWording() {
    document.querySelectorAll(".principle-mindmap-help strong").forEach((el) => { el.textContent = "Mind Map"; });
    document.querySelectorAll(".principle-mindmap-help span, .mindmap-group-drag-help").forEach((el) => {
      el.textContent = el.textContent.replace(/Mind map arena/gi, "Mind Map").replace(/arena/gi, "map");
    });
  }

  function ensureControls(viewport, mapId) {
    if (!viewport || viewport.previousElementSibling?.classList.contains("tjm-map-controls")) return;
    const controls = document.createElement("div");
    controls.className = "tjm-map-controls";
    controls.dataset.mapId = mapId;
    controls.innerHTML = `<span>Mind Map</span><div><button type="button" data-map-zoom="out" aria-label="Zoom out">−</button><button type="button" data-map-zoom="reset">100%</button><button type="button" data-map-zoom="in" aria-label="Zoom in">+</button></div>`;
    viewport.before(controls);
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

  function applyView(viewport, canvas, mapId) {
    const state = viewState(mapId);
    state.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(state.scale) || 1));
    state.x = Number(state.x) || 0;
    state.y = Number(state.y) || 0;
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    const reset = viewport.previousElementSibling?.querySelector('[data-map-zoom="reset"]');
    if (reset) reset.textContent = `${Math.round(state.scale * 100)}%`;
  }

  function changeZoom(viewport, canvas, mapId, delta) {
    const state = viewState(mapId);
    const oldScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(state.scale) || 1));
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale + delta));
    const rect = viewport.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const x = Number(state.x) || 0;
    const y = Number(state.y) || 0;
    const worldX = (cx - x) / oldScale;
    const worldY = (cy - y) / oldScale;
    state.scale = nextScale;
    state.x = cx - worldX * nextScale;
    state.y = cy - worldY * nextScale;
    saveViewState(mapId, state);
    applyView(viewport, canvas, mapId);
  }

  function resetZoom(viewport, canvas, mapId) {
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

  function focusedGroupInfo(focused) {
    const cards = [...focused.querySelectorAll(".principle-detail-card")];
    const ids = cards.map((card) => card.id.replace(/^principle-id-/, ""));
    const memberRows = ids.map(rowById).filter(Boolean);
    const groupId = memberRows.find((row) => row.group_id)?.group_id || `single:${ids[0] || "empty"}`;
    return { cards, ids, memberRows, groupId };
  }

  function prepareGroupMap() {
    const focused = document.querySelector(".focused-principle-group");
    if (!focused) return;
    const details = focused.querySelector(".principle-group-details");
    if (!details) return;
    const { cards, groupId } = focusedGroupInfo(focused);
    let viewport = details.parentElement?.classList.contains("tjm-group-map-viewport") ? details.parentElement : null;
    if (!viewport) {
      viewport = document.createElement("div");
      viewport.className = "tjm-group-map-viewport";
      details.parentNode.insertBefore(viewport, details);
      viewport.appendChild(details);
    }
    details.classList.add("tjm-group-map-canvas");
    setupViewport(viewport, details, `group:${groupId}`);
    const pos = groupMapPositions(groupId);
    cards.forEach((card, index) => {
      const id = card.id.replace(/^principle-id-/, "");
      if (!pos[id]) pos[id] = { x: 35 + (index % 3) * 295, y: 35 + Math.floor(index / 3) * 155, z: index + 1 };
      card.classList.add("tjm-group-map-node");
      card.dataset.tjmPrincipleId = id;
      card.style.left = `${pos[id].x}px`;
      card.style.top = `${pos[id].y}px`;
      card.style.zIndex = String(pos[id].z || index + 1);
      ensureGroupSummary(card, rowById(id));
    });
    saveGroupMapPositions(groupId, pos);
    details.style.width = "1200px";
    details.style.height = `${Math.max(780, ...Object.values(pos).map((p) => (Number(p.y) || 0) + 270))}px`;
    recomputeLeaderFromGroupMap(focused, groupId);
  }

  function ensureGroupSummary(card, row) {
    if (!row || card.querySelector(":scope > .tjm-group-card-summary")) return;
    card.classList.remove("is-group-card-expanded");
    const summary = document.createElement("button");
    summary.type = "button";
    summary.className = "tjm-group-card-summary";
    summary.dataset.tjmTogglePrinciple = row.id;
    summary.innerHTML = `<span class="principle-circle" data-tjm-drag-principle="${row.id}">${row.principle_number}</span><span>${escapeHTML(firstWords(row.body, 10))}</span>`;
    card.prepend(summary);
  }

  function recomputeLeaderFromGroupMap(focused, groupId) {
    if (!focused || !groupId || String(groupId).startsWith("single:")) return;
    const cards = [...focused.querySelectorAll(".tjm-group-map-node")];
    if (!cards.length) return;
    cards.sort((a, b) => {
      const ay = parseFloat(a.style.top) || 0, by = parseFloat(b.style.top) || 0;
      if (Math.abs(ay - by) > 18) return ay - by;
      return (parseFloat(a.style.left) || 0) - (parseFloat(b.style.left) || 0);
    });
    const ids = cards.map((card) => card.dataset.tjmPrincipleId).filter(Boolean);
    const orders = groupOrders();
    orders[groupId] = ids;
    saveGroupOrders(orders);
    if (ids[0]) setLeader(groupId, ids[0]);
    applyLeaderLabels();
  }

  async function movePrincipleToNode(principleId, sourceNodeKey, targetNode, pointerX) {
    const principle = rowById(principleId);
    if (!principle || !targetNode) return;
    const targetKey = targetNode.dataset.principleGroupWindow || targetNode.dataset.mindmapNodeKey || "";

    if (targetKey === sourceNodeKey && targetKey.startsWith("group:")) {
      const groupId = groupIdFromKey(targetKey);
      const circleBar = targetNode.querySelector(".mindmap-circle-bar, .principle-circles");
      if (!circleBar) return;
      const circles = [...circleBar.querySelectorAll("[data-principle-id]")].filter((circle) => circle.dataset.principleId !== principleId);
      let insertAt = circles.length;
      for (let index = 0; index < circles.length; index++) {
        const rect = circles[index].getBoundingClientRect();
        if (pointerX < rect.left + rect.width / 2) { insertAt = index; break; }
      }
      const ids = circles.map((circle) => circle.dataset.principleId);
      ids.splice(insertAt, 0, principleId);
      const orders = groupOrders();
      orders[groupId] = ids;
      saveGroupOrders(orders);
      setLeader(groupId, ids[0]);
      reorderCircleDOM(circleBar, ids);
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
      const { error } = await client.rpc("move_conflict_principles", {
        p_principle_ids: [principleId], p_target_principle_id: null, p_mode: "new", p_group_title: local?.title || null,
      });
      if (error) throw error;
      writeJSON("empty-groups", localGroups.filter((item) => item.id !== localId));
      rowsAt = 0;
      reloadIntoPrinciples();
      return;
    }

    let targetId = "";
    if (targetKey.startsWith("single:")) targetId = targetKey.slice(7);
    else if (targetKey.startsWith("group:")) targetId = rows.find((row) => row.group_id === groupIdFromKey(targetKey))?.id || "";
    if (!targetId || targetId === principleId) return;

    const existingTarget = rowById(targetId);
    const targetWasStandalone = !existingTarget?.group_id;
    const sourceWasStandalone = !principle.group_id;
    const { data, error } = await client.rpc("move_conflict_principles", {
      p_principle_ids: [principleId], p_target_principle_id: targetId, p_mode: "existing", p_group_title: null,
    });
    if (error) throw error;
    const returned = Array.isArray(data) ? data : [];
    const moved = returned.find((row) => row.id === principleId);
    const destinationGroupId = moved?.group_id || returned.find((row) => row.id === targetId)?.group_id;
    if (destinationGroupId) {
      const orders = groupOrders();
      const existingOrder = orders[destinationGroupId] || [];
      if (targetWasStandalone && sourceWasStandalone) orders[destinationGroupId] = [targetId, principleId];
      else orders[destinationGroupId] = [...existingOrder.filter((id) => id !== principleId), principleId];
      saveGroupOrders(orders);
      const leaderId = orders[destinationGroupId][0] || targetId;
      setLeader(destinationGroupId, leaderId);
    }
    rowsAt = 0;
    reloadIntoPrinciples();
  }

  async function makeStandalone(principleId) {
    const principle = rowById(principleId);
    if (!principle?.group_id) return;
    const client = getDb();
    const { error } = await client.rpc("move_conflict_principles", {
      p_principle_ids: [principleId], p_target_principle_id: null, p_mode: "standalone", p_group_title: null,
    });
    if (error) throw error;
    const groupId = principle.group_id;
    const orders = groupOrders();
    orders[groupId] = (orders[groupId] || []).filter((id) => id !== principleId);
    saveGroupOrders(orders);
    const nextLeader = orders[groupId]?.[0];
    if (nextLeader) setLeader(groupId, nextLeader);
    rowsAt = 0;
    reloadIntoPrinciples();
  }

  function clearHold() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  }

  function mapContext(target) {
    const groupViewport = target.closest?.(".tjm-group-map-viewport");
    if (groupViewport) return { viewport: groupViewport, canvas: groupViewport.querySelector(".tjm-group-map-canvas"), mapId: groupViewport.dataset.mapId };
    const mainViewport = target.closest?.(".principle-arena-scroll.tjm-map-viewport");
    if (mainViewport) return { viewport: mainViewport, canvas: mainViewport.querySelector(".principle-mindmap-arena, .principle-group-list"), mapId: mainViewport.dataset.mapId };
    return null;
  }

  function pointerToWorld(event, context) {
    const rect = context.viewport.getBoundingClientRect();
    const state = viewState(context.mapId);
    const scale = Number(state.scale) || 1;
    return {
      x: (event.clientX - rect.left - (Number(state.x) || 0)) / scale,
      y: (event.clientY - rect.top - (Number(state.y) || 0)) / scale,
    };
  }

  function beginNodeMove(event, element, kind, context) {
    const point = pointerToWorld(event, context);
    const x = parseFloat(element.style.left) || 0;
    const y = parseFloat(element.style.top) || 0;
    gesture = { type: "node", pointerId: event.pointerId, element, kind, context, startClientX: event.clientX, startClientY: event.clientY, startWorldX: point.x, startWorldY: point.y, startX: x, startY: y, dragging: true };
    element.classList.add("tjm-v2-dragging");
    suppressUntil = Date.now() + 2500;
    window.__TJM_MINDMAP_DRAGGING = true;
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function beginCircleMove(event, circle, context) {
    const principleId = circle.dataset.principleId || circle.dataset.tjmDragPrinciple || circle.closest("[data-tjm-principle-id]")?.dataset.tjmPrincipleId;
    if (!principleId) return;
    if (context.mapId?.startsWith("group:")) {
      const card = circle.closest(".tjm-group-map-node");
      if (card) beginNodeMove(event, card, "group-principle", context);
      return;
    }
    gesture = { type: "circle", pointerId: event.pointerId, circle, principleId, sourceNodeKey: circle.dataset.sourceNodeKey || circle.closest("[data-principle-group-window]")?.dataset.principleGroupWindow || "", context, startClientX: event.clientX, startClientY: event.clientY, dragging: true };
    circle.classList.add("tjm-v2-circle-dragging");
    suppressUntil = Date.now() + 2500;
    window.__TJM_MINDMAP_DRAGGING = true;
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function beginPan(event, context) {
    const state = viewState(context.mapId);
    gesture = { type: "pan", pointerId: event.pointerId, context, startClientX: event.clientX, startClientY: event.clientY, startX: Number(state.x) || 0, startY: Number(state.y) || 0, dragging: false };
  }

  document.addEventListener("pointerdown", (event) => {
    const context = mapContext(event.target);
    if (!context) return;
    if (event.button !== undefined && event.button !== 0) return;

    const zoom = event.target.closest?.("[data-map-zoom]");
    if (zoom) return;

    const circle = event.target.closest?.("[data-principle-id], [data-tjm-drag-principle]");
    const groupCard = event.target.closest?.(".tjm-group-map-node");
    const mainNode = event.target.closest?.(".principle-mindmap-arena > .mindmap-node, .principle-group-list > .mindmap-node");
    const interactive = event.target.closest?.("input, textarea, select, form, .principle-menu, .principle-visible-actions");

    event.stopImmediatePropagation();
    clearHold();

    if (circle) {
      holdTimer = setTimeout(() => beginCircleMove(event, circle, context), HOLD_MS);
      gesture = { type: "pending", pointerId: event.pointerId, context, startClientX: event.clientX, startClientY: event.clientY };
      return;
    }

    if (groupCard && !interactive) {
      holdTimer = setTimeout(() => beginNodeMove(event, groupCard, "group-principle", context), HOLD_MS);
      gesture = { type: "pending", pointerId: event.pointerId, context, startClientX: event.clientX, startClientY: event.clientY };
      return;
    }

    if (mainNode && !interactive) {
      holdTimer = setTimeout(() => beginNodeMove(event, mainNode, "main-node", context), HOLD_MS);
      gesture = { type: "pending", pointerId: event.pointerId, context, startClientX: event.clientX, startClientY: event.clientY };
      return;
    }

    beginPan(event, context);
  }, { capture: true, passive: false });

  document.addEventListener("pointermove", (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - gesture.startClientX, event.clientY - gesture.startClientY);
    if (gesture.type === "pending") {
      if (distance > MOVE_TOLERANCE) { clearHold(); gesture = null; }
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (gesture.type === "pan") {
      if (distance > MOVE_TOLERANCE) {
        gesture.dragging = true;
        suppressUntil = Date.now() + 1800;
        window.__TJM_MINDMAP_DRAGGING = true;
      }
      const state = viewState(gesture.context.mapId);
      state.x = gesture.startX + (event.clientX - gesture.startClientX);
      state.y = gesture.startY + (event.clientY - gesture.startClientY);
      saveViewState(gesture.context.mapId, state);
      applyView(gesture.context.viewport, gesture.context.canvas, gesture.context.mapId);
      return;
    }

    if (gesture.type === "node") {
      const point = pointerToWorld(event, gesture.context);
      const nextX = Math.max(0, gesture.startX + (point.x - gesture.startWorldX));
      const nextY = Math.max(0, gesture.startY + (point.y - gesture.startWorldY));
      gesture.element.style.left = `${nextX}px`;
      gesture.element.style.top = `${nextY}px`;
      gesture.element.style.zIndex = String(++zCounter);
      return;
    }

    if (gesture.type === "circle") {
      gesture.circle.style.transform = `translate(${event.clientX - gesture.startClientX}px, ${event.clientY - gesture.startClientY}px) scale(1.08)`;
    }
  }, { capture: true, passive: false });

  document.addEventListener("pointerup", (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    clearHold();
    const current = gesture;
    gesture = null;

    if (current.type === "pending") return;
    if (current.type === "pan" && !current.dragging) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    suppressUntil = Date.now() + 2400;
    window.__TJM_MINDMAP_DRAGGING = true;

    if (current.type === "node") {
      current.element.classList.remove("tjm-v2-dragging");
      const x = parseFloat(current.element.style.left) || 0;
      const y = parseFloat(current.element.style.top) || 0;
      if (current.kind === "main-node") {
        const key = current.element.dataset.principleGroupWindow || current.element.dataset.mindmapNodeKey;
        const pos = mainPositions();
        pos[key] = { x, y, z: parseInt(current.element.style.zIndex || "1", 10) };
        saveMainPositions(pos);
      } else {
        const focused = current.element.closest(".focused-principle-group");
        const info = focused ? focusedGroupInfo(focused) : null;
        if (info) {
          const pos = groupMapPositions(info.groupId);
          const id = current.element.dataset.tjmPrincipleId;
          pos[id] = { x, y, z: parseInt(current.element.style.zIndex || "1", 10) };
          saveGroupMapPositions(info.groupId, pos);
          recomputeLeaderFromGroupMap(focused, info.groupId);
        }
      }
      setTimeout(() => { window.__TJM_MINDMAP_DRAGGING = false; }, 2500);
      return;
    }

    if (current.type === "circle") {
      current.circle.classList.remove("tjm-v2-circle-dragging");
      current.circle.style.transform = "";
      const hidden = current.circle;
      hidden.style.visibility = "hidden";
      const target = document.elementFromPoint(event.clientX, event.clientY);
      hidden.style.visibility = "";
      const targetNode = target?.closest?.(".mindmap-node");
      const mainCanvas = target?.closest?.(".principle-mindmap-arena, .principle-group-list");
      Promise.resolve()
        .then(() => targetNode ? movePrincipleToNode(current.principleId, current.sourceNodeKey, targetNode, event.clientX) : mainCanvas ? makeStandalone(current.principleId) : null)
        .catch((error) => toast(error?.message || "That principle could not be moved.", "error"))
        .finally(() => setTimeout(() => { window.__TJM_MINDMAP_DRAGGING = false; }, 2500));
    }
  }, { capture: true, passive: false });

  document.addEventListener("pointercancel", (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    clearHold();
    gesture?.element?.classList.remove("tjm-v2-dragging");
    if (gesture?.circle) {
      gesture.circle.classList.remove("tjm-v2-circle-dragging");
      gesture.circle.style.transform = "";
    }
    gesture = null;
    suppressUntil = Date.now() + 1000;
    window.__TJM_MINDMAP_DRAGGING = false;
  }, { capture: true });

  function shouldSuppress(event) {
    return Date.now() < suppressUntil && (event.target.closest?.(".principles-view, .focused-principle-group") || window.__TJM_MINDMAP_DRAGGING);
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
      const mapId = controls?.dataset.mapId;
      const viewport = controls?.nextElementSibling;
      const canvas = viewport?.querySelector(".tjm-map-canvas");
      if (!mapId || !viewport || !canvas) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (zoom.dataset.mapZoom === "in") changeZoom(viewport, canvas, mapId, ZOOM_STEP);
      else if (zoom.dataset.mapZoom === "out") changeZoom(viewport, canvas, mapId, -ZOOM_STEP);
      else resetZoom(viewport, canvas, mapId);
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
    changeZoom(context.viewport, context.canvas, context.mapId, event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  }, { capture: true, passive: false });

  async function prepare() {
    if (preparing) return;
    preparing = true;
    try {
      await refreshRows();
      replaceMindMapWording();
      prepareMainMap();
      prepareGroupMap();
      applyLeaderLabels();
    } finally { preparing = false; }
  }

  const observer = new MutationObserver(() => requestAnimationFrame(() => prepare().catch(() => {})));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  requestAnimationFrame(() => prepare().catch(() => {}));
})();
