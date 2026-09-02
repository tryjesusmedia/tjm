(() => {
  "use strict";

  // Click suppression is now built into the unified Mind Map runtime and is
  // registered before the reading-page controller. Keeping this file as a
  // no-op prevents an older cached guard from competing with pan or pinch.
  if (window.__TJM_MINDMAP_V4_LOADED) return;
})();
