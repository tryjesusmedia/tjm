(() => {
  "use strict";

  function dispatchRows(options) {
    window.dispatchEvent(new CustomEvent("tjm-principles-updated", {
      detail: { planId: options.planId, rows: options.getPrinciples?.() || [] },
    }));
  }

  function preserveMountedMindMap(options) {
    const root = document.getElementById("view-root");
    if (!root || root.__tjmReactFlowRenderGuard) return;
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
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

  function installBridge() {
    const library = window.TJMPrinciples;
    if (!library?.createController || library.createController.__tjmReactFlowWrapped) return false;

    const originalCreateController = library.createController;
    function wrappedCreateController(options) {
      const originalSetPrinciples = options.setPrinciples;
      const originalSetDeleted = options.setDeletedPrinciples;

      options.setPrinciples = (rows) => {
        originalSetPrinciples?.(rows);
        window.dispatchEvent(new CustomEvent("tjm-principles-updated", {
          detail: { planId: options.planId, rows: rows || [] },
        }));
      };

      if (originalSetDeleted) {
        options.setDeletedPrinciples = (rows) => {
          originalSetDeleted(rows);
          window.dispatchEvent(new CustomEvent("tjm-deleted-principles-updated", {
            detail: { planId: options.planId, rows: rows || [] },
          }));
        };
      }

      const controller = originalCreateController(options);
      window.TJMReactFlowBridge = { options, controller, version: 1 };
      preserveMountedMindMap(options);
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
