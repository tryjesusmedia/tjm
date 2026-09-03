(() => {
  "use strict";

  function dispatchRows(options, rows = options.getPrinciples?.() || []) {
    window.dispatchEvent(new CustomEvent("tjm-principles-updated", {
      detail: { planId: options.planId, rows },
    }));
  }

  function findDescriptor(element, property) {
    let prototype = element;
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
      if (descriptor) return descriptor;
      prototype = Object.getPrototypeOf(prototype);
    }
    return null;
  }

  function preserveMountedMindMap(options) {
    const root = document.getElementById("view-root");
    if (!root || root.__tjmReactFlowRenderGuard) return;
    const descriptor = findDescriptor(root, "innerHTML");
    if (!descriptor?.get || !descriptor?.set) return;

    try {
      Object.defineProperty(root, "innerHTML", {
        configurable: true,
        enumerable: descriptor.enumerable,
        get() {
          return descriptor.get.call(this);
        },
        set(value) {
          const principlesActive = Boolean(document.querySelector('.journey-nav [data-view="principles"].active'));
          const mountedHost = this.querySelector(":scope > .tjm-rf-host, .tjm-rf-host");
          if (principlesActive && mountedHost?.isConnected) {
            // The legacy page periodically rebuilds #view-root. Keep the React
            // Flow island mounted so expanded nodes, the editor sheet, and the
            // camera never flash or reset during a background sync.
            queueMicrotask(() => dispatchRows(options));
            return;
          }
          descriptor.set.call(this, value);
        },
      });
      root.__tjmReactFlowRenderGuard = true;
    } catch (_error) {
      // Progressive enhancement remains safe if a browser disallows an own
      // innerHTML accessor on this element.
    }
  }

  function synchronizeEmptyMutationResults(options) {
    const originalGetDb = options.getDb;
    if (typeof originalGetDb !== "function") return;

    options.getDb = () => {
      const client = originalGetDb();
      if (!client?.rpc || client.__tjmReactFlowRpcWrapped) return client;
      const originalRpc = client.rpc.bind(client);
      client.rpc = async (name, args, rpcOptions) => {
        const result = await originalRpc(name, args, rpcOptions);
        // The React component normally consumes every returned row itself. The
        // one edge case is deleting the final active principle: an empty array
        // still means “replace the active collection with empty,” not “ignore.”
        if (name === "soft_delete_conflict_principles" && !result?.error && Array.isArray(result?.data)) {
          const active = result.data.filter((row) => !row.deleted_at);
          if (active.length === 0) queueMicrotask(() => options.setPrinciples?.([]));
        }
        return result;
      };
      client.__tjmReactFlowRpcWrapped = true;
      return client;
    };
  }

  function keepBackInsideMindMap() {
    if (document.__tjmReactFlowBackGuard) return;
    document.__tjmReactFlowBackGuard = true;
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.(".tjm-rf-back");
      if (!button || !history.state?.tjmReactFlowGroup) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      history.back();
    }, true);
  }

  function installBridge() {
    const library = window.TJMPrinciples;
    if (!library?.createController || library.createController.__tjmReactFlowWrapped) return false;

    const originalCreateController = library.createController;
    function wrappedCreateController(options) {
      const originalSetPrinciples = options.setPrinciples;
      const originalSetDeleted = options.setDeletedPrinciples;

      options.setPrinciples = (rows) => {
        originalSetPrinciples?.(rows);
        dispatchRows(options, rows || []);
      };

      if (originalSetDeleted) {
        options.setDeletedPrinciples = (rows) => {
          originalSetDeleted(rows);
          window.dispatchEvent(new CustomEvent("tjm-deleted-principles-updated", {
            detail: { planId: options.planId, rows: rows || [] },
          }));
        };
      }

      synchronizeEmptyMutationResults(options);
      const controller = originalCreateController(options);
      window.TJMReactFlowBridge = { options, controller, version: 1 };
      preserveMountedMindMap(options);
      keepBackInsideMindMap();
      window.dispatchEvent(new CustomEvent("tjm-principles-bridge-ready", {
        detail: { planId: options.planId },
      }));
      return controller;
    }

    wrappedCreateController.__tjmReactFlowWrapped = true;
    wrappedCreateController.__original = originalCreateController;
    library.createController = wrappedCreateController;
    return true;
  }

  if (!installBridge()) {
    const timer = window.setInterval(() => {
      if (installBridge()) window.clearInterval(timer);
    }, 10);
    window.setTimeout(() => window.clearInterval(timer), 5000);
  }
})();
