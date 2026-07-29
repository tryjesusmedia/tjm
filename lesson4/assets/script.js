(() => {
  'use strict';

  const TOTAL_SCREENS = 8;
  const STORAGE_KEY = 'tryJesusMediaLesson4';
  const config = window.TJM_CONFIG || {};
  const screens = Array.from(document.querySelectorAll('.lesson-screen'));
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');
  const progressTitle = document.getElementById('progressTitle');
  const stage = document.getElementById('lesson-stage');
  const restartButton = document.getElementById('restartLesson');
  const audioButton = document.getElementById('audioToggle');
  const toast = document.getElementById('toast');
  const reflections = [1, 2, 3].map((n) => document.getElementById(`reflection${n}`));

  let currentScreen = 1;
  let speaking = false;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      currentScreen = Number(saved.currentScreen) || 1;
      if (currentScreen < 1 || currentScreen > TOTAL_SCREENS) currentScreen = 1;
      reflections.forEach((field, index) => { field.value = saved[`reflection${index + 1}`] || ''; });
    } catch {
      currentScreen = 1;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentScreen,
        reflection1: reflections[0].value,
        reflection2: reflections[1].value,
        reflection3: reflections[2].value
      }));
    } catch {
      // Local storage can be unavailable in some private-browsing contexts.
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
  }

  function stopNarration() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speaking = false;
    audioButton.classList.remove('is-speaking');
    audioButton.setAttribute('aria-pressed', 'false');
    audioButton.innerHTML = '<span aria-hidden="true">▶</span> Listen';
  }

  function updateScreen({ focus = true } = {}) {
    screens.forEach((screen) => {
      const active = Number(screen.dataset.screen) === currentScreen;
      screen.hidden = !active;
      screen.classList.toggle('is-active', active);
    });

    const activeScreen = screens[currentScreen - 1];
    progressLabel.textContent = `${currentScreen} of ${TOTAL_SCREENS}`;
    progressTitle.textContent = activeScreen.dataset.title || '';
    progressBar.style.width = `${(currentScreen / TOTAL_SCREENS) * 100}%`;
    saveState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (focus) window.setTimeout(() => stage.focus({ preventScroll: true }), 180);
    stopNarration();
  }

  function goNext() {
    if (currentScreen < TOTAL_SCREENS) {
      currentScreen += 1;
      updateScreen();
    }
  }

  function goBack() {
    if (currentScreen > 1) {
      currentScreen -= 1;
      updateScreen();
    }
  }

  function restartLesson() {
    if (!window.confirm('Restart this lesson and clear your saved reflections?')) return;
    currentScreen = 1;
    reflections.forEach((field) => { field.value = ''; });
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    updateScreen();
    showToast('Lesson restarted');
  }

  function getActiveNarrationText() {
    const clone = screens[currentScreen - 1].cloneNode(true);
    clone.querySelectorAll('button, summary, textarea, .navigation-row, .microcopy, .privacy-note, .source-grid, .social-links').forEach((node) => node.remove());
    return clone.innerText.replace(/\s+/g, ' ').trim();
  }

  function toggleNarration() {
    if (!('speechSynthesis' in window)) {
      showToast('Audio narration is not supported in this browser.');
      return;
    }
    if (speaking) {
      stopNarration();
      return;
    }
    const text = getActiveNarrationText();
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    utterance.pitch = 0.95;
    utterance.onend = stopNarration;
    utterance.onerror = stopNarration;
    speaking = true;
    audioButton.classList.add('is-speaking');
    audioButton.setAttribute('aria-pressed', 'true');
    audioButton.innerHTML = '<span aria-hidden="true">■</span> Stop';
    window.speechSynthesis.speak(utterance);
  }

  function applyConfig() {
    const nextLesson = document.getElementById('nextLessonLink');
    const welcome = document.getElementById('welcomeLink');
    if (nextLesson && config.nextLessonUrl) nextLesson.href = config.nextLessonUrl;
    if (welcome && config.welcomeUrl) welcome.href = config.welcomeUrl;

    const map = {
      socialYouTube: config.social?.youtube,
      socialFacebook: config.social?.facebook,
      socialInstagram: config.social?.instagram,
      socialTikTok: config.social?.tiktok,
      socialX: config.social?.x,
      socialEmail: config.social?.email,
      socialText: config.social?.text,
      socialCalendly: config.social?.calendly,
      socialStore: config.social?.store
    };
    Object.entries(map).forEach(([id, url]) => {
      const link = document.getElementById(id);
      if (link && url) link.href = url;
    });
  }

  document.querySelectorAll('.next-button').forEach((button) => button.addEventListener('click', goNext));
  document.querySelectorAll('.back-button').forEach((button) => button.addEventListener('click', goBack));
  restartButton.addEventListener('click', restartLesson);
  audioButton.addEventListener('click', toggleNarration);
  reflections.forEach((field) => field.addEventListener('input', saveState));

  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    if (event.key === 'ArrowRight') goNext();
    if (event.key === 'ArrowLeft') goBack();
  });

  document.getElementById('currentYear').textContent = new Date().getFullYear();
  applyConfig();
  loadState();
  updateScreen({ focus: false });
})();
