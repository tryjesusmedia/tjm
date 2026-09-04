(() => {
  "use strict";

  const panels = [...document.querySelectorAll(".lesson-panel")];
  const progressBar = document.getElementById("lessonProgress");
  const pageProgress = document.getElementById("pageProgress");
  const panelCount = document.getElementById("panelCount");
  const dotsWrap = document.getElementById("lessonDots");
  const backButton = document.getElementById("backButton");
  const nextButton = document.getElementById("nextButton");
  const restartButton = document.getElementById("restartLesson");
  const listenButton = document.getElementById("listenButton");
  const lessonNavigation = document.getElementById("lessonNavigation");
  const toast = document.getElementById("toast");
  const storageKey = "tjm-jesus-guide-9-progress";
  const total = panels.length;
  let current = 1;
  let speaking = false;
  let toastTimer;

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
  };

  const saved = Number.parseInt(localStorage.getItem(storageKey) || "1", 10);
  if (Number.isInteger(saved) && saved >= 1 && saved <= total) current = saved;

  const createDots = () => {
    if (!dotsWrap) return;
    dotsWrap.innerHTML = "";
    for (let index = 1; index <= total; index += 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Open section ${index}`);
      dot.addEventListener("click", () => goTo(index));
      dotsWrap.appendChild(dot);
    }
  };

  const stopSpeech = () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    speaking = false;
    listenButton?.setAttribute("aria-pressed", "false");
    const label = listenButton?.querySelector(".listen-label");
    if (label) label.textContent = "Listen";
    const icon = listenButton?.querySelector(".listen-icon");
    if (icon) icon.textContent = "▶";
  };

  const updateUI = ({ announce = false, scroll = false } = {}) => {
    panels.forEach((panel, index) => {
      const active = index + 1 === current;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });

    const percentage = (current / total) * 100;
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (panelCount) panelCount.textContent = `STEP ${current} OF ${total}`;

    [...(dotsWrap?.children || [])].forEach((dot, index) => {
      const active = index + 1 === current;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", active ? "step" : "false");
    });

    if (backButton) backButton.disabled = current === 1;
    if (nextButton) {
      nextButton.disabled = current === total;
      nextButton.style.visibility = current === total ? "hidden" : "visible";
    }
    if (lessonNavigation) lessonNavigation.style.display = current === 1 ? "none" : "grid";

    localStorage.setItem(storageKey, String(current));
    stopSpeech();

    if (scroll) {
      document.getElementById("lesson")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (announce && current > 1) showToast(`Step ${current} of ${total}`);
  };

  function goTo(index, options = {}) {
    const next = Math.max(1, Math.min(total, index));
    if (next === current && !options.force) return;
    current = next;
    updateUI({ announce: options.announce !== false, scroll: options.scroll !== false });
  }

  createDots();
  updateUI({ announce: false, scroll: false });

  document.querySelectorAll("[data-next]").forEach((button) => {
    button.addEventListener("click", () => goTo(current + 1));
  });
  backButton?.addEventListener("click", () => goTo(current - 1));
  nextButton?.addEventListener("click", () => goTo(current + 1));

  restartButton?.addEventListener("click", () => {
    localStorage.removeItem(storageKey);
    goTo(1, { force: true });
    showToast("Guide restarted");
  });

  listenButton?.addEventListener("click", () => {
    if (!("speechSynthesis" in window)) {
      showToast("Audio reading is not supported in this browser.");
      return;
    }
    if (speaking) {
      stopSpeech();
      return;
    }

    const activePanel = panels[current - 1];
    const text = activePanel?.innerText
      .replace(/↗/g, "")
      .replace(/→/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.onend = stopSpeech;
    utterance.onerror = stopSpeech;
    speaking = true;
    listenButton.setAttribute("aria-pressed", "true");
    const label = listenButton.querySelector(".listen-label");
    if (label) label.textContent = "Stop";
    const icon = listenButton.querySelector(".listen-icon");
    if (icon) icon.textContent = "■";
    window.speechSynthesis.speak(utterance);
  });

  document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement || event.target instanceof HTMLDetailsElement) return;
    if (event.key === "ArrowRight" && current < total) goTo(current + 1);
    if (event.key === "ArrowLeft" && current > 1) goTo(current - 1);
  });

  const updatePageProgress = () => {
    if (!pageProgress) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const percent = scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0;
    pageProgress.style.width = `${percent}%`;
  };
  updatePageProgress();
  window.addEventListener("scroll", updatePageProgress, { passive: true });
  window.addEventListener("resize", updatePageProgress, { passive: true });

  document.getElementById("currentYear").textContent = String(new Date().getFullYear());
})();
