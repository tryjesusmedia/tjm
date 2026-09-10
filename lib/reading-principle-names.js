(() => {
  "use strict";

  const MAX_NAME_LENGTH = 120;

  function defaultName(number) {
    return `Principle #${Number(number) || ""}`;
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function customName(principle) {
    return String(principle?.principle_name || "").trim();
  }

  function normalizedName(value, number) {
    const clean = String(value || "").trim();
    if (!clean || clean.toLocaleLowerCase() === defaultName(number).toLocaleLowerCase()) return null;
    return clean.slice(0, MAX_NAME_LENGTH);
  }

  function nameField({ number, id, value = "" }) {
    const custom = String(value || "").trim();
    const automatic = !custom;
    const displayed = custom || defaultName(number);
    const helperId = `${id}-help`;
    return `<div class="field principle-name-field">
      <label for="${id}">Principle name</label>
      <input id="${id}" name="principle-name" type="text" maxlength="${MAX_NAME_LENGTH}" value="${escapeHTML(displayed)}" data-principle-name-auto="${automatic}" aria-describedby="${helperId}" autocomplete="off">
      <small id="${helperId}">Give this principle a short, memorable name. Leave the automatic name unchanged to use “${escapeHTML(defaultName(number))}.”</small>
    </div>`;
  }

  function patchData(data, principleId, name, canonicalRows) {
    const canonical = Array.isArray(canonicalRows)
      ? canonicalRows.find((row) => row.id === principleId)
      : canonicalRows?.id === principleId
        ? canonicalRows
        : null;
    const patch = (row) => row?.id === principleId
      ? { ...row, ...(canonical || {}), principle_name: canonical?.principle_name ?? name }
      : row;
    return Array.isArray(data) ? data.map(patch) : patch(data);
  }

  function installInputBehavior() {
    if (document.__tjmReadingPrincipleNameInputs) return;
    document.__tjmReadingPrincipleNameInputs = true;

    document.addEventListener("input", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const form = input.closest("#principle-form, .principle-edit-form[data-principle-context=\"reading\"]");
      if (!form) return;

      if (input.name === "principle-number") {
        const nameInput = form.querySelector('[name="principle-name"]');
        if (!(nameInput instanceof HTMLInputElement)) return;
        const current = nameInput.value.trim();
        const wasAutomatic = nameInput.dataset.principleNameAuto === "true" || /^Principle\s+#\d+$/i.test(current);
        if (wasAutomatic || !current) {
          nameInput.value = defaultName(input.value);
          nameInput.dataset.principleNameAuto = "true";
          const helper = document.getElementById(nameInput.getAttribute("aria-describedby") || "");
          if (helper) helper.textContent = `Give this principle a short, memorable name. Leave the automatic name unchanged to use “${defaultName(input.value)}.”`;
        }
        return;
      }

      if (input.name === "principle-name") {
        const number = form.querySelector('[name="principle-number"]')?.value;
        input.dataset.principleNameAuto = String(
          !input.value.trim() || input.value.trim().toLocaleLowerCase() === defaultName(number).toLocaleLowerCase(),
        );
      }
    }, true);

    document.addEventListener("blur", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.name !== "principle-name") return;
      const form = input.closest("#principle-form, .principle-edit-form[data-principle-context=\"reading\"]");
      if (!form || input.value.trim()) return;
      const number = form.querySelector('[name="principle-number"]')?.value;
      input.value = defaultName(number);
      input.dataset.principleNameAuto = "true";
    }, true);
  }

  function install() {
    const library = window.TJMPrinciples;
    if (!library?.createController || library.createController.__tjmReadingPrincipleNamesWrapped) return false;

    const originalCreateController = library.createController;

    function wrappedCreateController(options) {
      const pendingCreates = new Map();
      const pendingUpdates = new Map();
      const originalGetDb = options.getDb;

      options.getDb = () => {
        const client = originalGetDb();
        if (!client?.rpc || client.__tjmReadingPrincipleNamesRpcWrapped) return client;

        const originalRpc = client.rpc.bind(client);
        client.rpc = async (functionName, args, rpcOptions) => {
          const isCreate = functionName === "create_conflict_principle";
          const isUpdate = functionName === "update_conflict_principle";
          const pending = isCreate
            ? pendingCreates.get(String(args?.p_principle_number))
            : isUpdate
              ? pendingUpdates.get(String(args?.p_principle_id))
              : undefined;

          const result = await originalRpc(functionName, args, rpcOptions);
          if (result?.error || pending === undefined || (!isCreate && !isUpdate)) return result;

          const created = Array.isArray(result.data) ? result.data[0] : result.data;
          const principleId = isCreate ? created?.id : args?.p_principle_id;
          const cleanName = normalizedName(pending, args?.p_principle_number);
          if (!principleId) return result;

          // New rows already default to an automatic “Principle #N” name when
          // principle_name is null, so a second request is needed only for a
          // custom name. Updates always run so clearing a custom name works.
          if (isCreate && cleanName === null) {
            return { ...result, data: patchData(result.data, principleId, null, null) };
          }

          const nameResult = await originalRpc("set_conflict_principle_name", {
            p_principle_id: principleId,
            p_name: cleanName,
          });

          if (nameResult?.error) {
            // Do not report the already-saved principle as failed. Keep the
            // entered name visible for this render and give an honest sync
            // notice. A later edit can retry the name save.
            options.toast?.("The principle was saved, but its name could not sync. Please try editing the name again.", "error");
            return { ...result, data: patchData(result.data, principleId, cleanName, null) };
          }

          return {
            ...result,
            data: patchData(result.data, principleId, cleanName, nameResult.data),
          };
        };
        client.__tjmReadingPrincipleNamesRpcWrapped = true;
        return client;
      };

      const controller = originalCreateController(options);

      const originalRenderCreateNumberField = controller.renderCreateNumberField;
      controller.renderCreateNumberField = () => {
        const number = controller.nextNumber();
        return `${originalRenderCreateNumberField()}${nameField({ number, id: "principle-name" })}`;
      };

      const originalRenderReadingPrinciple = controller.renderReadingPrinciple;
      controller.renderReadingPrinciple = (principle) => {
        let markup = originalRenderReadingPrinciple(principle);
        const suffix = String(principle.id || "").replaceAll("-", "");

        if (markup.includes('class="principle-edit-form"')) {
          const bodyMarker = `<div class="field"><label for="edit-principle-body-${suffix}">`;
          const field = nameField({
            number: principle.principle_number,
            id: `edit-principle-name-${suffix}`,
            value: customName(principle),
          });
          if (markup.includes(bodyMarker)) markup = markup.replace(bodyMarker, `${field}${bodyMarker}`);
          return markup;
        }

        const custom = customName(principle);
        if (!custom) return markup;
        const numberLabel = `<b>PRINCIPLE #${principle.principle_number}</b>`;
        const namedLabel = `<span class="principle-mini-identity"><b>PRINCIPLE #${principle.principle_number}</b><strong>${escapeHTML(custom)}</strong></span>`;
        return markup.replace(numberLabel, namedLabel);
      };

      const originalCreateFromForm = controller.createFromForm;
      controller.createFromForm = async (form, readingId) => {
        const number = String(form.querySelector('[name="principle-number"]')?.value || "");
        const name = String(form.querySelector('[name="principle-name"]')?.value || "");
        pendingCreates.set(number, name);
        try {
          return await originalCreateFromForm(form, readingId);
        } finally {
          pendingCreates.delete(number);
        }
      };

      const originalHandleSubmit = controller.handleSubmit;
      controller.handleSubmit = (form) => {
        if (form.matches('.principle-edit-form[data-principle-context="reading"]')) {
          const id = String(form.dataset.principleId || "");
          pendingUpdates.set(id, String(form.querySelector('[name="principle-name"]')?.value || ""));
          try {
            return originalHandleSubmit(form);
          } finally {
            // updateFromForm reaches client.rpc synchronously before its first
            // await, and the RPC wrapper captures the name before this cleanup.
            pendingUpdates.delete(id);
          }
        }
        return originalHandleSubmit(form);
      };

      return controller;
    }

    wrappedCreateController.__tjmReadingPrincipleNamesWrapped = true;
    wrappedCreateController.__original = originalCreateController;
    library.createController = wrappedCreateController;
    installInputBehavior();
    return true;
  }

  if (!install()) {
    const timer = window.setInterval(() => {
      if (install()) window.clearInterval(timer);
    }, 10);
    window.setTimeout(() => window.clearInterval(timer), 5000);
  }
})();
