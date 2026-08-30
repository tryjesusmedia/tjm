(() => {
  "use strict";

  function createController(options) {
    let openGroupKey = "";
    let loadedStorageKey = "";
    let menuPrincipleId = "";
    let editingPrincipleId = "";
    let toolbarOpen = false;
    let searchQuery = "";
    let searchMatches = [];
    let searchIndex = -1;
    let activeSearchPrincipleId = "";
    let groupMenuOpen = false;
    let editingGroupKey = "";
    let manageMode = false;
    let selectedPrincipleIds = new Set();
    let movingPrincipleIds = [];
    let confirmation = null;
    let lastDeletedIds = [];
    let recentlyDeletedOpen = false;
    let returnPrincipleId = "";
    let recentGroupKeys = [];

    const escapeHTML = options.escapeHTML;
    const principles = () => options.getPrinciples();
    const db = () => options.getDb();
    const session = () => options.getSession();
    const deletedPrinciples = () => options.getDeletedPrinciples?.() || [];

    function activeRows(rows) {
      return (rows || []).filter((principle) => !principle.deleted_at).sort((left, right) => left.principle_number - right.principle_number);
    }

    function storageKey() {
      return `tjm-open-principle-group:${options.planId}:${session()?.user?.id || "guest"}`;
    }

    function recentStorageKey() {
      return `tjm-recent-principle-groups:${options.planId}:${session()?.user?.id || "guest"}`;
    }

    function loadRememberedGroup() {
      const key = storageKey();
      if (loadedStorageKey === key) return;
      loadedStorageKey = key;
      try {
        openGroupKey = window.localStorage.getItem(key) || "";
        recentGroupKeys = JSON.parse(window.localStorage.getItem(recentStorageKey()) || "[]");
        if (!Array.isArray(recentGroupKeys)) recentGroupKeys = [];
      } catch (_error) {
        openGroupKey = "";
        recentGroupKeys = [];
      }
    }

    function rememberGroup(key) {
      openGroupKey = key || "";
      try {
        if (openGroupKey) {
          window.localStorage.setItem(storageKey(), openGroupKey);
          recentGroupKeys = [openGroupKey, ...recentGroupKeys.filter((item) => item !== openGroupKey)].slice(0, 5);
          window.localStorage.setItem(recentStorageKey(), JSON.stringify(recentGroupKeys));
        } else window.localStorage.removeItem(storageKey());
      } catch (_error) {
        // The interface still works when private browsing blocks local storage.
      }
    }

    function nextNumber() {
      return [...principles(), ...deletedPrinciples()].reduce((maximum, principle) => Math.max(maximum, Number(principle.principle_number) || 0), 0) + 1;
    }

    function firstLine(body) {
      const line = String(body || "").split(/\r?\n/).find((part) => part.trim())?.trim() || "Untitled principle";
      return line;
    }

    function groupKey(principle) {
      return principle.group_id ? `group:${principle.group_id}` : `single:${principle.id}`;
    }

    function groupedPrinciples() {
      const groups = new Map();
      for (const principle of [...principles()].sort((left, right) => left.principle_number - right.principle_number)) {
        const key = groupKey(principle);
        if (!groups.has(key)) groups.set(key, { key, principles: [] });
        groups.get(key).principles.push(principle);
      }
      return [...groups.values()].sort((left, right) => left.principles[0].principle_number - right.principles[0].principle_number);
    }

    function groupTitle(group) {
      return String(group?.principles?.[0]?.group_title || "").trim();
    }

    function groupLabel(group) {
      const lowest = group.principles[0];
      return group.principles.length > 1 || lowest.group_id
        ? `Group led by #${lowest.principle_number}`
        : `Principle #${lowest.principle_number}`;
    }

    function principleCircles(group, interactive = false) {
      const label = `Principles ${group.principles.map((principle) => principle.principle_number).join(", ")}`;
      return `<span class="principle-circles" aria-label="${label}">${group.principles.map((principle) => interactive
        ? `<button type="button" class="principle-circle" data-open-principle="${principle.id}" aria-label="Open principle ${principle.principle_number}">${principle.principle_number}</button>`
        : `<span class="principle-circle">${principle.principle_number}</span>`).join("")}</span>`;
    }

    function searchableText(principle) {
      const reading = options.getReadings().find((item) => item.id === principle.reading_id);
      return [
        principle.principle_number,
        principle.body,
        (principle.cross_reference_numbers || []).join(" "),
        reading ? options.readingLabel(reading) : "",
      ].join(" ").toLocaleLowerCase();
    }

    function findMatches(query) {
      const normalized = String(query || "").trim().toLocaleLowerCase();
      if (!normalized) return [];
      return [...principles()]
        .filter((principle) => searchableText(principle).includes(normalized))
        .sort((left, right) => left.principle_number - right.principle_number);
    }

    function showSearchResult(index) {
      if (!searchMatches.length) return;
      searchIndex = Math.max(0, Math.min(Number(index), searchMatches.length - 1));
      const principle = searchMatches[searchIndex];
      activeSearchPrincipleId = principle.id;
      rememberGroup(groupKey(principle));
      menuPrincipleId = "";
      editingPrincipleId = "";
      movingPrincipleIds = [];
      options.rerender();
      window.setTimeout(() => document.getElementById(`principle-id-${principle.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    }

    function startSearch(query) {
      searchQuery = String(query || "").trim();
      searchMatches = findMatches(searchQuery);
      searchIndex = -1;
      activeSearchPrincipleId = "";
      if (!searchQuery) {
        options.toast("Enter a word, phrase, or principle number to search.", "error");
        options.rerender();
        return;
      }
      if (!searchMatches.length) {
        options.toast(`No principles contain “${searchQuery}.”`, "error");
        options.rerender();
        return;
      }
      showSearchResult(0);
    }

    function parseCrossReferences(value) {
      return Array.from(new Set(String(value || "").split(/[^0-9]+/).filter(Boolean).map(Number).filter((number) => Number.isInteger(number) && number > 0))).sort((a, b) => a - b);
    }

    function validateNumber(value, currentId = "") {
      const number = Number(value);
      if (!Number.isInteger(number) || number < 1) throw new Error("Choose a whole principle number greater than zero.");
      if (principles().some((principle) => principle.id !== currentId && Number(principle.principle_number) === number)) {
        throw new Error(`Principle #${number} is already in use. Every principle must have a different number.`);
      }
      if (deletedPrinciples().some((principle) => principle.id !== currentId && Number(principle.principle_number) === number)) {
        throw new Error(`Principle #${number} is in Recently Deleted. Restore it or delete it forever before reusing that number.`);
      }
      return number;
    }

    function validateReferences(crossReferences, currentId = "", proposedNumber = 0) {
      const available = new Set(principles().filter((principle) => principle.id !== currentId).map((principle) => Number(principle.principle_number)));
      if (proposedNumber) available.add(proposedNumber);
      const unknown = crossReferences.filter((number) => !available.has(number));
      if (unknown.length) throw new Error(`Principle ${unknown.map((number) => `#${number}`).join(", ")} does not exist yet.`);
    }

    function crossReferenceChips(principle) {
      const references = principle.cross_reference_numbers || [];
      if (!references.length) return "";
      return `<div class="reference-chips" aria-label="Cross-referenced principles">${references.map((number) => `<button type="button" class="reference-chip" data-principle-reference="${number}">#${number}</button>`).join("")}</div>`;
    }

    function numberField(value, id, label = "Principle number") {
      return `<div class="field principle-number-field"><label for="${id}">${label}</label><div class="principle-number-input"><span aria-hidden="true">#</span><input id="${id}" name="principle-number" type="number" min="1" step="1" required value="${Number(value)}" inputmode="numeric"></div><small>Use any available whole number. Every principle number must be unique.</small></div>`;
    }

    function renderCreateNumberField() {
      return numberField(nextNumber(), "principle-number");
    }

    function editForm(principle, context) {
      const suffix = principle.id.replaceAll("-", "");
      return `<form class="principle-edit-form" data-principle-id="${principle.id}" data-principle-context="${context}">
        ${numberField(principle.principle_number, `edit-principle-number-${suffix}`)}
        <div class="field"><label for="edit-principle-body-${suffix}">Principle</label><textarea id="edit-principle-body-${suffix}" name="principle-body" maxlength="2000" required>${escapeHTML(principle.body)}</textarea></div>
        <div class="field"><label for="edit-cross-references-${suffix}">Related principle numbers</label><input id="edit-cross-references-${suffix}" name="cross-references" inputmode="numeric" maxlength="120" value="${escapeHTML((principle.cross_reference_numbers || []).join(", "))}" placeholder="10, 20, 30"><small>Separate principle numbers with commas.</small></div>
        <div class="principle-form-actions"><button class="button button-primary" type="submit">Save changes</button><button class="button button-secondary" type="button" data-principle-cancel>Edit later</button></div>
      </form>`;
    }

    function renderReadingPrinciple(principle) {
      if (editingPrincipleId === principle.id) return `<article class="principle-mini is-editing">${editForm(principle, "reading")}</article>`;
      const group = groupedPrinciples().find((item) => item.key === groupKey(principle));
      return `<article class="principle-mini"><header><b>PRINCIPLE #${principle.principle_number}</b><span><button class="principle-inline-edit" type="button" data-principle-edit="${principle.id}">Edit</button><button class="principle-inline-edit" type="button" data-principle-open-group="${principle.id}">Open in Principles</button></span></header><p>${escapeHTML(principle.body)}</p>${crossReferenceChips(principle)}${group && (group.principles.length > 1 || groupTitle(group)) ? `<small class="principle-reading-group">${escapeHTML(groupTitle(group) || groupLabel(group))} · ${group.principles.map((item) => `#${item.principle_number}`).join(", ")}</small>` : ""}</article>`;
    }

    function movePanel() {
      const ids = movingPrincipleIds;
      const moving = principles().filter((principle) => ids.includes(principle.id));
      if (!moving.length) return "";
      const currentKeys = new Set(moving.map(groupKey));
      const allTargets = groupedPrinciples().filter((group) => !currentKeys.has(group.key));
      const recentTargets = recentGroupKeys.map((key) => allTargets.find((group) => group.key === key)).filter(Boolean);
      const recentSet = new Set(recentTargets.map((group) => group.key));
      const otherTargets = allTargets.filter((group) => !recentSet.has(group.key));
      const targetCard = (group) => `<label class="move-target-card"><input type="radio" name="move-target" value="${group.principles[0].id}"><span><strong>${escapeHTML(groupTitle(group) || groupLabel(group))}</strong><small>${escapeHTML(firstLine(group.principles[0].body).slice(0, 90))}</small>${principleCircles(group)}</span></label>`;
      return `<div class="principle-overlay" role="presentation"><section class="principle-dialog move-dialog" role="dialog" aria-modal="true" aria-labelledby="move-principles-heading"><header><div><p class="eyebrow">ORGANIZE</p><h3 id="move-principles-heading">Move ${moving.length === 1 ? `principle #${moving[0].principle_number}` : `${moving.length} principles`}</h3></div><button type="button" data-principle-cancel aria-label="Close">×</button></header><form class="principle-move-form" data-principle-ids="${ids.join(",")}">
        <div class="move-choice-list"><label class="move-target-card"><input type="radio" name="move-target" value="standalone" checked><span><strong>Make ${moving.length === 1 ? "it" : "them"} standalone</strong><small>Keep ${moving.length === 1 ? "this principle" : "each selected principle"} outside a group.</small></span></label><label class="move-target-card"><input type="radio" name="move-target" value="new"><span><strong>Create a new group</strong><small>Start a fresh group with the selected ${moving.length === 1 ? "principle" : "principles"}.</small><input type="text" name="new-group-title" maxlength="80" placeholder="Optional group name"></span></label></div>
        ${recentTargets.length ? `<div class="move-target-section"><h4>Recent groups</h4><div class="move-choice-list">${recentTargets.map(targetCard).join("")}</div></div>` : ""}
        ${otherTargets.length ? `<div class="move-target-section"><h4>All groups and principles</h4><div class="move-choice-list">${otherTargets.map(targetCard).join("")}</div></div>` : ""}
        <div class="principle-form-actions"><button class="button button-primary" type="submit">Move ${moving.length === 1 ? "principle" : "selected principles"}</button><button class="button button-secondary" type="button" data-principle-cancel>Cancel</button></div>
      </form></section></div>`;
    }

    function principleDetail(principle) {
      const reading = options.getReadings().find((item) => item.id === principle.reading_id);
      const menuOpen = menuPrincipleId === principle.id;
      const content = editingPrincipleId === principle.id
        ? editForm(principle, "tab")
        : `<p>${escapeHTML(principle.body)}</p>${crossReferenceChips(principle)}${reading ? `<small class="principle-source">From ${escapeHTML(options.readingLabel(reading))}</small>` : ""}`;
      return `<article class="principle-detail-card${activeSearchPrincipleId === principle.id ? " is-search-match" : ""}" id="principle-id-${principle.id}" data-principle-number="${principle.principle_number}">
        <header><span class="principle-circle principle-circle-large">${principle.principle_number}</span><span class="principle-label">PRINCIPLE</span><div class="principle-visible-actions"><button type="button" data-principle-edit="${principle.id}">Edit</button><button type="button" data-principle-go="${principle.id}">Go to reading</button></div><div class="principle-menu-wrap"><button class="principle-menu-button" type="button" data-principle-menu="${principle.id}" aria-expanded="${menuOpen}" aria-label="More options for principle ${principle.principle_number}">⋮</button>${menuOpen ? `<div class="principle-menu" role="menu"><button type="button" role="menuitem" data-principle-move="${principle.id}">Move to another group</button><button class="is-danger" type="button" role="menuitem" data-principle-delete="${principle.id}">Delete principle</button></div>` : ""}</div></header>
        ${content}
      </article>`;
    }

    function groupWindow(group) {
      const lowest = group.principles[0];
      const title = groupTitle(group);
      return `<article class="principle-group-window" data-principle-group-window="${group.key}"><button class="principle-group-summary" type="button" data-principle-group="${group.key}" aria-label="Open ${escapeHTML(title || groupLabel(group))}">
        <span class="principle-group-copy"><small>${group.principles.length > 1 || lowest.group_id ? `GROUP · LED BY PRINCIPLE #${lowest.principle_number}` : `PRINCIPLE #${lowest.principle_number}`}</small>${title ? `<span class="principle-group-title">${escapeHTML(title)}</span>` : ""}<span class="principle-first-line">${escapeHTML(firstLine(lowest.body))}</span></span>
        <span class="principle-group-toggle" aria-hidden="true">Open →</span>
        ${principleCircles(group)}
      </button></article>`;
    }

    function focusedGroupView(group, groups) {
      const index = groups.findIndex((item) => item.key === group.key);
      const title = groupTitle(group);
      const lowest = group.principles[0];
      return `<section class="focused-principle-group" aria-labelledby="focused-group-heading"><div class="focused-toolbar-row"><nav class="principle-breadcrumb" aria-label="Principles location"><button type="button" data-back-to-groups>Principles</button><span>›</span><span>${escapeHTML(title || groupLabel(group))}</span></nav>${toolbarMenu()}</div>
        <header class="focused-group-heading"><div><p class="eyebrow">${group.principles.length > 1 || lowest.group_id ? `GROUP LED BY PRINCIPLE #${lowest.principle_number}` : `SINGLE PRINCIPLE`}</p>${editingGroupKey === group.key ? `<form class="group-title-form" data-group-key="${group.key}" data-group-id="${lowest.group_id || ""}"><label for="group-title-input">Group name</label><div><input id="group-title-input" name="group-title" maxlength="80" value="${escapeHTML(title)}" placeholder="Optional group name"><button class="button button-primary" type="submit">Save</button><button class="button button-secondary" type="button" data-principle-cancel>Cancel</button></div><small>Leave the name blank to use “${escapeHTML(groupLabel(group))}.”</small></form>` : `<h2 id="focused-group-heading">${escapeHTML(title || groupLabel(group))}</h2><p>${escapeHTML(firstLine(lowest.body))}</p>`}</div>
          <div class="principle-menu-wrap group-menu-wrap"><button class="principle-menu-button" type="button" data-group-menu aria-expanded="${groupMenuOpen}" aria-label="Group options">⋮</button>${groupMenuOpen ? `<div class="principle-menu group-menu" role="menu"><button type="button" role="menuitem" data-edit-group="${group.key}">${title ? "Edit group name" : "Name this group"}</button><button type="button" role="menuitem" data-manage-group="${group.key}">Manage principles</button>${group.principles.length > 1 || lowest.group_id ? `<button type="button" role="menuitem" data-dissolve-group="${group.key}">Remove group, keep principles</button>` : ""}<button class="is-danger" type="button" role="menuitem" data-delete-group="${group.key}">${group.principles.length > 1 ? "Delete group and principles" : "Delete principle"}</button></div>` : ""}</div></header>
        ${principleCircles(group, true)}
        <div class="focused-group-navigation"><button type="button" data-group-nav="previous" ${index <= 0 ? "disabled" : ""}>← Previous group</button><span>${index + 1} of ${groups.length}</span><button type="button" data-group-nav="next" ${index >= groups.length - 1 ? "disabled" : ""}>Next group →</button></div>
        <div class="principle-group-details">${group.principles.map(principleDetail).join("")}</div>
      </section>`;
    }

    function manageView(groups) {
      return `<section class="principle-manage-view" aria-labelledby="manage-principles-heading"><header><div><button class="principle-back-link" type="button" data-exit-manage>← Back to Principles</button><p class="eyebrow">ORGANIZE</p><h2 id="manage-principles-heading">Manage principles</h2><p>Select principles from any group, then move or delete them together.</p></div><label class="manage-select-all"><input type="checkbox" data-manage-all ${selectedPrincipleIds.size === principles().length && principles().length ? "checked" : ""}> Select all</label></header>
        <div class="manage-group-list">${groups.map((group) => `<section class="manage-group"><header><div><strong>${escapeHTML(groupTitle(group) || groupLabel(group))}</strong><small>${escapeHTML(firstLine(group.principles[0].body))}</small></div>${principleCircles(group)}</header><div>${group.principles.map((principle) => `<label class="manage-principle-row"><input type="checkbox" data-manage-select="${principle.id}" ${selectedPrincipleIds.has(principle.id) ? "checked" : ""}><span class="principle-circle">${principle.principle_number}</span><span>${escapeHTML(firstLine(principle.body))}</span></label>`).join("")}</div></section>`).join("")}</div>
        <div class="manage-action-bar"><strong>${selectedPrincipleIds.size} selected</strong><button class="button button-secondary" type="button" data-move-selected ${selectedPrincipleIds.size ? "" : "disabled"}>Move selected</button><button class="button button-secondary danger-button" type="button" data-delete-selected ${selectedPrincipleIds.size ? "" : "disabled"}>Delete selected</button></div>
      </section>`;
    }

    function confirmationDialog() {
      if (!confirmation) return "";
      const ids = confirmation.ids || [];
      const affected = principles().filter((principle) => ids.includes(principle.id));
      const referencedBy = principles().filter((principle) => (principle.cross_reference_numbers || []).some((number) => affected.some((item) => item.principle_number === number)));
      const isGroup = confirmation.type === "group";
      const label = isGroup ? (confirmation.title || `group led by #${affected[0]?.principle_number}`) : affected.length > 1 ? `${affected.length} selected principles` : `principle #${affected[0]?.principle_number}`;
      return `<div class="principle-overlay" role="presentation"><section class="principle-dialog delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-heading"><header><div><p class="eyebrow">PLEASE CHECK</p><h3 id="delete-heading">What would you like to do with ${escapeHTML(label)}?</h3></div><button type="button" data-cancel-confirmation aria-label="Close">×</button></header>${referencedBy.length ? `<p class="delete-warning"><strong>Cross-reference notice:</strong> ${referencedBy.length} other ${referencedBy.length === 1 ? "principle points" : "principles point"} to ${affected.length === 1 ? "this number" : "these numbers"}. The link will work again if you undo or restore.</p>` : ""}${isGroup ? `<button class="safe-delete-choice" type="button" data-confirm-dissolve><strong>Remove the group but keep every principle</strong><span>Recommended · Each principle becomes standalone and nothing is deleted.</span></button>` : ""}<button class="safe-delete-choice is-danger" type="button" data-confirm-delete><strong>Delete ${isGroup ? "the group and all principles inside" : affected.length > 1 ? "the selected principles" : "this principle"}</strong><span>Moves ${affected.length === 1 ? "it" : "them"} to Recently Deleted, where ${affected.length === 1 ? "it can" : "they can"} be restored.</span></button><button class="button button-secondary" type="button" data-cancel-confirmation>Cancel</button></section></div>`;
    }

    function deletedPanel() {
      if (!recentlyDeletedOpen) return "";
      const rows = [...deletedPrinciples()].sort((left, right) => new Date(right.deleted_at) - new Date(left.deleted_at));
      return `<section class="recently-deleted" aria-labelledby="recently-deleted-heading"><header><div><p class="eyebrow">RECOVERY</p><h3 id="recently-deleted-heading">Recently Deleted</h3><p>Restore a principle or remove it forever. Deleted numbers remain reserved until they are removed forever.</p></div><button type="button" data-close-deleted aria-label="Close Recently Deleted">×</button></header>${rows.length ? `<div>${rows.map((principle) => `<article><span class="principle-circle">${principle.principle_number}</span><p>${escapeHTML(firstLine(principle.body))}</p><button type="button" data-restore-principle="${principle.id}">Restore</button><button class="is-danger" type="button" data-delete-forever="${principle.id}">Delete forever</button></article>`).join("")}</div>` : `<div class="empty-card"><strong>Nothing is waiting here.</strong><p>Deleted principles will appear here so you can restore them.</p></div>`}</section>`;
    }

    function undoNotice() {
      return lastDeletedIds.length ? `<div class="principle-undo" role="status"><span>${lastDeletedIds.length === 1 ? "Principle moved" : `${lastDeletedIds.length} principles moved`} to Recently Deleted.</span><button type="button" data-undo-delete>Undo</button></div>` : "";
    }

    function toolbarMenu() {
      const resultStatus = searchMatches.length && searchIndex >= 0
        ? `${searchIndex + 1} of ${searchMatches.length} matches`
        : searchQuery
          ? "No matches"
          : "Search every principle";
      const recentGroups = recentGroupKeys.map((key) => groupedPrinciples().find((group) => group.key === key)).filter(Boolean).slice(0, 3);
      return `<div class="principles-toolbar-wrap"><button class="principles-toolbar-button" type="button" data-principles-toolbar aria-expanded="${toolbarOpen}" aria-label="Open Principles tools"><span></span><span></span><span></span></button>${toolbarOpen ? `<aside class="principles-toolbar" aria-label="Principles tools"><header class="principles-toolbar-heading"><strong>Principles tools</strong><button type="button" data-principles-toolbar aria-label="Close Principles tools">×</button></header>
        <form class="principle-search-form" role="search"><label for="principle-global-search">Search or jump to a number</label><div class="principle-search-row"><input id="principle-global-search" name="principle-search" type="search" value="${escapeHTML(searchQuery)}" placeholder="Any word, phrase, or number"><button class="button button-primary" type="submit">Find</button></div><div class="principle-search-navigation"><span aria-live="polite">${escapeHTML(resultStatus)}</span><div><button type="button" data-principle-search-previous ${searchIndex <= 0 ? "disabled" : ""} aria-label="Previous matching principle">← Previous</button><button type="button" data-principle-search-next ${searchIndex < 0 || searchIndex >= searchMatches.length - 1 ? "disabled" : ""} aria-label="Next matching principle">Next →</button></div></div>${searchMatches.length ? `<div class="principle-search-results">${searchMatches.map((principle, index) => `<button type="button" data-search-result="${index}" class="${index === searchIndex ? "is-active" : ""}"><span>#${principle.principle_number}</span><span>${escapeHTML(firstLine(principle.body))}</span></button>`).join("")}</div>` : ""}</form>
        ${recentGroups.length ? `<div class="recent-groups"><strong>Recently viewed</strong>${recentGroups.map((group) => `<button type="button" data-principle-group="${group.key}"><span>${escapeHTML(groupTitle(group) || groupLabel(group))}</span>${principleCircles(group)}</button>`).join("")}</div>` : ""}
        <div class="principle-library-actions"><button type="button" data-enter-manage>Manage principles</button><button type="button" data-open-deleted>Recently Deleted${deletedPrinciples().length ? ` (${deletedPrinciples().length})` : ""}</button></div>
        <div class="principle-toolbar-actions"><button class="button button-secondary" type="button" data-export-principles ${principles().length ? "" : "disabled"}>Download spreadsheet</button><button class="button button-secondary" type="button" data-import-principles ${principles().length ? "" : "disabled"}>Upload spreadsheet</button><input class="principle-file-input" type="file" data-principle-file accept=".xlsx,.xls" hidden></div>
        <p>The spreadsheet keeps principle numbers in column 1 and principle text in column 2.</p>
      </aside>` : ""}</div>`;
    }

    function renderTab() {
      loadRememberedGroup();
      if (!session()) {
        return `<section aria-labelledby="principles-heading"><header class="view-heading"><div><p class="eyebrow">YOUR DISCOVERIES</p><h2 id="principles-heading">Principles</h2><p>Explore every reading without an account. Sign in with Google to save, organize, export, and sync your own principles.</p></div></header><div class="empty-card"><strong>Sign in to see your principles.</strong><p>Your principles and their numbers are private to your account and available across your signed-in devices.</p><button class="button button-primary" type="button" data-require-sign-in>Sign in to save principles</button></div></section>`;
      }
      const groups = groupedPrinciples();
      if (openGroupKey && !groups.some((group) => group.key === openGroupKey)) rememberGroup("");
      const focused = groups.find((group) => group.key === openGroupKey);
      const content = manageMode
        ? manageView(groups)
        : focused
          ? focusedGroupView(focused, groups)
          : `<section aria-labelledby="principles-heading" class="principles-view"><header class="view-heading principles-view-heading"><div><p class="eyebrow">YOUR DISCOVERIES</p><h2 id="principles-heading">Principles</h2><p>Your groups are ordered by their lowest principle number. Every principle number appears in a purple circle along the bottom of its group card.</p></div>${toolbarMenu()}</header><div class="principle-group-list">${groups.length ? groups.map(groupWindow).join("") : `<div class="empty-card"><strong>No principles yet.</strong><p>Your first numbered principle will appear here after you save it from a reading.</p><button class="button button-primary" type="button" data-go-first-reading>Go to a reading</button></div>`}</div></section>`;
      return `${content}${recentlyDeletedOpen ? deletedPanel() : ""}${movingPrincipleIds.length ? movePanel() : ""}${confirmation ? confirmationDialog() : ""}${undoNotice()}`;
    }

    async function createFromForm(form, readingId) {
      if (!session()) { options.showSignIn(); return; }
      try {
        const number = validateNumber(form.querySelector('[name="principle-number"]').value);
        const body = form.querySelector("#principle-body").value.trim();
        if (!body) throw new Error("Write a principle before saving it.");
        const crossReferences = parseCrossReferences(form.querySelector("#cross-references").value);
        validateReferences(crossReferences, "", number);
        options.setSync("Saving principle…", "saving");
        const { data, error } = await db().rpc("create_conflict_principle", {
          p_plan_id: options.planId,
          p_reading_id: readingId,
          p_body: body,
          p_cross_reference_numbers: crossReferences,
          p_principle_number: number,
        });
        if (error) throw error;
        const created = Array.isArray(data) ? data[0] : data;
        options.setPrinciples([...principles(), created].filter(Boolean).sort((left, right) => left.principle_number - right.principle_number));
        options.setSync("Principle saved", "synced");
        options.toast(`Principle #${number} saved.`);
        options.rerender();
      } catch (error) {
        options.setSync("Sync failed", "error");
        options.toast(error.message, "error");
      }
    }

    async function updateFromForm(form) {
      const id = form.dataset.principleId;
      try {
        const number = validateNumber(form.querySelector('[name="principle-number"]').value, id);
        const body = form.querySelector('[name="principle-body"]').value.trim();
        if (!body) throw new Error("A principle cannot be empty.");
        const crossReferences = parseCrossReferences(form.querySelector('[name="cross-references"]').value);
        validateReferences(crossReferences, id, number);
        options.setSync("Saving changes…", "saving");
        const { data, error } = await db().rpc("update_conflict_principle", {
          p_principle_id: id,
          p_principle_number: number,
          p_body: body,
          p_cross_reference_numbers: crossReferences,
        });
        if (error) throw error;
        options.setPrinciples(activeRows(data));
        editingPrincipleId = "";
        menuPrincipleId = "";
        options.setSync("Changes saved", "synced");
        options.toast(`Principle #${number} updated.`);
        options.rerender();
      } catch (error) {
        options.setSync("Sync failed", "error");
        options.toast(error.message, "error");
      }
    }

    async function moveFromForm(form) {
      const ids = String(form.dataset.principleIds || "").split(",").filter(Boolean);
      const value = new FormData(form).get("move-target")?.toString() || "standalone";
      try {
        options.setSync(`Moving ${ids.length === 1 ? "principle" : "principles"}…`, "saving");
        const { data, error } = await db().rpc("move_conflict_principles", {
          p_principle_ids: ids,
          p_target_principle_id: value === "standalone" || value === "new" ? null : value,
          p_mode: value === "new" ? "new" : value === "standalone" ? "standalone" : "existing",
          p_group_title: value === "new" ? String(new FormData(form).get("new-group-title") || "").trim() : null,
        });
        if (error) throw error;
        const updated = activeRows(data);
        options.setPrinciples(updated);
        const moved = updated.find((principle) => ids.includes(principle.id));
        if (moved) rememberGroup(groupKey(moved));
        movingPrincipleIds = [];
        selectedPrincipleIds = new Set();
        manageMode = false;
        menuPrincipleId = "";
        options.setSync("Principles organized", "synced");
        options.toast(ids.length === 1 ? "Principle moved." : `${ids.length} principles moved.`);
        options.rerender();
      } catch (error) {
        options.setSync("Sync failed", "error");
        options.toast(error.message, "error");
      }
    }

    async function renameGroup(form) {
      const groupId = form.dataset.groupId;
      const title = String(new FormData(form).get("group-title") || "").trim();
      if (!groupId) {
        const group = groupedPrinciples().find((item) => item.key === form.dataset.groupKey);
        if (!group) return;
        movingPrincipleIds = group.principles.map((principle) => principle.id);
        editingGroupKey = "";
        options.toast("Create a named group from these principles.");
        options.rerender();
        return;
      }
      try {
        options.setSync("Saving group name…", "saving");
        const { data, error } = await db().rpc("rename_conflict_principle_group", { p_group_id: groupId, p_title: title });
        if (error) throw error;
        options.setPrinciples(activeRows(data));
        editingGroupKey = "";
        groupMenuOpen = false;
        options.setSync("Group name saved", "synced");
        options.toast(title ? "Group name updated." : "Group name removed.");
        options.rerender();
      } catch (error) {
        options.setSync("Sync failed", "error");
        options.toast(error.message, "error");
      }
    }

    async function dissolveGroup() {
      const group = groupedPrinciples().find((item) => item.key === confirmation?.groupKey);
      if (!group) return;
      const groupId = group.principles[0].group_id;
      if (!groupId) { confirmation = null; return; }
      try {
        options.setSync("Removing group…", "saving");
        const { data, error } = await db().rpc("dissolve_conflict_principle_group", { p_group_id: groupId });
        if (error) throw error;
        options.setPrinciples(activeRows(data));
        confirmation = null;
        rememberGroup("");
        options.setSync("Principles kept", "synced");
        options.toast("The group was removed. Every principle was kept.");
        options.rerender();
      } catch (error) {
        options.setSync("Sync failed", "error");
        options.toast(error.message, "error");
      }
    }

    async function softDelete(ids) {
      try {
        options.setSync("Moving to Recently Deleted…", "saving");
        const { data, error } = await db().rpc("soft_delete_conflict_principles", { p_principle_ids: ids });
        if (error) throw error;
        const removed = principles().filter((principle) => ids.includes(principle.id)).map((principle) => ({ ...principle, deleted_at: new Date().toISOString() }));
        options.setPrinciples(activeRows(data));
        options.setDeletedPrinciples?.([...removed, ...deletedPrinciples().filter((principle) => !ids.includes(principle.id))]);
        lastDeletedIds = ids;
        confirmation = null;
        selectedPrincipleIds = new Set();
        manageMode = false;
        rememberGroup("");
        options.setSync("Moved to Recently Deleted", "synced");
        options.rerender();
      } catch (error) {
        options.setSync("Sync failed", "error");
        options.toast(error.message, "error");
      }
    }

    async function restorePrinciples(ids) {
      try {
        options.setSync("Restoring…", "saving");
        const { data, error } = await db().rpc("restore_conflict_principles", { p_principle_ids: ids });
        if (error) throw error;
        options.setPrinciples(activeRows(data));
        options.setDeletedPrinciples?.(deletedPrinciples().filter((principle) => !ids.includes(principle.id)));
        lastDeletedIds = [];
        options.setSync("Principle restored", "synced");
        options.toast(ids.length === 1 ? "Principle restored." : "Principles restored.");
        options.rerender();
      } catch (error) {
        options.setSync("Sync failed", "error");
        options.toast(error.message, "error");
      }
    }

    async function deleteForever(id) {
      const principle = deletedPrinciples().find((item) => item.id === id);
      if (!principle || !window.confirm(`Delete principle #${principle.principle_number} forever? This cannot be undone.`)) return;
      try {
        const { error } = await db().rpc("hard_delete_conflict_principles", { p_principle_ids: [id] });
        if (error) throw error;
        options.setDeletedPrinciples?.(deletedPrinciples().filter((item) => item.id !== id));
        options.toast(`Principle #${principle.principle_number} was deleted forever.`);
        options.rerender();
      } catch (error) {
        options.toast(error.message, "error");
      }
    }

    function workbookLibrary() {
      if (!window.XLSX) throw new Error("The spreadsheet tools could not be loaded. Refresh the page and try again.");
      return window.XLSX;
    }

    function exportSpreadsheet() {
      try {
        const XLSX = workbookLibrary();
        const sorted = [...principles()].sort((left, right) => left.principle_number - right.principle_number);
        const workbook = XLSX.utils.book_new();
        const principleSheet = XLSX.utils.aoa_to_sheet([
          ["Principle Number", "Principle"],
          ...sorted.map((principle) => [principle.principle_number, principle.body]),
        ]);
        principleSheet["!cols"] = [{ wch: 19 }, { wch: 90 }];
        const metadataSheet = XLSX.utils.aoa_to_sheet([
          ["Row", "Principle ID", "Plan ID"],
          ...sorted.map((principle, index) => [index + 2, principle.id, options.planId]),
        ]);
        XLSX.utils.book_append_sheet(workbook, principleSheet, "Principles");
        XLSX.utils.book_append_sheet(workbook, metadataSheet, "TJM Metadata");
        workbook.Workbook = { Sheets: [{ name: "Principles" }, { name: "TJM Metadata", Hidden: 2 }] };
        XLSX.writeFile(workbook, `${options.exportFilename}-principles.xlsx`);
        options.toast("Your principles spreadsheet is ready.");
      } catch (error) {
        options.toast(error.message, "error");
      }
    }

    async function importSpreadsheet(file) {
      try {
        const XLSX = workbookLibrary();
        if (!file) return;
        options.setSync("Checking spreadsheet…", "saving");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const principleSheet = workbook.Sheets.Principles || workbook.Sheets[workbook.SheetNames[0]];
        const metadataSheet = workbook.Sheets["TJM Metadata"];
        if (!principleSheet || !metadataSheet) throw new Error("Upload a spreadsheet previously exported from this Principles tab. Its private matching data is missing.");
        const rows = XLSX.utils.sheet_to_json(principleSheet, { header: 1, raw: false, defval: "" }).slice(1);
        const metadata = XLSX.utils.sheet_to_json(metadataSheet, { header: 1, raw: false, defval: "" }).slice(1);
        const idsByRow = new Map(metadata.map((row) => [Number(row[0]), { id: String(row[1] || ""), planId: String(row[2] || "") }]));
        const updates = rows.map((row, index) => {
          const rowNumber = index + 2;
          const meta = idsByRow.get(rowNumber);
          if (!meta?.id || meta.planId !== options.planId) throw new Error(`Row ${rowNumber} cannot be matched to a saved principle.`);
          const number = Number(row[0]);
          const body = String(row[1] || "").trim();
          if (!Number.isInteger(number) || number < 1) throw new Error(`Row ${rowNumber} needs a whole principle number greater than zero.`);
          if (!body || body.length > 2000) throw new Error(`Row ${rowNumber} needs a principle between 1 and 2,000 characters.`);
          return { id: meta.id, principle_number: number, body };
        }).filter((update) => update.id);
        if (updates.length !== principles().length) throw new Error("Do not add or remove spreadsheet rows. Add new principles from a reading, and use the Principles tab to move groups.");
        const uniqueIds = new Set(updates.map((update) => update.id));
        const uniqueNumbers = new Set(updates.map((update) => update.principle_number));
        if (uniqueIds.size !== updates.length) throw new Error("The spreadsheet contains a duplicated principle row.");
        if (uniqueNumbers.size !== updates.length) throw new Error("Every principle number must be unique. The spreadsheet contains a duplicate number.");
        const knownIds = new Set(principles().map((principle) => principle.id));
        if (updates.some((update) => !knownIds.has(update.id))) throw new Error("This spreadsheet contains a principle from a different account or reading plan.");
        const { data, error } = await db().rpc("bulk_update_conflict_principles", { p_plan_id: options.planId, p_updates: updates });
        if (error) throw error;
        options.setPrinciples(activeRows(data));
        options.setSync("Spreadsheet imported", "synced");
        options.toast("Your principle numbers and text were updated from the spreadsheet.");
        options.rerender();
      } catch (error) {
        options.setSync("Import failed", "error");
        options.toast(error.message, "error");
      }
    }

    function openReference(number) {
      loadRememberedGroup();
      const principle = principles().find((item) => Number(item.principle_number) === Number(number));
      if (!principle) { options.toast(`Principle #${number} could not be found.`, "error"); return; }
      rememberGroup(groupKey(principle));
      menuPrincipleId = "";
      editingPrincipleId = "";
      movingPrincipleIds = [];
      options.showPrinciples();
      window.setTimeout(() => document.getElementById(`principle-id-${principle.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    }

    function openPrinciple(principle) {
      if (!principle) return;
      rememberGroup(groupKey(principle));
      activeSearchPrincipleId = principle.id;
      manageMode = false;
      toolbarOpen = false;
      options.showPrinciples();
      options.rerender();
      window.setTimeout(() => document.getElementById(`principle-id-${principle.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    }

    function renderReadingReturnLink(readingId) {
      const principle = principles().find((item) => item.id === returnPrincipleId && item.reading_id === readingId);
      return principle ? `<div class="return-to-principle"><span>You came here from principle #${principle.principle_number}.</span><button type="button" data-return-principle="${principle.id}">Return to principle #${principle.principle_number}</button></div>` : "";
    }

    function handleClick(target) {
      if (target.hasAttribute("data-principles-toolbar")) {
        toolbarOpen = !toolbarOpen;
        options.rerender();
        if (toolbarOpen) window.setTimeout(() => document.getElementById("principle-global-search")?.focus(), 0);
        return true;
      }
      if (target.hasAttribute("data-principle-search-previous")) {
        showSearchResult(searchIndex - 1);
        return true;
      }
      if (target.hasAttribute("data-principle-search-next")) {
        showSearchResult(searchIndex + 1);
        return true;
      }
      if (target.dataset.searchResult !== undefined) {
        showSearchResult(Number(target.dataset.searchResult));
        return true;
      }
      if (target.dataset.principleGroup !== undefined) {
        loadRememberedGroup();
        rememberGroup(target.dataset.principleGroup);
        menuPrincipleId = "";
        editingPrincipleId = "";
        movingPrincipleIds = [];
        toolbarOpen = false;
        options.rerender();
        return true;
      }
      if (target.hasAttribute("data-back-to-groups")) {
        rememberGroup("");
        groupMenuOpen = false;
        editingGroupKey = "";
        options.rerender();
        return true;
      }
      if (target.dataset.groupNav) {
        const groups = groupedPrinciples();
        const index = groups.findIndex((group) => group.key === openGroupKey);
        const nextIndex = index + (target.dataset.groupNav === "next" ? 1 : -1);
        if (groups[nextIndex]) rememberGroup(groups[nextIndex].key);
        groupMenuOpen = false;
        editingGroupKey = "";
        options.rerender();
        return true;
      }
      if (target.hasAttribute("data-group-menu")) {
        groupMenuOpen = !groupMenuOpen;
        options.rerender();
        return true;
      }
      if (target.dataset.editGroup) {
        editingGroupKey = target.dataset.editGroup;
        groupMenuOpen = false;
        options.rerender();
        window.setTimeout(() => document.getElementById("group-title-input")?.focus(), 0);
        return true;
      }
      if (target.dataset.manageGroup) {
        const group = groupedPrinciples().find((item) => item.key === target.dataset.manageGroup);
        selectedPrincipleIds = new Set(group?.principles.map((principle) => principle.id) || []);
        manageMode = true;
        groupMenuOpen = false;
        rememberGroup("");
        options.rerender();
        return true;
      }
      if (target.dataset.dissolveGroup || target.dataset.deleteGroup) {
        const key = target.dataset.dissolveGroup || target.dataset.deleteGroup;
        const group = groupedPrinciples().find((item) => item.key === key);
        if (group) confirmation = { type: "group", groupKey: key, title: groupTitle(group), ids: group.principles.map((principle) => principle.id) };
        groupMenuOpen = false;
        options.rerender();
        return true;
      }
      if (target.dataset.principleMenu) {
        menuPrincipleId = menuPrincipleId === target.dataset.principleMenu ? "" : target.dataset.principleMenu;
        options.rerender();
        return true;
      }
      if (target.dataset.principleEdit) {
        editingPrincipleId = target.dataset.principleEdit;
        movingPrincipleIds = [];
        menuPrincipleId = "";
        options.rerender();
        return true;
      }
      if (target.dataset.principleMove) {
        movingPrincipleIds = [target.dataset.principleMove];
        editingPrincipleId = "";
        menuPrincipleId = "";
        options.rerender();
        return true;
      }
      if (target.dataset.principleDelete) {
        confirmation = { type: "principle", ids: [target.dataset.principleDelete] };
        menuPrincipleId = "";
        options.rerender();
        return true;
      }
      if (target.hasAttribute("data-principle-cancel")) {
        editingPrincipleId = "";
        movingPrincipleIds = [];
        editingGroupKey = "";
        menuPrincipleId = "";
        options.rerender();
        return true;
      }
      if (target.dataset.principleGo) {
        const principle = principles().find((item) => item.id === target.dataset.principleGo);
        if (principle) {
          rememberGroup(groupKey(principle));
          returnPrincipleId = principle.id;
          menuPrincipleId = "";
          options.goToReadingById(principle.reading_id);
        }
        return true;
      }
      if (target.dataset.principleOpenGroup || target.dataset.returnPrinciple || target.dataset.openPrinciple) {
        const id = target.dataset.principleOpenGroup || target.dataset.returnPrinciple || target.dataset.openPrinciple;
        openPrinciple(principles().find((item) => item.id === id));
        return true;
      }
      if (target.dataset.principleReference) {
        openReference(target.dataset.principleReference);
        return true;
      }
      if (target.hasAttribute("data-enter-manage")) {
        manageMode = true;
        selectedPrincipleIds = new Set();
        toolbarOpen = false;
        rememberGroup("");
        options.rerender();
        return true;
      }
      if (target.hasAttribute("data-exit-manage")) {
        manageMode = false;
        selectedPrincipleIds = new Set();
        options.rerender();
        return true;
      }
      if (target.hasAttribute("data-move-selected")) {
        movingPrincipleIds = [...selectedPrincipleIds];
        options.rerender();
        return true;
      }
      if (target.hasAttribute("data-delete-selected")) {
        confirmation = { type: "selection", ids: [...selectedPrincipleIds] };
        options.rerender();
        return true;
      }
      if (target.hasAttribute("data-cancel-confirmation")) {
        confirmation = null;
        options.rerender();
        return true;
      }
      if (target.hasAttribute("data-confirm-dissolve")) {
        dissolveGroup();
        return true;
      }
      if (target.hasAttribute("data-confirm-delete")) {
        softDelete(confirmation?.ids || []);
        return true;
      }
      if (target.hasAttribute("data-undo-delete")) {
        restorePrinciples(lastDeletedIds);
        return true;
      }
      if (target.hasAttribute("data-open-deleted")) {
        recentlyDeletedOpen = true;
        toolbarOpen = false;
        options.rerender();
        return true;
      }
      if (target.hasAttribute("data-close-deleted")) {
        recentlyDeletedOpen = false;
        options.rerender();
        return true;
      }
      if (target.dataset.restorePrinciple) {
        restorePrinciples([target.dataset.restorePrinciple]);
        return true;
      }
      if (target.dataset.deleteForever) {
        deleteForever(target.dataset.deleteForever);
        return true;
      }
      if (target.hasAttribute("data-export-principles")) {
        exportSpreadsheet();
        return true;
      }
      if (target.hasAttribute("data-import-principles")) {
        document.querySelector('[data-principle-file]')?.click();
        return true;
      }
      if (target.hasAttribute("data-go-first-reading")) {
        options.goToReadingById(options.getReadings()[0]?.id);
        return true;
      }
      return false;
    }

    function handleSubmit(form) {
      if (form.matches(".principle-search-form")) {
        startSearch(new FormData(form).get("principle-search"));
        return true;
      }
      if (form.matches(".principle-edit-form")) {
        updateFromForm(form);
        return true;
      }
      if (form.matches(".principle-move-form")) {
        moveFromForm(form);
        return true;
      }
      if (form.matches(".group-title-form")) {
        renameGroup(form);
        return true;
      }
      return false;
    }

    function handleChange(target) {
      if (target.matches("[data-principle-file]")) {
        importSpreadsheet(target.files?.[0]).finally(() => { target.value = ""; });
        return true;
      }
      if (target.matches("[data-manage-select]")) {
        if (target.checked) selectedPrincipleIds.add(target.dataset.manageSelect);
        else selectedPrincipleIds.delete(target.dataset.manageSelect);
        options.rerender();
        return true;
      }
      if (target.matches("[data-manage-all]")) {
        selectedPrincipleIds = target.checked ? new Set(principles().map((principle) => principle.id)) : new Set();
        options.rerender();
        return true;
      }
      return false;
    }

    function resetForSession() {
      loadedStorageKey = "";
      openGroupKey = "";
      menuPrincipleId = "";
      editingPrincipleId = "";
      movingPrincipleIds = [];
      toolbarOpen = false;
      searchQuery = "";
      searchMatches = [];
      searchIndex = -1;
      activeSearchPrincipleId = "";
      groupMenuOpen = false;
      editingGroupKey = "";
      manageMode = false;
      selectedPrincipleIds = new Set();
      confirmation = null;
      lastDeletedIds = [];
      recentlyDeletedOpen = false;
      returnPrincipleId = "";
      recentGroupKeys = [];
    }

    return {
      createFromForm,
      handleChange,
      handleClick,
      handleSubmit,
      nextNumber,
      renderCreateNumberField,
      renderReadingPrinciple,
      renderReadingReturnLink,
      renderTab,
      resetForSession,
    };
  }

  window.TJMPrinciples = { createController };
})();
