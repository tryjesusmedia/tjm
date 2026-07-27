(() => {
  'use strict';

  const TOTAL_SCREENS = 8;
  const STORAGE_KEY = 'tryJesusMediaLesson1';
  const screens = Array.from(document.querySelectorAll('.lesson-screen'));
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');
  const progressTitle = document.getElementById('progressTitle');
  const stage = document.getElementById('lesson-stage');
  const restartButton = document.getElementById('restartLesson');
  const audioButton = document.getElementById('audioToggle');
  const toast = document.getElementById('toast');
  const reflection1 = document.getElementById('reflection1');
  const reflection2 = document.getElementById('reflection2');

  let currentScreen = 1;
  let speaking = false;

  const kingdomData = {
    babylon: {
      number: '01',
      label: 'HEAD OF GOLD',
      title: 'Babylon',
      text: 'Daniel told Nebuchadnezzar, “You are this head of gold.” Babylon was wealthy, powerful, and magnificent—but it would not last forever.',
      reference: 'Daniel 2:37–39'
    },
    medopersia: {
      number: '02',
      label: 'CHEST AND ARMS OF SILVER',
      title: 'Medo-Persia',
      text: 'The empire that followed Babylon was Medo-Persia. Cyrus captured Babylon in 539 BC, and Isaiah had identified Cyrus by name before the conquest.',
      reference: 'Daniel 2:39 · Isaiah 45:1–2'
    },
    greece: {
      number: '03',
      label: 'BELLY AND THIGHS OF BRONZE',
      title: 'Greece',
      text: 'Alexander’s Greek forces defeated the Persian Empire. The succession continued in the order Daniel described.',
      reference: 'Daniel 2:39'
    },
    rome: {
      number: '04',
      label: 'LEGS OF IRON',
      title: 'Rome',
      text: 'Daniel said the fourth kingdom would be strong like iron. Rome followed Greece and ruled during the life of Jesus.',
      reference: 'Daniel 2:40'
    },
    divided: {
      number: '05',
      label: 'FEET OF IRON AND CLAY',
      title: 'Divided Rome',
      text: 'Daniel did not describe a fifth empire replacing Rome. He said the kingdom would be divided, with strength and weakness existing side by side.',
      reference: 'Daniel 2:41–43'
    },
    stone: {
      number: '06',
      label: 'THE STONE',
      title: 'God’s Kingdom',
      text: 'The stone destroyed the statue and became a mountain that filled the earth. Daniel described a kingdom established by God that would never be destroyed.',
      reference: 'Daniel 2:34–35, 44–45'
    }
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      currentScreen = Number(saved.currentScreen) || 1;
      if (currentScreen < 1 || currentScreen > TOTAL_SCREENS) currentScreen = 1;
      reflection1.value = saved.reflection1 || '';
      reflection2.value = saved.reflection2 || '';
    } catch {
      currentScreen = 1;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentScreen,
        reflection1: reflection1.value,
        reflection2: reflection2.value
      }));
    } catch {
      // Local storage may be unavailable in private browsing contexts.
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
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
    if (focus) {
      window.setTimeout(() => stage.focus({ preventScroll: true }), 200);
    }

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
    const confirmed = window.confirm('Restart this lesson and clear your saved reflections?');
    if (!confirmed) return;

    currentScreen = 1;
    reflection1.value = '';
    reflection2.value = '';
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    updateScreen();
    showToast('Lesson restarted');
  }

  function getActiveNarrationText() {
    const activeScreen = screens[currentScreen - 1];
    const clone = activeScreen.cloneNode(true);
    clone.querySelectorAll('button, summary, textarea, .navigation-row, .microcopy, .privacy-note').forEach((node) => node.remove());
    return clone.innerText.replace(/\s+/g, ' ').trim();
  }

  function stopNarration() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    speaking = false;
    audioButton.classList.remove('is-speaking');
    audioButton.setAttribute('aria-pressed', 'false');
    audioButton.innerHTML = '<span aria-hidden="true">▶</span> Listen';
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

  function updateKingdomCard(key, button) {
    const data = kingdomData[key];
    if (!data) return;

    document.querySelectorAll('[data-kingdom]').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });

    const card = document.getElementById('kingdomCard');
    card.innerHTML = `
      <span class="kingdom-number">${data.number}</span>
      <small>${data.label}</small>
      <h3>${data.title}</h3>
      <p>${data.text}</p>
      <span class="reference">${data.reference}</span>
    `;
  }

  document.querySelectorAll('.next-button').forEach((button) => button.addEventListener('click', goNext));
  document.querySelectorAll('.back-button').forEach((button) => button.addEventListener('click', goBack));
  document.querySelectorAll('[data-kingdom]').forEach((button) => {
    button.addEventListener('click', () => updateKingdomCard(button.dataset.kingdom, button));
  });

  restartButton.addEventListener('click', restartLesson);
  audioButton.addEventListener('click', toggleNarration);
  reflection1.addEventListener('input', saveState);
  reflection2.addEventListener('input', saveState);

  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isTyping = tag === 'textarea' || tag === 'input';
    if (isTyping) return;

    if (event.key === 'ArrowRight') goNext();
    if (event.key === 'ArrowLeft') goBack();
  });

  document.getElementById('currentYear').textContent = new Date().getFullYear();
  loadState();
  updateScreen({ focus: false });
})();
