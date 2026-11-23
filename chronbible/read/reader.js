(() => {
  'use strict';

  const PLAN_URL = '/chronbible/data/readings.json';
  const PREF_KEY = 'chronbible-scripture-reader-settings-v1';
  const API_BASE = 'https://bible-api.com/';
  const FONTS = {
    'Arial': "Arial, Helvetica, sans-serif",
    'Times New Roman': "'Times New Roman', Times, serif",
    'Calibri': "Calibri, Carlito, Arial, sans-serif",
    'Georgia': "Georgia, 'Times New Roman', serif"
  };
  const DEFAULT_PREFS = { translation: 'web', theme: 'light', font: 'Georgia', size: 20 };

  const $ = (id) => document.getElementById(id);
  const elements = {
    menuBtn: $('reader-menu-button'), menu: $('reader-settings'), scrim: $('settings-scrim'),
    closeBtn: $('settings-close'), translationSwitch: $('translation-switch'),
    translationValue: $('translation-value'), versionDescription: $('version-description'),
    themeSwitch: $('theme-switch'), themeDescription: $('theme-description'), themeValue: $('theme-value'),
    fontPicker: $('reader-font'), fontSmaller: $('font-smaller'), fontLarger: $('font-larger'),
    sizeSlider: $('font-size-slider'), sizeValue: $('font-size-value'),
    headerReading: $('header-reading'), headerPassage: $('header-passage'),
    back: $('reader-back'), bibleGatewayLink: $('bible-gateway-link'),
    credit: $('translation-credit'),
    status: $('reader-status'), passages: $('reader-passages'),
    endnote: $('reader-endnote'), progress: $('reading-progress'),
    completeButton: $('complete-reading'), progressStatus: $('progress-status'),
    progressHelp: $('progress-help'), signIn: $('save-progress-signin'),
    previous: $('previous-reading'), next: $('next-reading')
  };

  let prefs = readPreferences();
  let plan = null;
  let reading = null;
  let db = null;
  let session = null;
  let completed = new Set();
  let savePending = false;
  let scriptureRequestId = 0;
  let scriptureAbort = null;
  const verseCache = new Map();

  function escapeHTML(text = '') {
    return String(text).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  function readPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      return {
        translation: saved.translation === 'kjv' ? 'kjv' : 'web',
        theme: saved.theme === 'dark' ? 'dark' : 'light',
        font: Object.prototype.hasOwnProperty.call(FONTS, saved.font) ? saved.font : 'Georgia',
        size: Math.max(16, Math.min(32, Number(saved.size) || 20))
      };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  function storePreferences() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
  }

  function applyPreferences({ loadScripture = false } = {}) {
    const isKJV = prefs.translation === 'kjv';
    const isDark = prefs.theme === 'dark';
    document.body.classList.toggle('reader-theme-dark', isDark);
    document.body.classList.toggle('reader-theme-light', !isDark);
    document.documentElement.style.setProperty('--scripture-font', FONTS[prefs.font]);
    document.documentElement.style.setProperty('--scripture-size', prefs.size + 'px');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#171418' : '#F8F5EC');

    elements.translationSwitch.setAttribute('aria-checked', String(isKJV));
    elements.translationSwitch.setAttribute('aria-label', isKJV ? 'Switch to World English Bible' : 'Switch to King James Version');
    elements.translationValue.textContent = isKJV ? 'KJV' : 'WEB';
    elements.versionDescription.textContent = isKJV ? 'King James Version' : 'World English Bible';

    elements.themeSwitch.setAttribute('aria-checked', String(isDark));
    elements.themeSwitch.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    elements.themeDescription.textContent = isDark ? 'Dark mode' : 'Light mode';
    elements.themeValue.textContent = isDark ? 'Dark' : 'Light';

    elements.fontPicker.value = prefs.font;
    elements.sizeSlider.value = String(prefs.size);
    elements.sizeValue.textContent = prefs.size + ' px';
    elements.fontSmaller.disabled = prefs.size <= 16;
    elements.fontLarger.disabled = prefs.size >= 32;

    if (reading) elements.bibleGatewayLink.href = escapeLinkReference(reading.bibleTasks.map((task) => task.label).join('; '));
    elements.credit.textContent = isKJV
      ? 'Scripture: King James Version (public domain in the United States).'
      : 'Scripture: World English Bible (public domain).';

    if (loadScripture && reading) void loadPassages();
  }

  function setMenu(open) {
    elements.menu.hidden = !open;
    elements.scrim.hidden = !open;
    elements.menuBtn.setAttribute('aria-expanded', String(open));
    elements.menuBtn.setAttribute('aria-label', open ? 'Close reading settings' : 'Open reading settings');
    if (open) elements.fontPicker.focus({ preventScroll: true });
    else elements.menuBtn.focus({ preventScroll: true });
  }

  function setupControls() {
    elements.menuBtn.addEventListener('click', () => setMenu(elements.menu.hidden));
    elements.closeBtn.addEventListener('click', () => setMenu(false));
    elements.scrim.addEventListener('click', () => setMenu(false));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !elements.menu.hidden) setMenu(false);
    });

    elements.translationSwitch.addEventListener('click', () => {
      prefs.translation = prefs.translation === 'web' ? 'kjv' : 'web';
      storePreferences();
      applyPreferences({ loadScripture: true });
    });

    elements.themeSwitch.addEventListener('click', () => {
      prefs.theme = prefs.theme === 'light' ? 'dark' : 'light';
      storePreferences();
      applyPreferences();
    });

    elements.fontPicker.addEventListener('change', () => {
      if (!Object.prototype.hasOwnProperty.call(FONTS, elements.fontPicker.value)) return;
      prefs.font = elements.fontPicker.value;
      storePreferences();
      applyPreferences();
    });

    function changeFontSize(size) {
      prefs.size = Math.max(16, Math.min(32, Number(size) || 20));
      storePreferences();
      applyPreferences();
    }

    elements.fontSmaller.addEventListener('click', () => changeFontSize(prefs.size - 1));
    elements.fontLarger.addEventListener('click', () => changeFontSize(prefs.size + 1));
    elements.sizeSlider.addEventListener('input', () => changeFontSize(elements.sizeSlider.value));

    elements.completeButton.addEventListener('click', async () => {
      if (!session || savePending || !reading) return;
      const indices = reading.bibleTasks.map((task) => task.progressIndex);
      const allChecked = indices.every((index) => completed.has(index));
      await saveProgress(indices.map((index) => ({ index, checked: !allChecked })));
    });

    elements.passages.addEventListener('change', async (event) => {
      const target = event.target;
      if (!target.matches('input[data-progress-index]') || !session || savePending) return;
      await saveProgress([{ index: Number(target.dataset.progressIndex), checked: target.checked }]);
    });

    elements.passages.addEventListener('click', (event) => {
      const retry = event.target.closest('[data-retry-task]');
      if (retry && reading) {
        const taskIndex = Number(retry.dataset.retryTask);
        void retryPassage(taskIndex);
      }
    });
  }

  function readingHref(number) {
    return '/chronbible/read/?reading=' + number;
  }

  function setReadingData() {
    const params = new URLSearchParams(location.search);
    const n = Number(params.get('reading') || 1);
    if (!Number.isInteger(n) || n < 1 || n > plan.readings.length) {
      throw new Error('Reading not found. Choose a reading from your journey.');
    }
    reading = plan.readings[n - 1];
    if (!reading || reading.number !== n || !Array.isArray(reading.bibleTasks)) {
      throw new Error('This reading could not be found in the guide.');
    }
    const shortReference = reading.reference.split(';')[0].trim();
    elements.headerReading.innerHTML = 'Reading <span>' + String(n).padStart(3, '0') + '</span>';
    elements.headerPassage.textContent = shortReference;
    elements.headerPassage.title = reading.reference;
    document.title = 'Reading ' + n + ': ' + reading.title + ' | ChronBible';
    elements.bibleGatewayLink.href = escapeLinkReference(reading.bibleTasks.map((task) => task.label).join('; '));
    elements.back.hidden = n <= 1;
    if (n > 1) elements.back.href = readingHref(n - 1);

    if (n > 1) {
      elements.previous.href = readingHref(n - 1);
      elements.previous.textContent = '← Reading ' + (n - 1);
      elements.previous.removeAttribute('aria-disabled');
    } else {
      elements.previous.setAttribute('aria-disabled', 'true');
      elements.previous.removeAttribute('href');
    }
    if (n < plan.readings.length) {
      elements.next.href = readingHref(n + 1);
      elements.next.textContent = 'Reading ' + (n + 1) + ' →';
      elements.next.removeAttribute('aria-disabled');
    } else {
      elements.next.setAttribute('aria-disabled', 'true');
      elements.next.removeAttribute('href');
    }
    elements.progress.hidden = false;
    elements.passages.innerHTML = reading.bibleTasks.map((task, idx) => {
      const label = escapeHTML(task.label);
      return '<article class="passage" id="passage-' + task.progressIndex + '" data-task-index="' + idx + '">' +
        '<div class="passage-top"><h2 class="passage-title">' + label + '</h2>' +
        '<span class="passage-status" id="task-status-' + idx + '">WEB</span></div>' +
        '<div class="chapter-verses" id="task-verses-' + idx + '" aria-label="Scripture text for ' + label + '">' +
        '<div class="passage-loading">Loading verses…</div></div>' +
        '<label class="passage-progress"><input type="checkbox" data-progress-index="' + task.progressIndex + '" disabled> Mark ' + label + ' complete</label>' +
        '</article>';
    }).join('');
    if (location.hash.startsWith('#passage-')) {
      requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
    }
  }

  function escapeLinkReference(ref) {
    return 'https://www.biblegateway.com/passage/?search=' + encodeURIComponent(ref) +
      '&version=' + (prefs.translation === 'kjv' ? 'KJV' : 'WEB');
  }

  function renderVerses(data, label) {
    if (!data || !Array.isArray(data.verses) || data.verses.length === 0) {
      throw new Error('No verse text was returned for ' + label + '.');
    }
    const verses = data.verses.filter((item) => Number.isInteger(Number(item.verse)) && typeof item.text === 'string');
    if (!verses.length) throw new Error('The Bible service returned no readable verses for ' + label + '.');

    let lastChapter = null;
    return verses.map((item) => {
      const chapter = Number(item.chapter);
      const book = item.book_name || '';
      const chapterKey = book + '/' + chapter;
      const heading = lastChapter !== null && chapterKey !== lastChapter
        ? '<strong class="chapter-number">' + escapeHTML(book) + ' ' + chapter + '</strong>' : '';
      lastChapter = chapterKey;
      const text = escapeHTML(item.text.replace(/\s+/g, ' ').trim());
      return heading + '<span class="verse"><sup aria-label="Verse ' + Number(item.verse) + '">' +
        Number(item.verse) + '</sup>' + text + '</span>';
    }).join('');
  }

  async function fetchScripture(task, translation, signal) {
    const cacheKey = translation + '|' + task.label;
    if (verseCache.has(cacheKey)) return verseCache.get(cacheKey);
    // The public bible-api.com service supplies verse-numbered WEB and KJV.
    // Single-chapter matching is forced to "indifferent" for Jude, Obadiah, etc.
    const url = API_BASE + encodeURIComponent(task.label) +
      '?translation=' + translation + '&single_chapter_book_matching=indifferent';
    // Retry temporary network / provider failures automatically. The individual
    // passage's Retry button remains available if every attempt fails.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
      try {
        const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
        if (!response.ok) {
          const failure = new Error('Bible service returned HTTP ' + response.status + '.');
          failure.retryable = response.status === 429 || response.status >= 500;
          throw failure;
        }
        const data = await response.json();
        if (!Array.isArray(data.verses) || !data.verses.length) {
          throw new Error(data.error || 'No verses returned.');
        }
        verseCache.set(cacheKey, data);
        return data;
      } catch (error) {
        if (error.name === 'AbortError' || signal?.aborted || error.retryable === false || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
      }
    }
  }

  function passageError(index, error) {
    const task = reading.bibleTasks[index];
    const target = $('task-verses-' + index);
    if (!target) return;
    target.innerHTML = '<div class="passage-error"><p>Unable to load this passage right now. ' +
      'Please check your connection and try again.</p>' +
      '<button type="button" data-retry-task="' + index + '">Retry passage</button>' +
      '<a target="_blank" rel="noopener noreferrer" href="' +
      escapeHTML(escapeLinkReference(task.label)) + '">Read externally ↗</a></div>';
    $('task-status-' + index).textContent = 'Unavailable';
    console.warn('ChronBible passage', task.label, error?.message || error);
  }

  async function retryPassage(index) {
    if (!reading || index < 0 || index >= reading.bibleTasks.length) return;
    const requestId = scriptureRequestId;
    const translation = prefs.translation;
    const task = reading.bibleTasks[index];
    $('task-verses-' + index).innerHTML = '<div class="passage-loading">Loading verses…</div>';
    try {
      const response = await fetchScripture(task, translation, scriptureAbort?.signal);
      if (requestId !== scriptureRequestId || translation !== prefs.translation) return;
      $('task-verses-' + index).innerHTML = renderVerses(response, task.label);
      $('task-status-' + index).textContent = translation.toUpperCase();
    } catch (error) {
      if (error.name !== 'AbortError' && requestId === scriptureRequestId) passageError(index, error);
    }
  }

  async function loadPassages() {
    if (!reading) return;
    if (scriptureAbort) scriptureAbort.abort();
    scriptureAbort = new AbortController();
    const requestId = ++scriptureRequestId;
    const translation = prefs.translation;
    elements.status.hidden = false;
    elements.status.textContent = 'Loading ' + (translation === 'web' ? 'World English Bible' : 'King James Version') + ' passages…';

    for (const [idx] of reading.bibleTasks.entries()) {
      const target = $('task-verses-' + idx);
      if (target) target.innerHTML = '<div class="passage-loading">Loading verses…</div>';
      $('task-status-' + idx).textContent = translation.toUpperCase();
    }
    elements.endnote.hidden = true;

    const tasks = reading.bibleTasks;
    let cursor = 0;
    let success = 0;
    let failed = 0;
    async function worker() {
      while (cursor < tasks.length) {
        const index = cursor++;
        const task = tasks[index];
        try {
          const data = await fetchScripture(task, translation, scriptureAbort.signal);
          if (requestId !== scriptureRequestId) return;
          $('task-verses-' + index).innerHTML = renderVerses(data, task.label);
          $('task-status-' + index).textContent = translation.toUpperCase();
          success++;
        } catch (error) {
          if (requestId !== scriptureRequestId || error.name === 'AbortError') return;
          passageError(index, error);
          failed++;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, worker));
    if (requestId !== scriptureRequestId) return;
    // Passage errors remain visible beside the affected verses with Retry and Bible Gateway links.
    // Do not show a duplicate error summary above the whole reading.
    elements.status.hidden = true;
    elements.status.textContent = '';
    elements.endnote.hidden = !success;
  }

  function updateProgressUI() {
    if (!reading) return;
    const indices = reading.bibleTasks.map((task) => task.progressIndex);
    const allComplete = indices.every((index) => completed.has(index));
    const checkedCount = indices.filter((index) => completed.has(index)).length;
    const active = Boolean(session) && !savePending;
    elements.passages.querySelectorAll('[data-progress-index]').forEach((input) => {
      const index = Number(input.dataset.progressIndex);
      input.checked = completed.has(index);
      input.disabled = !active;
    });
    elements.completeButton.disabled = !active;
    elements.completeButton.textContent = allComplete ? 'Mark reading incomplete' : 'Mark reading complete';
    elements.signIn.hidden = Boolean(session);
    elements.progressHelp.textContent = session
      ? checkedCount + ' of ' + indices.length + ' passages completed. Changes sync with your ChronBible account.'
      : 'Sign in through the ChronBible guide to save reading progress across devices.';
  }

  async function initProgress() {
    const config = window.TJM_CHRONBIBLE_CONFIG;
    if (!window.supabase?.createClient || !config) {
      elements.progressHelp.textContent = 'Sign in at the ChronBible guide to track progress.';
      updateProgressUI();
      return;
    }

    try {
      db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'implicit' }
      });
      const response = await db.auth.getSession();
      if (response.error) throw response.error;
      session = response.data.session;
      if (session) {
        const { data, error } = await db.from('reading_plan_progress')
          .select('completed_indices').eq('user_id', session.user.id)
          .eq('plan_id', config.planId).maybeSingle();
        if (error) throw error;
        completed = new Set((data?.completed_indices || []).map(Number).filter(Number.isInteger));
      }
    } catch (error) {
      console.warn('ChronBible reader progress:', error.message);
      elements.progressStatus.textContent = 'Could not load saved progress. You can still read Scripture.';
    }
    updateProgressUI();
  }

  async function saveProgress(changes) {
    if (!session || !db || !reading || savePending) return;
    savePending = true;
    const oldCompleted = new Set(completed);
    for (const change of changes) {
      if (change.checked) completed.add(change.index);
      else completed.delete(change.index);
    }
    elements.progressStatus.textContent = 'Saving…';
    updateProgressUI();

    try {
      const config = window.TJM_CHRONBIBLE_CONFIG;
      // Read the latest data before writing so changes made on other reading pages
      // are not overwritten by an old session snapshot.
      const { data: latest, error: fetchError } = await db.from('reading_plan_progress')
        .select('completed_indices').eq('user_id', session.user.id)
        .eq('plan_id', config.planId).maybeSingle();
      if (fetchError) throw fetchError;

      const merged = new Set((latest?.completed_indices || []).map(Number).filter(Number.isInteger));
      for (const change of changes) {
        if (change.checked) merged.add(change.index);
        else merged.delete(change.index);
      }
      const { error } = await db.from('reading_plan_progress').upsert({
        user_id: session.user.id,
        plan_id: config.planId,
        completed_indices: [...merged].sort((a, b) => a - b),
        last_index: reading.index,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,plan_id' });
      if (error) throw error;

      completed = merged;
      elements.progressStatus.textContent = 'Progress saved.';
    } catch (error) {
      completed = oldCompleted;
      elements.progressStatus.textContent = 'Unable to save progress. Please retry.';
      console.warn('ChronBible reader save:', error.message);
    } finally {
      savePending = false;
      updateProgressUI();
    }
  }

  async function init() {
    setupControls();
    applyPreferences();
    try {
      const res = await fetch(PLAN_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('The reading plan is unavailable (' + res.status + ').');
      plan = await res.json();
      if (plan.planId !== window.TJM_CHRONBIBLE_CONFIG?.planId ||
          !Array.isArray(plan.readings) || plan.readings.length !== 313) {
        throw new Error('The ChronBible reading plan could not be verified.');
      }
      setReadingData();
      await Promise.all([loadPassages(), initProgress()]);
    } catch (error) {
      elements.status.hidden = false;
      elements.status.textContent = error.message + ' Return to the ChronBible journey and try again.';
      console.warn(error);
    }
  }

  void init();
})();