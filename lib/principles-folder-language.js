(() => {
  "use strict";

  const replacements = [
    [/Group led by #([0-9]+)/g, "New Folder #$1"],
    [/GROUP LED BY PRINCIPLE #([0-9]+)/g, "FOLDER"],
    [/group led by #([0-9]+)/gi, "New Folder #$1"],
    [/\bgroups\b/g, "folders"],
    [/\bGroups\b/g, "Folders"],
    [/\bGROUPS\b/g, "FOLDERS"],
    [/\bgroup\b/g, "folder"],
    [/\bGroup\b/g, "Folder"],
    [/\bGROUP\b/g, "FOLDER"],
    [/\bstandalone\b/gi, "on the main Mind Map"],
  ];

  function replaceText(value) {
    return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value || ""));
  }

  function update(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement?.closest("script, style, textarea")) continue;
      const next = replaceText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    root.querySelectorAll("[aria-label], [title], [placeholder]").forEach((element) => {
      for (const attribute of ["aria-label", "title", "placeholder"]) {
        if (!element.hasAttribute(attribute)) continue;
        const current = element.getAttribute(attribute);
        const next = replaceText(current);
        if (next !== current) element.setAttribute(attribute, next);
      }
    });
  }

  function refresh() {
    // Keep folder terminology consistent in every dynamically rendered journey
    // view and in the sign-in explanation, while deliberately leaving the site
    // header/footer alone so “WhatsApp Group” is not renamed by accident.
    update(document.getElementById("view-root"));
    update(document.querySelector("#auth-gate .auth-card"));
  }

  const observer = new MutationObserver(() => requestAnimationFrame(refresh));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", refresh, { once: true });
  requestAnimationFrame(refresh);
})();
