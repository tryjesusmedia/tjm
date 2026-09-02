(() => {
  "use strict";
  const parts = window.__TJM_MINDMAP_V4_PARTS;
  if (!Array.isArray(parts) || parts.some((part) => typeof part !== "string")) {
    console.error("The Mind Map could not be loaded because one or more source parts are missing.");
    return;
  }
  const script = document.createElement("script");
  script.dataset.tjmMindmapV4 = "true";
  script.textContent = parts.join("");
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  delete window.__TJM_MINDMAP_V4_PARTS;
})();
