(() => {
  "use strict";

  const HOLD_MS = 380;
  const CIRCLE_HOLD_MS = 250;
  const MOVE_TOLERANCE = 9;
  const NODE_WIDTH = 310;
  const ARENA_MIN_WIDTH = 1500;
  const ARENA_MIN_HEIGHT = 980;
  const config = window.TJM_CONFLICT_CONFIG || window.TJM_CHRONBIBLE_CONFIG;
  if (!config) return;

  let db = null;
  let rows = [];
  let rowsFetchedAt = 0;
  let prepareQueued = false;
  let busy = false;
  let pressTimer = null;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let source = null;
  let sourceKind = "";
  let sourceKey = "";
  let sourcePrincipleId = "";
  let placeholder = null;
  let dragGhost = null;
  let dragging = false;
  let candidate = null;
  let candidateMode = "";
  let suppressClicksUntil = 0;
  let zCounter = 20;

  const storagePrefix = `tjm-principle-mindmap:${config.planId}`;
  const sentinelReadingId = config.planId === "bible-conflict-ages-v1" ? "coa-000" : "chron-000-00";

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(window.localStorage.getItem(`${storagePrefix}:${key}`) || "null");
      return value ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(`${storagePrefix}:${key}`, JSON.stringify(value));
    } catch (_error) {
      // The mind map still works for the current visit if storage is unavailable.
    }
  }

  function positions() { return readJSON("positions", {}); }
  function savePositions(value) { writeJSON("positions", value); }
  function groupOrders() { return readJSON("group-orders", {}); }
  function saveGroupOrders(value) { writeJSON("group-orders", value); }
  function emptyGroups() { return readJSON("empty-groups", []); }
  function saveEmptyGroups(value) { writeJSON("empty-groups", value); }

  function getDb() {
    if (db) return db;
    if (!window.supabase?.createClient) throw new Error("Account sync is not available right now.");
    db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
    });
    return db;
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

  async function refreshRows(force = false) {
    if (!force && rows.length && Date.now() - rowsFetchedAt < 2500) return rows;
    try {
      const client = getDb();
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData?.session) { rows = []; return rows; }
      const { data, error } = await client
        .from("conflict_principles")
        .select("id, plan_id, reading_id, principle_number, body, group_id, group_title, deleted_at")
        .eq("plan_id", config.planId)
        .is("deleted_at", null)
        .order("principle_number", { ascending: true });
      if (error) throw error;
      rows = data || [];
      rowsFetchedAt = Date.now();
      return rows;
    } catch (_error) {
      return rows;
    }
  }

  function rowForNumber(number) {
    return rows.find((row) => Number(row.principle_number) === Number(number));
  }

  function rowForId(id) {
    return rows.find((row) => row.id === id);
  }

  function currentArena() {
    return document.querySelector(".principles-view .principle-group-list");
  }

  function currentArenaScroll() {
    return document.querySelector(".principle-arena-scroll");
  }

  function allNodes(arena = currentArena()) {
    return arena ? [...arena.querySelectorAll(":scope > .principle-group-window")] : [];
  }

  function schedulePrepare() {
    if (prepareQueued) return;
    prepareQueued = true;
    window.requestAnimationFrame(() => {
      prepareQueued = false;
      prepare().catch(() => {});
    });
  }

  async function prepare() {
    await refreshRows();
    injectToolbarActions();
    prepareBackNavigation();
    prepareFocusedGroup();
    const arena = currentArena();
    if (arena) prepareArena(arena);
    returnToPrinciplesAfterReload();
  }

  function ensureArenaWrapper(arena) {
    if (arena.parentElement?.classList.contains("principle-arena-scroll")) return arena.parentElement;
    const wrapper = document.createElement("div");
    wrapper.className = "principle-arena-scroll";
    arena.parentNode.insertBefore(wrapper, arena);
    wrapper.appendChild(arena);
    return wrapper;
  }

  function ensureArenaIntro(wrapper) {
    if (wrapper.previousElementSibling?.classList.contains("principle-mindmap-help")) return;
    const help = document.createElement("div");
    help.className = "principle-mindmap-help";
    help.innerHTML = `
      <div><strong>Mind map arena</strong><span>Move groups and standalone principles anywhere. Drag the purple numbered circles to add, remove, or move principles between groups.</span></div>
      <div class="mindmap-legend" aria-label="Mind map colors"><span class="legend-group">Group</span><span class="legend-principle">Principle</span></div>`;
    wrapper.before(help);
  }

  function defaultPosition(index) {
    const columns = 4;
    return {
      x: 35 + (index % columns) * 350,
      y: 35 + Math.floor(index / columns) * 210,
      z: index + 1,
    };
  }

  function setNodePosition(node, key, index) {
    const saved = positions();
    if (!saved[key]) {
      saved[key] = defaultPosition(index);
      savePositions(saved);
    }
    const pos = saved[key];
    node.style.left = `${Math.max(0, Number(pos.x) || 0)}px`;
    node.style.top = `${Math.max(0, Number(pos.y) || 0)}px`;
    node.style.zIndex = String(Number(pos.z) || index + 1);
  }

  function saveNodePosition(key, x, y, z = ++zCounter) {
    const saved = positions();
    saved[key] = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), z };
    savePositions(saved);
  }

  function ensureArenaSize(arena) {
    const pos = positions();
    const maxX = Math.max(ARENA_MIN_WIDTH, ...Object.values(pos).map((item) => (Number(item?.x) || 0) + NODE_WIDTH + 140));
    const maxY = Math.max(ARENA_MIN_HEIGHT, ...Object.values(pos).map((item) => (Number(item?.y) || 0) + 260));
    arena.style.width = `${maxX}px`;
    arena.style.height = `${maxY}px`;
  }

  function nodeTypeFromKey(key) {
    if (String(key).startsWith("group:")) return "group";
    if (String(key).startsWith("single:")) return "principle";
    if (String(key).startsWith("localgroup:")) return "group";
    return "principle";
  }

  function prepareArena(arena) {
    const wrapper = ensureArenaWrapper(arena);
    ensureArenaIntro(wrapper);
    arena.classList.add("principle-mindmap-arena");

    renderEmptyGroups(arena);
    const nodes = allNodes(arena);
    nodes.forEach((node, index) => {
      const key = node.dataset.principleGroupWindow || "";
      node.classList.add("mindmap-node", "is-touch-movable");
      node.classList.toggle("is-group-node", nodeTypeFromKey(key) === "group");
      node.classList.toggle("is-single-node", nodeTypeFromKey(key) === "principle");
      node.dataset.mindmapNodeKey = key;
      setNodePosition(node, key, index);
      upgradeCircleBar(node, key);
    });
    ensureArenaSize(arena);
  }

  function renderEmptyGroups(arena) {
    const existing = new Set([...arena.querySelectorAll(".mindmap-empty-group")].map((node) => node.dataset.localGroupId));
    for (const group of emptyGroups()) {
      if (!group?.id || existing.has(group.id)) continue;
      const article = document.createElement("article");
      article.className = "principle-group-window mindmap-node is-group-node is-touch-movable mindmap-empty-group";
      article.dataset.localGroupId = group.id;
      article.dataset.principleGroupWindow = `localgroup:${group.id}`;
      article.dataset.mindmapNodeKey = `localgroup:${group.id}`;
      article.innerHTML = `
        <div class="mindmap-empty-group-card">
          <small>GROUP</small>
          <strong>${escapeHTML(group.title || "New group")}</strong>
          <span>Drop a purple principle circle here.</span>
        </div>`;
      arena.appendChild(article);
    }
  }

  function upgradeCircleBar(node, nodeKey) {
    let circles = node.querySelector(":scope .principle-circles");
    if (!circles) return;
    if (circles.closest(".principle-group-summary")) node.appendChild(circles);
    circles.classList.add("mindmap-circle-bar");

    [...circles.querySelectorAll(".principle-circle")].forEach((circle) => {
      const number = Number(circle.textContent.trim());
      const row = rowForNumber(number);
      if (!row) return;
      let button = circle;
      if (circle.tagName !== "BUTTON") {
        button = document.createElement("button");
        button.type = "button";
        button.className = circle.className;
        button.textContent = circle.textContent;
        circle.replaceWith(button);
      }
      button.classList.add("mindmap-principle-circle");
      button.dataset.openPrinciple = row.id;
      button.dataset.principleId = row.id;
      button.dataset.principleNumber = String(row.principle_number);
      button.dataset.sourceNodeKey = nodeKey;
      button.setAttribute("aria-label", `Open or drag principle ${row.principle_number}`);
      button.title = `Principle #${row.principle_number} · drag to move`;
    });

    applyCircleOrder(circles, nodeKey);
  }

  function groupOrderKey(nodeKey) {
    return String(nodeKey).startsWith("group:") ? String(nodeKey).slice(6) : nodeKey;
  }

  function applyCircleOrder(container, nodeKey) {
    const orders = groupOrders();
    const order = orders[groupOrderKey(nodeKey)] || [];
    if (!order.length) return;
    const buttons = [...container.querySelectorAll(".mindmap-principle-circle")];
    const byId = new Map(buttons.map((button) => [button.dataset.principleId, button]));
    for (const id of order) if (byId.has(id)) container.appendChild(byId.get(id));
    for (const button of buttons) if (!order.includes(button.dataset.principleId)) container.appendChild(button);
  }

  function saveCircleOrder(nodeKey, ids) {
    const orders = groupOrders();
    orders[groupOrderKey(nodeKey)] = ids;
    saveGroupOrders(orders);
  }

  function prepareFocusedGroup() {
    const focused = document.querySelector(".focused-principle-group");
    if (!focused) return;
    const details = focused.querySelector(".principle-group-details");
    if (!details) return;

    const cards = [...details.querySelectorAll(":scope > .principle-detail-card")];
    const ids = cards.map((card) => card.id.replace(/^principle-id-/, ""));
    const first = rowForId(ids[0]);
    const orderKey = first?.group_id || (first ? `single:${first.id}` : "focused");
    focused.dataset.mindmapOrderKey = orderKey;

    const orders = groupOrders();
    const order = orders[orderKey] || [];
    const byId = new Map(cards.map((card) => [card.id.replace(/^principle-id-/, ""), card]));
    for (const id of order) if (byId.has(id)) details.appendChild(byId.get(id));
    for (const card of cards) {
      const id = card.id.replace(/^principle-id-/, "");
      if (!order.includes(id)) details.appendChild(card);
      card.classList.add("mindmap-detail-draggable");
      card.dataset.mindmapPrincipleId = id;
      const row = rowForId(id);
      if (row?.reading_id === sentinelReadingId) card.querySelector("[data-principle-go]")?.remove();
    }

    if (!details.previousElementSibling?.classList.contains("mindmap-group-drag-help")) {
      const hint = document.createElement("div");
      hint.className = "mindmap-group-drag-help";
      hint.textContent = "Press and hold a principle card to change its order inside this group.";
      details.before(hint);
    }
  }

  function injectToolbarActions() {
    const actions = document.querySelector(".principle-library-actions");
    if (!actions || actions.dataset.mindmapEnhanced === "true") return;
    actions.dataset.mindmapEnhanced = "true";
    const principleButton = document.createElement("button");
    principleButton.type = "button";
    principleButton.dataset.mindmapNewPrinciple = "";
    principleButton.textContent = "+ New principle";
    const groupButton = document.createElement("button");
    groupButton.type = "button";
    groupButton.dataset.mindmapNewGroup = "";
    groupButton.textContent = "+ New group";
    actions.prepend(groupButton);
    actions.prepend(principleButton);
  }

  function openModal(kind) {
    closeModal();
    const overlay = document.createElement("div");
    overlay.className = "principle-overlay mindmap-create-overlay";
    overlay.dataset.mindmapModal = kind;
    if (kind === "principle") {
      const next = rows.reduce((max, row) => Math.max(max, Number(row.principle_number) || 0), 0) + 1;
      overlay.innerHTML = `
        <section class="principle-dialog mindmap-create-dialog" role="dialog" aria-modal="true" aria-labelledby="mindmap-create-heading">
          <header><div><p class="eyebrow">NEW DISCOVERY</p><h3 id="mindmap-create-heading">Create principle #${next}</h3></div><button type="button" data-mindmap-close aria-label="Close">×</button></header>
          <form data-mindmap-create-principle>
            <div class="field"><label for="mindmap-principle-body">Principle</label><textarea id="mindmap-principle-body" name="body" maxlength="2000" required placeholder="Write the principle in your own words."></textarea></div>
            <div class="field"><label for="mindmap-principle-refs">Related principle numbers</label><input id="mindmap-principle-refs" name="references" inputmode="numeric" maxlength="120" placeholder="12, 48, 203"><small>This principle does not need to be attached to a reading.</small></div>
            <div class="principle-form-actions"><button class="button button-primary" type="submit">Create principle</button><button class="button button-secondary" type="button" data-mindmap-close>Cancel</button></div>
          </form>
        </section>`;
    } else {
      overlay.innerHTML = `
        <section class="principle-dialog mindmap-create-dialog" role="dialog" aria-modal="true" aria-labelledby="mindmap-group-heading">
          <header><div><p class="eyebrow">NEW SPACE</p><h3 id="mindmap-group-heading">Create a new group</h3></div><button type="button" data-mindmap-close aria-label="Close">×</button></header>
          <form data-mindmap-create-group>
            <div class="field"><label for="mindmap-group-title">Group name</label><input id="mindmap-group-title" name="title" maxlength="80" required placeholder="Grace, Prayer, Character of God…"></div>
            <p class="mindmap-form-note">The group can start empty. Drag purple principle circles into it whenever you are ready.</p>
            <div class="principle-form-actions"><button class="button button-primary" type="submit">Create group</button><button class="button button-secondary" type="button" data-mindmap-close>Cancel</button></div>
          </form>
        </section>`;
    }
    document.body.appendChild(overlay);
    window.setTimeout(() => overlay.querySelector("textarea, input")?.focus(), 0);
  }

  function closeModal() {
    document.querySelector("[data-mindmap-modal]")?.remove();
  }

  function parseReferences(value) {
    return [...new Set(String(value || "").split(/[^0-9]+/).filter(Boolean).map(Number).filter((number) => Number.isInteger(number) && number > 0))].sort((a, b) => a - b);
  }

  async function createPrinciple(form) {
    if (busy) return;
    const body = String(new FormData(form).get("body") || "").trim();
    const references = parseReferences(new FormData(form).get("references"));
    if (!body) { toast("Write the principle before saving it.", "error"); return; }
    busy = true;
    syncStatus("Creating principle…", "saving");
    try {
      const client = getDb();
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData?.session) throw new Error("Sign in with Google to create principles.");
      const { data, error } = await client.rpc("create_conflict_principle", {
        p_plan_id: config.planId,
        p_reading_id: sentinelReadingId,
        p_body: body,
        p_cross_reference_numbers: references,
        p_principle_number: null,
      });
      if (error) throw error;
      const created = Array.isArray(data) ? data[0] : data;
      if (created?.id) {
        const pos = centerArenaPosition();
        saveNodePosition(`single:${created.id}`, pos.x, pos.y);
      }
      syncStatus("Principle saved", "synced");
      toast(`Principle #${created?.principle_number || ""} created.`);
      closeModal();
      reloadIntoPrinciples();
    } catch (error) {
      syncStatus("Sync failed", "error");
      toast(error?.message || "The principle could not be created.", "error");
    } finally {
      busy = false;
    }
  }

  function createGroup(form) {
    const title = String(new FormData(form).get("title") || "").trim();
    if (!title) { toast("Give the group a name.", "error"); return; }
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const groups = emptyGroups();
    groups.push({ id, title });
    saveEmptyGroups(groups);
    const pos = centerArenaPosition();
    saveNodePosition(`localgroup:${id}`, pos.x, pos.y);
    closeModal();
    const arena = currentArena();
    if (arena) {
      prepareArena(arena);
      toast("New group created. Drag principles into it.");
    } else {
      toast("New group created. Returning to the mind map.");
      reloadIntoPrinciples();
    }
  }

  function centerArenaPosition() {
    const scroll = currentArenaScroll();
    if (!scroll) return defaultPosition(allNodes().length);
    return {
      x: Math.max(20, scroll.scrollLeft + scroll.clientWidth / 2 - NODE_WIDTH / 2),
      y: Math.max(20, scroll.scrollTop + scroll.clientHeight / 2 - 90),
    };
  }

  function reloadIntoPrinciples() {
    try { window.sessionStorage.setItem(`${storagePrefix}:return`, "1"); } catch (_error) {}
    window.location.reload();
  }

  function returnToPrinciplesAfterReload() {
    let shouldReturn = false;
    try { shouldReturn = window.sessionStorage.getItem(`${storagePrefix}:return`) === "1"; } catch (_error) {}
    if (!shouldReturn) return;
    const button = document.querySelector('.journey-nav [data-view="principles"]');
    if (!button) return;
    try { window.sessionStorage.removeItem(`${storagePrefix}:return`); } catch (_error) {}
    if (!button.classList.contains("active")) button.click();
  }

  function pushPrincipleHistory() {
    const state = history.state || {};
    history.pushState({ ...state, tjmPrinciplesWindow: true, tjmPrinciplesPlan: config.planId }, "", location.href);
  }

  function prepareBackNavigation() {
    const focused = document.querySelector(".focused-principle-group");
    if (!focused) return;
    const toolbar = focused.querySelector(".focused-toolbar-row");
    if (!toolbar || toolbar.querySelector("[data-mindmap-back]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mindmap-back-icon";
    button.dataset.mindmapBack = "";
    button.setAttribute("aria-label", "Back to previous Principles window");
    button.textContent = "←";
    toolbar.prepend(button);
  }

  function backWithinPrinciples() {
    if (history.state?.tjmPrinciplesWindow) {
      history.back();
      return;
    }
    document.querySelector("[data-back-to-groups]")?.click();
  }

  function clearPress() {
    if (pressTimer) window.clearTimeout(pressTimer);
    pressTimer = null;
  }

  function resetGesture() {
    clearPress();
    pointerId = null;
    source = null;
    sourceKind = "";
    sourceKey = "";
    sourcePrincipleId = "";
    dragging = false;
    clearCandidate();
    if (placeholder?.parentNode) placeholder.remove();
    placeholder = null;
    if (dragGhost?.parentNode) dragGhost.remove();
    dragGhost = null;
    document.body.classList.remove("principle-drag-active");
  }

  function beginNodeDrag(event, node) {
    dragging = true;
    sourceKind = "node";
    suppressClicksUntil = Date.now() + 1200;
    source = node;
    sourceKey = node.dataset.mindmapNodeKey || node.dataset.principleGroupWindow || "";
    const rect = node.getBoundingClientRect();
    const scroll = currentArenaScroll();
    node.classList.add("is-dragging");
    node.style.width = `${rect.width}px`;
    node.style.zIndex = String(++zCounter);
    node.dataset.dragStartLeft = String(parseFloat(node.style.left) || 0);
    node.dataset.dragStartTop = String(parseFloat(node.style.top) || 0);
    node.dataset.dragScrollLeft = String(scroll?.scrollLeft || 0);
    node.dataset.dragScrollTop = String(scroll?.scrollTop || 0);
    document.body.classList.add("principle-drag-active");
    if (navigator.vibrate) navigator.vibrate(18);
    event.preventDefault();
  }

  function updateNodeDrag(event) {
    const scroll = currentArenaScroll();
    const baseLeft = Number(source.dataset.dragStartLeft) || 0;
    const baseTop = Number(source.dataset.dragStartTop) || 0;
    const scrollDX = (scroll?.scrollLeft || 0) - (Number(source.dataset.dragScrollLeft) || 0);
    const scrollDY = (scroll?.scrollTop || 0) - (Number(source.dataset.dragScrollTop) || 0);
    source.style.left = `${Math.max(0, baseLeft + event.clientX - startX + scrollDX)}px`;
    source.style.top = `${Math.max(0, baseTop + event.clientY - startY + scrollDY)}px`;
  }

  function finishNodeDrag() {
    const left = parseFloat(source.style.left) || 0;
    const top = parseFloat(source.style.top) || 0;
    source.classList.remove("is-dragging");
    source.style.width = "";
    saveNodePosition(sourceKey, left, top, ++zCounter);
    ensureArenaSize(currentArena());
    toast("Mind map position saved.");
    if (navigator.vibrate) navigator.vibrate(12);
  }

  function beginDetailDrag(event, card) {
    dragging = true;
    sourceKind = "detail";
    suppressClicksUntil = Date.now() + 1200;
    source = card;
    sourcePrincipleId = card.dataset.mindmapPrincipleId || card.id.replace(/^principle-id-/, "");
    const rect = card.getBoundingClientRect();
    placeholder = document.createElement("div");
    placeholder.className = "mindmap-detail-placeholder";
    placeholder.style.height = `${rect.height}px`;
    card.parentNode.insertBefore(placeholder, card.nextSibling);
    card.classList.add("is-dragging-detail");
    card.style.width = `${rect.width}px`;
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
    card.style.position = "fixed";
    card.style.zIndex = "90";
    card.style.pointerEvents = "none";
    document.body.classList.add("principle-drag-active");
    if (navigator.vibrate) navigator.vibrate(18);
    event.preventDefault();
  }

  function clearCandidate() {
    if (candidate) candidate.classList.remove("is-drop-target", "is-drop-before", "is-drop-after", "is-circle-drop-target");
    candidate = null;
    candidateMode = "";
  }

  function updateDetailDrag(event) {
    if (!source) return;
    source.style.transform = `translate3d(${event.clientX - startX}px, ${event.clientY - startY}px, 0)`;
    clearCandidate();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".principle-detail-card");
    if (!target || target === source) return;
    const rect = target.getBoundingClientRect();
    candidate = target;
    candidateMode = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    target.classList.add(candidateMode === "before" ? "is-drop-before" : "is-drop-after");
  }

  function finishDetailDrag() {
    const details = document.querySelector(".focused-principle-group .principle-group-details");
    const focused = document.querySelector(".focused-principle-group");
    source.classList.remove("is-dragging-detail");
    source.removeAttribute("style");
    if (placeholder?.parentNode) placeholder.remove();
    placeholder = null;
    if (candidate && details) {
      if (candidateMode === "before") details.insertBefore(source, candidate);
      else details.insertBefore(source, candidate.nextSibling);
    }
    clearCandidate();
    const ids = details ? [...details.querySelectorAll(":scope > .principle-detail-card")].map((card) => card.id.replace(/^principle-id-/, "")) : [];
    const key = focused?.dataset.mindmapOrderKey || "focused";
    const orders = groupOrders();
    orders[key] = ids;
    saveGroupOrders(orders);
    toast("Principle order saved inside this group.");
    if (navigator.vibrate) navigator.vibrate(12);
  }

  function beginCircleDrag(event, button) {
    dragging = true;
    sourceKind = "circle";
    suppressClicksUntil = Date.now() + 1300;
    source = button;
    sourcePrincipleId = button.dataset.principleId || "";
    sourceKey = button.dataset.sourceNodeKey || "";
    dragGhost = button.cloneNode(true);
    dragGhost.classList.add("mindmap-circle-ghost");
    dragGhost.removeAttribute("data-open-principle");
    document.body.appendChild(dragGhost);
    moveCircleGhost(event.clientX, event.clientY);
    button.classList.add("is-circle-drag-source");
    document.body.classList.add("principle-drag-active");
    if (navigator.vibrate) navigator.vibrate(20);
    event.preventDefault();
  }

  function moveCircleGhost(x, y) {
    if (!dragGhost) return;
    dragGhost.style.left = `${x}px`;
    dragGhost.style.top = `${y}px`;
  }

  function updateCircleDrag(event) {
    moveCircleGhost(event.clientX, event.clientY);
    clearCandidate();
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const circle = hit?.closest?.(".mindmap-principle-circle");
    if (circle && circle !== source) {
      candidate = circle;
      candidateMode = "circle";
      circle.classList.add("is-circle-drop-target");
      return;
    }
    const node = hit?.closest?.(".mindmap-node");
    if (node) {
      if (node === source?.closest?.(".mindmap-node")) {
        candidate = node;
        candidateMode = "same-node";
        return;
      }
      candidate = node;
      candidateMode = "node";
      node.classList.add("is-drop-target");
      return;
    }
    const arena = hit?.closest?.(".principle-mindmap-arena");
    if (arena) {
      candidate = arena;
      candidateMode = "arena";
    }
  }

  async function finishCircleDrag(event) {
    const principle = rowForId(sourcePrincipleId);
    source?.classList.remove("is-circle-drag-source");
    dragGhost?.remove();
    dragGhost = null;
    const target = candidate;
    const mode = candidateMode;
    clearCandidate();
    if (!principle) return;

    if (mode === "circle" && target?.dataset?.principleId) {
      const targetRow = rowForId(target.dataset.principleId);
      if (targetRow?.group_id && targetRow.group_id === principle.group_id) {
        reorderCircleWithinGroup(principle, targetRow);
        return;
      }
      if (targetRow) await movePrincipleToServerNode(principle, targetRow);
      return;
    }

    if (mode === "same-node") return;

    if (mode === "node" && target) {
      const key = target.dataset.mindmapNodeKey || target.dataset.principleGroupWindow || "";
      if (key.startsWith("localgroup:")) await movePrincipleToLocalGroup(principle, key.slice(11));
      else await movePrincipleToNodeKey(principle, key);
      return;
    }

    if (mode === "arena" || !target) {
      const arena = currentArena();
      const rect = arena?.getBoundingClientRect();
      const scroll = currentArenaScroll();
      const x = Math.max(0, (event.clientX - (rect?.left || 0)) + (scroll?.scrollLeft || 0) - NODE_WIDTH / 2);
      const y = Math.max(0, (event.clientY - (rect?.top || 0)) + (scroll?.scrollTop || 0) - 60);
      saveNodePosition(`single:${principle.id}`, x, y);
      if (principle.group_id) await makePrincipleStandalone(principle);
      else {
        toast(`Principle #${principle.principle_number} moved.`);
        reloadIntoPrinciples();
      }
    }
  }

  function reorderCircleWithinGroup(sourceRow, targetRow) {
    const key = sourceRow.group_id || `single:${sourceRow.id}`;
    const node = source?.closest?.(".mindmap-node");
    const container = node?.querySelector(".mindmap-circle-bar");
    if (!container) return;
    const buttons = [...container.querySelectorAll(".mindmap-principle-circle")];
    const sourceButton = buttons.find((button) => button.dataset.principleId === sourceRow.id);
    const targetButton = buttons.find((button) => button.dataset.principleId === targetRow.id);
    if (!sourceButton || !targetButton) return;
    container.insertBefore(sourceButton, targetButton);
    saveCircleOrder(key, [...container.querySelectorAll(".mindmap-principle-circle")].map((button) => button.dataset.principleId));
    toast("Principle order saved inside this group.");
  }

  async function movePrincipleToServerNode(principle, targetRow) {
    if (principle.id === targetRow.id) return;
    if (principle.group_id && targetRow.group_id === principle.group_id) return;
    busy = true;
    syncStatus("Moving principle…", "saving");
    try {
      const client = getDb();
      const { error } = await client.rpc("move_conflict_principles", {
        p_principle_ids: [principle.id],
        p_target_principle_id: targetRow.id,
        p_mode: "existing",
        p_group_title: null,
      });
      if (error) throw error;
      syncStatus("Principle moved", "synced");
      toast(`Principle #${principle.principle_number} moved to the group.`);
      reloadIntoPrinciples();
    } catch (error) {
      syncStatus("Sync failed", "error");
      toast(error?.message || "The principle could not be moved.", "error");
    } finally {
      busy = false;
    }
  }

  async function movePrincipleToNodeKey(principle, key) {
    if (key.startsWith("single:")) {
      const target = rowForId(key.slice(7));
      if (target) return movePrincipleToServerNode(principle, target);
      return;
    }
    if (key.startsWith("group:")) {
      const groupId = key.slice(6);
      const target = rows.find((row) => row.group_id === groupId && row.id !== principle.id);
      if (!target) return;
      if (principle.group_id === groupId) return;
      return movePrincipleToServerNode(principle, target);
    }
  }

  async function movePrincipleToLocalGroup(principle, localId) {
    const local = emptyGroups().find((group) => group.id === localId);
    if (!local) return;
    busy = true;
    syncStatus("Creating group…", "saving");
    try {
      const client = getDb();
      const { data, error } = await client.rpc("move_conflict_principles", {
        p_principle_ids: [principle.id],
        p_target_principle_id: null,
        p_mode: "new",
        p_group_title: local.title || null,
      });
      if (error) throw error;
      const updated = (data || []).find((row) => row.id === principle.id);
      if (!updated?.group_id) throw new Error("The new group could not be created.");
      const oldKey = `localgroup:${localId}`;
      const newKey = `group:${updated.group_id}`;
      const saved = positions();
      if (saved[oldKey]) {
        saved[newKey] = saved[oldKey];
        delete saved[oldKey];
        savePositions(saved);
      }
      saveEmptyGroups(emptyGroups().filter((group) => group.id !== localId));
      syncStatus("Group created", "synced");
      toast(`Principle #${principle.principle_number} added to ${local.title}.`);
      reloadIntoPrinciples();
    } catch (error) {
      syncStatus("Sync failed", "error");
      toast(error?.message || "The principle could not be added to that group.", "error");
    } finally {
      busy = false;
    }
  }

  async function makePrincipleStandalone(principle) {
    busy = true;
    syncStatus("Removing from group…", "saving");
    try {
      const client = getDb();
      const { error } = await client.rpc("move_conflict_principles", {
        p_principle_ids: [principle.id],
        p_target_principle_id: null,
        p_mode: "standalone",
        p_group_title: null,
      });
      if (error) throw error;
      syncStatus("Principle moved", "synced");
      toast(`Principle #${principle.principle_number} is now standalone.`);
      reloadIntoPrinciples();
    } catch (error) {
      syncStatus("Sync failed", "error");
      toast(error?.message || "The principle could not be removed from the group.", "error");
    } finally {
      busy = false;
    }
  }

  function gestureTarget(event) {
    const circle = event.target.closest?.(".mindmap-principle-circle");
    if (circle) return { kind: "circle", element: circle, hold: CIRCLE_HOLD_MS };
    const detail = event.target.closest?.(".focused-principle-group .principle-detail-card");
    if (detail && !event.target.closest("button, a, input, textarea, select, [contenteditable='true']")) return { kind: "detail", element: detail, hold: HOLD_MS };
    const node = event.target.closest?.(".principles-view .mindmap-node");
    if (node && !event.target.closest(".principles-toolbar, input, textarea, select, .mindmap-principle-circle")) return { kind: "node", element: node, hold: HOLD_MS };
    return null;
  }

  document.addEventListener("pointerdown", (event) => {
    if (busy || (event.button !== undefined && event.button !== 0)) return;
    const target = gestureTarget(event);
    if (!target) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    source = target.element;
    sourceKind = target.kind;
    sourceKey = source.dataset.mindmapNodeKey || source.dataset.sourceNodeKey || "";
    sourcePrincipleId = source.dataset.principleId || source.dataset.mindmapPrincipleId || "";
    clearPress();
    pressTimer = window.setTimeout(() => {
      if (target.kind === "node") beginNodeDrag(event, target.element);
      else if (target.kind === "detail") beginDetailDrag(event, target.element);
      else beginCircleDrag(event, target.element);
    }, target.hold);
  }, true);

  document.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || !source) return;
    if (!dragging) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE) resetGesture();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (sourceKind === "node") updateNodeDrag(event);
    else if (sourceKind === "detail") updateDetailDrag(event);
    else if (sourceKind === "circle") updateCircleDrag(event);
  }, { capture: true, passive: false });

  document.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    clearPress();
    if (!dragging) { resetGesture(); return; }
    suppressClicksUntil = Date.now() + 1400;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    const kind = sourceKind;
    if (kind === "node") finishNodeDrag();
    else if (kind === "detail") finishDetailDrag();
    else if (kind === "circle") finishCircleDrag(event).finally(resetGesture);
    if (kind !== "circle") resetGesture();
  }, true);

  document.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== pointerId) return;
    resetGesture();
  }, true);

  document.addEventListener("click", (event) => {
    if (Date.now() < suppressClicksUntil && event.target.closest?.(".principles-view, .focused-principle-group")) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      return;
    }

    const newPrinciple = event.target.closest?.("[data-mindmap-new-principle]");
    if (newPrinciple) { event.preventDefault(); openModal("principle"); return; }
    const newGroup = event.target.closest?.("[data-mindmap-new-group]");
    if (newGroup) { event.preventDefault(); openModal("group"); return; }
    if (event.target.closest?.("[data-mindmap-close]")) { event.preventDefault(); closeModal(); return; }
    if (event.target.closest?.("[data-mindmap-back]")) { event.preventDefault(); backWithinPrinciples(); return; }

    const back = event.target.closest?.("[data-back-to-groups]");
    if (back && history.state?.tjmPrinciplesWindow) {
      event.preventDefault();
      event.stopPropagation();
      history.back();
      return;
    }

    const opener = event.target.closest?.(".principle-group-summary, .mindmap-principle-circle, [data-principle-reference], [data-search-result], [data-principle-open-group]");
    if (opener && document.querySelector(".principles-view, .focused-principle-group")) pushPrincipleHistory();
  }, true);

  document.addEventListener("submit", (event) => {
    const principleForm = event.target.closest?.("[data-mindmap-create-principle]");
    if (principleForm) { event.preventDefault(); createPrinciple(principleForm); return; }
    const groupForm = event.target.closest?.("[data-mindmap-create-group]");
    if (groupForm) { event.preventDefault(); createGroup(groupForm); }
  }, true);

  window.addEventListener("popstate", () => {
    const focused = document.querySelector(".focused-principle-group");
    if (focused) {
      const back = focused.querySelector("[data-back-to-groups]");
      if (back) window.setTimeout(() => back.click(), 0);
    }
  });

  const observer = new MutationObserver(schedulePrepare);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", schedulePrepare);
  schedulePrepare();
})();
