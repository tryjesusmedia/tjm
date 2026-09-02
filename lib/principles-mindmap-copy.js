(() => {
  "use strict";

  function enhanceCopy() {
    document.querySelectorAll(".principles-view-heading p").forEach((paragraph) => {
      if (/ordered by their lowest principle number/i.test(paragraph.textContent)) {
        paragraph.textContent = "Place groups and principles anywhere on your Mind Map. Their numbers never change, and your arrangement does not have to follow numerical order.";
      }
    });

    document.querySelectorAll(".principle-mindmap-help strong").forEach((item) => {
      item.textContent = "Mind Map";
    });
    document.querySelectorAll(".principle-mindmap-help span, .mindmap-group-drag-help").forEach((item) => {
      item.textContent = item.textContent.replace(/Mind map arena/gi, "Mind Map").replace(/arena/gi, "map");
    });

    document.querySelectorAll('.principles-view [data-principle-group-window^="group:"]').forEach((node) => {
      const copy = node.querySelector(".principle-group-copy");
      const label = copy?.querySelector(":scope > small")?.textContent || "";
      const match = label.match(/LED BY PRINCIPLE #(\d+)/i);
      if (!copy || !match || copy.querySelector(".principle-group-title")) return;
      const title = document.createElement("span");
      title.className = "principle-group-title tjm-derived-group-title";
      title.textContent = `Group led by #${match[1]}`;
      const preview = copy.querySelector(".principle-first-line");
      if (preview) copy.insertBefore(title, preview);
      else copy.appendChild(title);
    });

    const focused = document.querySelector(".focused-principle-group");
    if (focused) {
      const eyebrow = focused.querySelector(".focused-group-heading .eyebrow")?.textContent || "";
      const match = eyebrow.match(/LED BY PRINCIPLE #(\d+)/i);
      const heading = focused.querySelector("#focused-group-heading");
      if (heading && match && /^Group led by #\d+$/i.test(heading.textContent.trim())) {
        heading.textContent = `Group led by #${match[1]}`;
      }
    }
  }

  const observer = new MutationObserver(() => requestAnimationFrame(enhanceCopy));
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  requestAnimationFrame(enhanceCopy);
})();
