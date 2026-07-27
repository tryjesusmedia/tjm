(() => {
  'use strict';

  const TOTAL_SCREENS = 8;
  const STORAGE_KEY = 'tryJesusMediaLesson3';
  const config = window.TJM_CONFIG || {};
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
  const reflection3 = document.getElementById('reflection3');
  const countdown = document.getElementById('discussionCountdown');

  let currentScreen = 1;
  let speaking = false;
  let countdownTimer = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      currentScreen = Number(saved.currentScreen) || 1;
      if (currentScreen < 1 || currentScreen > TOTAL_SCREENS) currentScreen = 1;
      reflection1.value = saved.reflection1 || '';
      reflection2.value = saved.reflection2 || '';
      reflection3.value = saved.reflection3 || '';
    } catch {
      currentScreen = 1;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentScreen,
        reflection1: reflection1.value,
        reflection2: reflection2.value,
        reflection3: reflection3.value
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
    if (focus) window.setTimeout(() => stage.focus({ preventScroll: true }), 200);
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
    reflection3.value = '';
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    updateScreen();
    showToast('Lesson restarted');
  }

  function getActiveNarrationText() {
    const activeScreen = screens[currentScreen - 1];
    const clone = activeScreen.cloneNode(true);
    clone.querySelectorAll('button, summary, textarea, .navigation-row, .microcopy, .privacy-note, .source-grid, .social-links').forEach((node) => node.remove());
    return clone.innerText.replace(/\s+/g, ' ').trim();
  }

  function stopNarration() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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

  function applyConfig() {
    const zoomLink = document.getElementById('zoomJoinLink');
    const zoomNote = document.getElementById('zoomJoinNote');
    const zoomUrl = config.zoomUrl || 'https://zoombiblestudy.com/';
    zoomLink.href = zoomUrl;
    if (/zoom\.us|zoomgov\.com/i.test(zoomUrl)) {
      zoomLink.innerHTML = '<span aria-hidden="true">↗</span> Enter the Live Zoom Call';
      zoomNote.textContent = 'This button opens the Zoom meeting in a new tab.';
    }

    const socialMap = {
      socialYouTube: config.social?.youtube,
      socialFacebook: config.social?.facebook,
      socialInstagram: config.social?.instagram,
      socialTikTok: config.social?.tiktok,
      socialX: config.social?.x
    };
    Object.entries(socialMap).forEach(([id, url]) => {
      const link = document.getElementById(id);
      if (link && url) link.href = url;
    });
  }

  function getZoneParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      weekday: 'short'
    }).formatToParts(date);
    return Object.fromEntries(parts.map((part) => [part.type, part.value]));
  }

  function getTimeZoneOffsetMs(date, timeZone) {
    const p = getZoneParts(date, timeZone);
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    return asUtc - date.getTime();
  }

  function zonedLocalToUtc(year, month, day, hour, minute, timeZone) {
    let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    for (let i = 0; i < 3; i += 1) {
      const offset = getTimeZoneOffsetMs(guess, timeZone);
      guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - offset);
    }
    return guess;
  }

  function nextDiscussionDate(now = new Date()) {
    const timeZone = 'America/New_York';
    const p = getZoneParts(now, timeZone);
    const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
    const targetDay = Number(config.discussionDay ?? 4);
    const targetHour = Number(config.discussionHourEastern ?? 20);
    const targetMinute = Number(config.discussionMinuteEastern ?? 0);
    let daysAhead = (targetDay - weekdayIndex + 7) % 7;

    const currentMinutes = Number(p.hour) * 60 + Number(p.minute);
    const targetMinutes = targetHour * 60 + targetMinute;
    if (daysAhead === 0 && currentMinutes >= targetMinutes) daysAhead = 7;

    const localBase = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
    localBase.setUTCDate(localBase.getUTCDate() + daysAhead);
    return zonedLocalToUtc(
      localBase.getUTCFullYear(),
      localBase.getUTCMonth() + 1,
      localBase.getUTCDate(),
      targetHour,
      targetMinute,
      timeZone
    );
  }

  function updateCountdown() {
    if (!countdown) return;
    const now = new Date();
    const target = nextDiscussionDate(now);
    const diff = Math.max(0, target.getTime() - now.getTime());
    const totalMinutes = Math.floor(diff / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (diff < 90 * 60000 && now <= target) {
      countdown.textContent = `The live discussion begins in ${hours}h ${minutes}m.`;
    } else if (days > 0) {
      countdown.textContent = `Next discussion: ${days}d ${hours}h ${minutes}m from now.`;
    } else {
      countdown.textContent = `Next discussion: ${hours}h ${minutes}m from now.`;
    }
  }

  document.querySelectorAll('.next-button').forEach((button) => button.addEventListener('click', goNext));
  document.querySelectorAll('.back-button').forEach((button) => button.addEventListener('click', goBack));
  restartButton.addEventListener('click', restartLesson);
  audioButton.addEventListener('click', toggleNarration);
  [reflection1, reflection2, reflection3].forEach((field) => field.addEventListener('input', saveState));

  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    if (event.key === 'ArrowRight') goNext();
    if (event.key === 'ArrowLeft') goBack();
  });

  document.getElementById('currentYear').textContent = new Date().getFullYear();
  applyConfig();
  updateCountdown();
  countdownTimer = window.setInterval(updateCountdown, 60000);
  window.addEventListener('beforeunload', () => window.clearInterval(countdownTimer));
  loadState();
  updateScreen({ focus: false });
})();
