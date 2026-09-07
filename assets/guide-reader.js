(() => {
  "use strict";

  const panels = [...document.querySelectorAll(".lesson-panel")];
  const shell = document.querySelector(".lesson-shell");
  const stage = document.getElementById("panelStage");
  const dots = [...document.querySelectorAll("#lessonDots button")];

  if (!panels.length || !shell || !stage || !dots.length) return;

  document.body.classList.add("guide-reader-enhanced");

  const storage = {
    read(key, fallback = null) {
      try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
  };

  const pathKey = window.location.pathname.replace(/\/+$/, "") || "/";
  const sizeKey = "tjm:guide-reader:size";
  const notesKey = `tjm:guide-reader:notes:${pathKey}`;
  const sizes = [1.05, 1.18, 1.32, 1.5];
  let sizeIndex = Number(storage.read(sizeKey, 1));
  if (!Number.isInteger(sizeIndex) || sizeIndex < 0 || sizeIndex >= sizes.length) sizeIndex = 1;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const toolbar = element("section", "guide-reader-toolbar");
  toolbar.setAttribute("aria-label", "Guide reading tools");

  const textControls = element("div", "guide-reader-text-controls");
  const textLabel = element("span", "guide-reader-text-label", "Text size");
  const smaller = element("button", "guide-reader-control guide-reader-size-button", "A−");
  smaller.type = "button";
  smaller.setAttribute("aria-label", "Smaller reading text");
  const larger = element("button", "guide-reader-control guide-reader-size-button", "A+");
  larger.type = "button";
  larger.setAttribute("aria-label", "Larger reading text");
  textControls.append(textLabel, smaller, larger);

  const utilityControls = element("div", "guide-reader-utility-controls");
  const sectionsButton = element("button", "guide-reader-control", "Sections");
  sectionsButton.type = "button";
  const keyPointsButton = element("button", "guide-reader-control", "Key points");
  keyPointsButton.type = "button";
  const detailsButton = element("button", "guide-reader-control", "Expand details");
  detailsButton.type = "button";
  const listenButton = document.getElementById("listenButton");
  if (listenButton) listenButton.classList.add("guide-reader-control");
  utilityControls.append(sectionsButton, keyPointsButton, detailsButton);
  if (listenButton) utilityControls.append(listenButton);

  const toolbarStatus = element("p", "guide-reader-status");
  toolbarStatus.setAttribute("role", "status");
  toolbarStatus.setAttribute("aria-live", "polite");
  toolbar.append(textControls, utilityControls, toolbarStatus);
  stage.before(toolbar);

  const makeDialog = (id, title) => {
    const dialog = element("dialog", "guide-reader-dialog");
    dialog.id = id;
    dialog.setAttribute("aria-labelledby", `${id}-title`);
    const header = element("div", "guide-reader-dialog-header");
    const heading = element("h2", "", title);
    heading.id = `${id}-title`;
    const close = element("button", "guide-reader-dialog-close", "Close");
    close.type = "button";
    close.addEventListener("click", () => dialog.close());
    header.append(heading, close);
    const body = element("div", "guide-reader-dialog-body");
    dialog.append(header, body);
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
    document.body.append(dialog);
    return { dialog, body, close };
  };

  const guideTitle = (document.title.split("|")[0] || "Guide").trim();
  const contents = makeDialog("guide-reader-sections", "Sections");
  const sectionList = element("ol", "guide-reader-section-list");

  const panelTitle = (panel, index) => {
    const heading = panel.querySelector("h1, h2, h3");
    const text = (heading?.innerText || heading?.textContent || "").replace(/\s+/g, " ").trim();
    return text || `Section ${index + 1}`;
  };

  panels.forEach((panel, index) => {
    const item = element("li");
    const button = element("button", "guide-reader-section-link");
    button.type = "button";
    button.dataset.readerSection = String(index);
    const number = element("span", "guide-reader-section-number", String(index + 1).padStart(2, "0"));
    const title = element("span", "", panelTitle(panel, index));
    button.append(number, title);
    button.addEventListener("click", () => {
      contents.dialog.close();
      dots[index]?.click();
    });
    item.append(button);
    sectionList.append(item);
  });
  contents.body.append(sectionList);

  const keyPoints = makeDialog("guide-reader-key-points", "Key points");
  const keyPointCopy = panels.at(-1).querySelector(".panel-copy")?.cloneNode(true)
    || panels.at(-1).cloneNode(true);
  keyPointCopy.classList.add("guide-reader-key-points");
  keyPointCopy.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  keyPointCopy.querySelectorAll(".completion-actions, .next-lesson-card, .lesson-navigation, button, details").forEach(node => node.remove());
  keyPoints.body.append(keyPointCopy);

  const notes = element("details", "guide-reader-notes");
  const notesSummary = element("summary", "", "My notes · optional");
  const notesContent = element("div", "guide-reader-notes-content");
  const notesId = `guide-reader-notes-${Math.random().toString(36).slice(2, 9)}`;
  const notesLabel = element("label", "", "What would you like to remember?");
  notesLabel.htmlFor = notesId;
  const notesField = element("textarea");
  notesField.id = notesId;
  notesField.rows = 5;
  notesField.spellcheck = true;
  const notesStatus = element("p", "guide-reader-notes-status", "Notes stay in this browser on this device.");
  notesStatus.setAttribute("role", "status");
  const storedNotes = storage.read(notesKey, "");
  if (typeof storedNotes === "string") notesField.value = storedNotes;
  notesField.addEventListener("input", () => {
    const saved = storage.write(notesKey, notesField.value);
    notesStatus.textContent = saved ? "Notes saved on this device." : "Notes could not be saved in this browser.";
  });
  notesContent.append(notesLabel, notesField, notesStatus);
  notes.append(notesSummary, notesContent);
  shell.after(notes);

  dots.forEach((dot, index) => {
    dot.textContent = String(index + 1);
    dot.title = panelTitle(panels[index], index);
  });

  const applySize = ({ announce = false } = {}) => {
    document.documentElement.style.setProperty("--guide-reader-size", `${sizes[sizeIndex]}rem`);
    smaller.disabled = sizeIndex === 0;
    larger.disabled = sizeIndex === sizes.length - 1;
    storage.write(sizeKey, sizeIndex);
    if (announce) toolbarStatus.textContent = `Text size ${Math.round(sizes[sizeIndex] / sizes[1] * 100)}%`;
  };

  smaller.addEventListener("click", () => {
    sizeIndex = Math.max(0, sizeIndex - 1);
    applySize({ announce: true });
  });
  larger.addEventListener("click", () => {
    sizeIndex = Math.min(sizes.length - 1, sizeIndex + 1);
    applySize({ announce: true });
  });

  const openDialog = (entry, trigger) => {
    if (typeof entry.dialog.showModal !== "function") return;
    entry.dialog.showModal();
    entry.dialog.addEventListener("close", () => trigger.focus({ preventScroll: true }), { once: true });
    entry.close.focus({ preventScroll: true });
  };
  sectionsButton.addEventListener("click", () => openDialog(contents, sectionsButton));
  keyPointsButton.addEventListener("click", () => openDialog(keyPoints, keyPointsButton));

  const activeIndex = () => panels.findIndex(panel => !panel.hidden);
  const activeDetails = () => [...(panels[activeIndex()]?.querySelectorAll("details") || [])];

  const syncDetailsButton = () => {
    const details = activeDetails();
    const allOpen = details.length > 0 && details.every(item => item.open);
    detailsButton.disabled = details.length === 0;
    detailsButton.textContent = allOpen ? "Close details" : "Expand details";
    detailsButton.setAttribute("aria-pressed", allOpen ? "true" : "false");
  };

  detailsButton.addEventListener("click", () => {
    const details = activeDetails();
    if (!details.length) return;
    const open = !details.every(item => item.open);
    details.forEach(item => { item.open = open; });
    toolbarStatus.textContent = open ? "Supporting details expanded" : "Supporting details closed";
    syncDetailsButton();
  });

  panels.forEach(panel => {
    panel.querySelectorAll("details").forEach(item => item.addEventListener("toggle", syncDetailsButton));
  });

  const syncCurrentSection = () => {
    const current = Math.max(0, activeIndex());
    contents.body.querySelectorAll("[data-reader-section]").forEach((button, index) => {
      if (index === current) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    toolbarStatus.textContent = `Section ${current + 1} of ${panels.length} · Place saved on this device`;
    syncDetailsButton();
  };

  const panelObserver = new MutationObserver(syncCurrentSection);
  panels.forEach(panel => panelObserver.observe(panel, { attributes: true, attributeFilter: ["hidden"] }));

  applySize();
  syncCurrentSection();

  document.addEventListener("pagehide", () => {
    storage.write(notesKey, notesField.value);
  });

  document.documentElement.dataset.guideReader = guideTitle;
})();
