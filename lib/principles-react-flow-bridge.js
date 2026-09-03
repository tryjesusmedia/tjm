(() => {
  "use strict";

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
