(() => {
  "use strict";

  // Mind Map v4 is loaded synchronously by each reading-plan config file.
  // This legacy deferred entry point intentionally does nothing so a second
  // drag system cannot attach competing pointer/click handlers.
  if (window.__TJM_MINDMAP_V4_LOADED) return;
  console.error("The unified Mind Map runtime did not finish loading.");
})();
