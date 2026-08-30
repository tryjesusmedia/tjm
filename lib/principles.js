(() => {
  "use strict";

  function createController(options) {
    let openGroupKey = "";
    let loadedStorageKey = "";
    let menuPrincipleId = "";
    let editingPrincipleId = "";
    let movingPrincipleId = "";
    let toolbarOpen = false;
    let searchQuery = "";
    let searchMatches = [];
    let searchIndex = -1;
    let activeSearchPrincipleId = "";

    const escapeHTML = options.escapeHTML;
    const principles = () => options.getPrinciples();
    const db = () => options.getDb();
    const session = () => options.getSession();

    function storageKey() {
      return `tjm-open-principle-group:${options.planId}:${session()?.user?.id || "guest"}`;
    }

    function loadRememberedGroup() {
      const key = storageKey();
      if (loadedStorageKey === key) return;
      loadedStorageKey = key;
      try { openGroupKey = window.localStorage.getItem(key) || ""; } catch (_error) { openGroupKey = ""; }
    }

    function rememberGroup(key) {
      openGroupKey = key || "";
      try {
        if (openGroupKey) window.localStorage.setItem(storageKey(), openGroupKey);
        else window.localStorage.removeItem(storageKey());
      } catch (_error) {
        // The interface still works when private browsing blocks local storage.
      }
    }

    function nextNumber() {
      return principles().reduce((maximum, principle) => Math.max(maximum, Number(principle.principle_number) || 0), 0) + 1;
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
      movingPrincipleId = "";
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
      return `<article class="principle-mini"><header><b>PRINCIPLE #${principle.principle_number}</b><button class="principle-inline-edit" type="button" data-principle-edit="${principle.id}">Edit</button></header><p>${escapeHTML(principle.body)}</p>${crossReferenceChips(principle)}</article>`;
    }

    function moveForm(principle) {
      const currentKey = groupKey(principle);
      const targets = groupedPrinciples().filter((group) => group.key !== currentKey);
      return `<form class="principle-move-form" data-principle-id="${principle.id}">
        <div class="field"><label for="move-${principle.id}">Move principle #${principle.principle_number}</label><select id="move-${principle.id}" name="move-target"><option value="standalone">Keep as a single principle</option>${targets.map((group) => {
          const target = group.principles[0];
          const numbers = group.principles.map((item) => `#${item.principle_number}`).join(", ");
          return `<option value="${target.id}">Group with ${numbers} — ${escapeHTML(firstLine(target.body).slice(0, 70))}</option>`;
        }).join("")}</select><small>Choose another principle group, or keep this principle by itself.</small></div>
        <div class="principle-form-actions"><button class="button button-primary" type="submit">Move principle</button><button class="button button-secondary" type="button" data-principle-cancel>Cancel</button></div>
      </form>`;
    }

    function principleDetail(principle) {
      const reading = options.getReadings().find((item) => item.id === principle.reading_id);
      const menuOpen = menuPrincipleId === principle.id;
      const content = editingPrincipleId === principle.id
        ? editForm(principle, "tab")
        : movingPrincipleId === principle.id
          ? moveForm(principle)
          : `<p>${escapeHTML(principle.body)}</p>${crossReferenceChips(principle)}${reading ? `<small class="principle-source">From ${escapeHTML(options.readingLabel(reading))}</small>` : ""}`;
      return `<article class="principle-detail-card${activeSearchPrincipleId === principle.id ? " is-search-match" : ""}" id="principle-id-${principle.id}" data-principle-number="${principle.principle_number}">
        <header><span class="principle-circle principle-circle-large">${principle.principle_number}</span><span class="principle-label">PRINCIPLE</span><div class="principle-menu-wrap"><button class="principle-menu-button" type="button" data-principle-menu="${principle.id}" aria-expanded="${menuOpen}" aria-label="Options for principle ${principle.principle_number}">⋮</button>${menuOpen ? `<div class="principle-menu" role="menu"><button type="button" role="menuitem" data-principle-edit="${principle.id}">Edit</button><button type="button" role="menuitem" data-principle-go="${principle.id}">Go to reading</button><button type="button" role="menuitem" data-principle-move="${principle.id}">Move</button></div>` : ""}</div></header>
        ${content}
      </article>`;
    }

    function groupWindow(group) {
      const lowest = group.principles[0];
      const open = openGroupKey === group.key;
      return `<article class="principle-group-window ${open ? "is-open" : ""}" data-principle-group-window="${group.key}">
        <button class="principle-group-summary" type="button" data-principle-group="${group.key}" aria-expanded="${open}">
          <span class="principle-group-copy"><small>${group.principles.length > 1 ? `GROUP · LED BY PRINCIPLE #${lowest.principle_number}` : `PRINCIPLE #${lowest.principle_number}`}</small><span class="principle-first-line">${escapeHTML(firstLine(lowest.body))}</span></span>
          <span class="principle-group-toggle" aria-hidden="true">${open ? "Close" : "Open"} ${open ? "↑" : "↓"}</span>
          <span class="principle-circles" aria-label="Principles ${group.principles.map((principle) => principle.principle_number).join(", ")}">${group.principles.map((principle) => `<span class="principle-circle">${principle.principle_number}</span>`).join("")}</span>
        </button>
        ${open ? `<div class="principle-group-details">${group.principles.map(principleDetail).join("")}</div>` : ""}
      </article>`;
    }

    function toolbarMenu() {
      const resultStatus = searchMatches.length && searchIndex >= 0
        ? `${searchIndex + 1} of ${searchMatches.length} matches`
        : searchQuery
          ? "No matches"
          : "Search every principle";
      return `<div class="principles-toolbar-wrap"><button class="principles-toolbar-button" type="button" data-principles-toolbar aria-expanded="${toolbarOpen}" aria-label="Open Principles tools"><span></span><span></span><span></span></button>${toolbarOpen ? `<aside class="principles-toolbar" aria-label="Principles tools"><header class="principles-toolbar-heading"><strong>Principles tools</strong><button type="button" data-principles-toolbar aria-label="Close Principles tools">×</button></header>
        <form class="principle-search-form" role="search"><label for="principle-global-search">Search principles</label><div class="principle-search-row"><input id="principle-global-search" name="principle-search" type="search" value="${escapeHTML(searchQuery)}" placeholder="Any word, phrase, or number"><button class="button button-primary" type="submit">Find</button></div><div class="principle-search-navigation"><span aria-live="polite">${escapeHTML(resultStatus)}</span><div><button type="button" data-principle-search-previous ${searchIndex <= 0 ? "disabled" : ""} aria-label="Previous matching principle">← Previous</button><button type="button" data-principle-search-next ${searchIndex < 0 || searchIndex >= searchMatches.length - 1 ? "disabled" : ""} aria-label="Next matching principle">Next →</button></div></div></form>
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
      return `<section aria-labelledby="principles-heading" class="principles-view"><header class="view-heading principles-view-heading"><div><p class="eyebrow">YOUR DISCOVERIES</p><h2 id="principles-heading">Principles</h2><p>Groups are ordered by their lowest principle number. The lowest number is always the group leader, and every number in that group appears beneath its first line.</p></div>${toolbarMenu()}</header>
        <div class="principle-group-list">${groups.length ? groups.map(groupWindow).join("") : `<div class="empty-card"><strong>No principles yet.</strong><p>Your first numbered principle will appear here after you save it from a reading.</p><button class="button button-primary" type="button" data-go-first-reading>Go to a reading</button></div>`}</div>
      </section>`;
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
        options.setPrinciples((data || []).sort((left, right) => left.principle_number - right.principle_number));
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
      const id = form.dataset.principleId;
      const value = new FormData(form).get("move-target")?.toString() || "standalone";
      try {
        options.setSync("Moving principle…", "saving");
        const { data, error } = await db().rpc("move_conflict_principle", {
          p_principle_id: id,
          p_target_principle_id: value === "standalone" ? null : value,
          p_standalone: value === "standalone",
        });
        if (error) throw error;
        const updated = (data || []).sort((left, right) => left.principle_number - right.principle_number);
        options.setPrinciples(updated);
        const moved = updated.find((principle) => principle.id === id);
        if (moved) rememberGroup(groupKey(moved));
        movingPrincipleId = "";
        menuPrincipleId = "";
        options.setSync("Principle moved", "synced");
        options.toast("Principle group updated.");
        options.rerender();
      } catch (error) {
        options.setSync("Sync failed", "error");
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
        options.setPrinciples((data || []).sort((left, right) => left.principle_number - right.principle_number));
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
      movingPrincipleId = "";
      options.showPrinciples();
      window.setTimeout(() => document.getElementById(`principle-id-${principle.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
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
      if (target.dataset.principleGroup !== undefined) {
        loadRememberedGroup();
        rememberGroup(openGroupKey === target.dataset.principleGroup ? "" : target.dataset.principleGroup);
        menuPrincipleId = "";
        editingPrincipleId = "";
        movingPrincipleId = "";
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
        movingPrincipleId = "";
        menuPrincipleId = "";
        options.rerender();
        return true;
      }
      if (target.dataset.principleMove) {
        movingPrincipleId = target.dataset.principleMove;
        editingPrincipleId = "";
        menuPrincipleId = "";
        options.rerender();
        return true;
      }
      if (target.hasAttribute("data-principle-cancel")) {
        editingPrincipleId = "";
        movingPrincipleId = "";
        menuPrincipleId = "";
        options.rerender();
        return true;
      }
      if (target.dataset.principleGo) {
        const principle = principles().find((item) => item.id === target.dataset.principleGo);
        if (principle) {
          rememberGroup(groupKey(principle));
          menuPrincipleId = "";
          options.goToReadingById(principle.reading_id);
        }
        return true;
      }
      if (target.dataset.principleReference) {
        openReference(target.dataset.principleReference);
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
      return false;
    }

    function handleChange(target) {
      if (!target.matches("[data-principle-file]")) return false;
      importSpreadsheet(target.files?.[0]).finally(() => { target.value = ""; });
      return true;
    }

    function resetForSession() {
      loadedStorageKey = "";
      openGroupKey = "";
      menuPrincipleId = "";
      editingPrincipleId = "";
      movingPrincipleId = "";
      toolbarOpen = false;
      searchQuery = "";
      searchMatches = [];
      searchIndex = -1;
      activeSearchPrincipleId = "";
    }

    return {
      createFromForm,
      handleChange,
      handleClick,
      handleSubmit,
      nextNumber,
      renderCreateNumberField,
      renderReadingPrinciple,
      renderTab,
      resetForSession,
    };
  }

  window.TJMPrinciples = { createController };
})();
