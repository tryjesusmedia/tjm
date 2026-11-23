(() => {
  'use strict';

  const PLAN_URL = '/chronbible/data/readings.json';
  const PREF_KEY = 'chronbible-scripture-reader-settings-v1';
  // Both complete 66-book Bible texts are versioned alongside this application.
  // No third-party Bible API or key is needed to display Scripture.
  const BIBLE_DATA_ROOT = '/chronbible/read/text/';
  const BIBLE_CACHE_NAME = 'chronbible-bibles-v1';
  const BOOK_CODES = Object.freeze({
    "Genesis": "Gen",
    "Exodus": "Exod",
    "Leviticus": "Lev",
    "Numbers": "Num",
    "Deuteronomy": "Deut",
    "Joshua": "Josh",
    "Judges": "Judg",
    "Ruth": "Ruth",
    "1 Samuel": "1Sam",
    "2 Samuel": "2Sam",
    "1 Kings": "1Kgs",
    "2 Kings": "2Kgs",
    "1 Chronicles": "1Chr",
    "2 Chronicles": "2Chr",
    "Ezra": "Ezra",
    "Nehemiah": "Neh",
    "Esther": "Esth",
    "Job": "Job",
    "Psalm": "Ps",
    "Psalms": "Ps",
    "Proverbs": "Prov",
    "Ecclesiastes": "Eccl",
    "Song of Solomon": "Song",
    "Isaiah": "Isa",
    "Jeremiah": "Jer",
    "Lamentations": "Lam",
    "Ezekiel": "Ezek",
    "Daniel": "Dan",
    "Hosea": "Hos",
    "Joel": "Joel",
    "Amos": "Amos",
    "Obadiah": "Obad",
    "Jonah": "Jonah",
    "Micah": "Mic",
    "Nahum": "Nah",
    "Habakkuk": "Hab",
    "Zephaniah": "Zeph",
    "Haggai": "Hag",
    "Zechariah": "Zech",
    "Malachi": "Mal",
    "Matthew": "Matt",
    "Mark": "Mark",
    "Luke": "Luke",
    "John": "John",
    "Acts": "Acts",
    "Romans": "Rom",
    "1 Corinthians": "1Cor",
    "2 Corinthians": "2Cor",
    "Galatians": "Gal",
    "Ephesians": "Eph",
    "Philippians": "Phil",
    "Colossians": "Col",
    "1 Thessalonians": "1Thess",
    "2 Thessalonians": "2Thess",
    "1 Timothy": "1Tim",
    "2 Timothy": "2Tim",
    "Titus": "Titus",
    "Philemon": "Phlm",
    "Hebrews": "Heb",
    "James": "Jas",
    "1 Peter": "1Pet",
    "2 Peter": "2Pet",
    "1 John": "1John",
    "2 John": "2John",
    "3 John": "3John",
    "Jude": "Jude",
    "Revelation": "Rev"
  });
  const BOOK_LIST = Object.freeze(["Gen","Exod","Lev","Num","Deut","Josh","Judg","Ruth","1Sam","2Sam","1Kgs","2Kgs","1Chr","2Chr","Ezra","Neh","Esth","Job","Ps","Prov","Eccl","Song","Isa","Jer","Lam","Ezek","Dan","Hos","Joel","Amos","Obad","Jonah","Mic","Nah","Hab","Zeph","Hag","Zech","Mal","Matt","Mark","Luke","John","Acts","Rom","1Cor","2Cor","Gal","Eph","Phil","Col","1Thess","2Thess","1Tim","2Tim","Titus","Phlm","Heb","Jas","1Pet","2Pet","1John","2John","3John","Jude","Rev"]);
  // Prefer the requested local font. Use a visually faithful hosted substitute
  // on Android and other devices where Microsoft fonts are not installed.
  const FONTS = {
    'Arial': "Arial, Arimo, Helvetica, sans-serif",
    'Times New Roman': "'Times New Roman', Tinos, Times, serif",
    'Calibri': "Calibri, Carlito, Arial, sans-serif",
    'Georgia': "Georgia, Gelasio, serif"
  };
  const DEFAULT_PREFS = { translation: 'web', theme: 'light', font: 'Georgia', size: 20 };

  const $ = (id) => document.getElementById(id);
  const elements = {
    menuBtn: $('reader-menu-button'), menu: $('reader-settings'), scrim: $('settings-scrim'),
    closeBtn: $('settings-close'), translationSwitch: $('translation-switch'),
    translationValue: $('translation-value'), translationLeft: $('translation-left'),
    versionDescription: $('version-description'),
    themeSwitch: $('theme-switch'), themeDescription: $('theme-description'),
    themeValue: $('theme-value'), themeLeft: $('theme-left'),
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
  let activeTasks = [];
  let singlePassage = false;
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

    // Two equal choices, without on/off colors or semantics.
    elements.translationSwitch.dataset.position = isKJV ? 'left' : 'right';
    elements.translationSwitch.setAttribute('aria-label',
      isKJV ? 'KJV selected. Tap to switch to WEB' : 'WEB selected. Tap to switch to KJV');
    elements.translationLeft.classList.toggle('is-selected', isKJV);
    elements.translationValue.classList.toggle('is-selected', !isKJV);
    elements.versionDescription.textContent = isKJV ? 'King James Version' : 'World English Bible';

    elements.themeSwitch.dataset.position = isDark ? 'left' : 'right';
    elements.themeSwitch.setAttribute('aria-label',
      isDark ? 'Dark selected. Tap to switch to Light' : 'Light selected. Tap to switch to Dark');
    elements.themeLeft.classList.toggle('is-selected', isDark);
    elements.themeValue.classList.toggle('is-selected', !isDark);
    elements.themeDescription.textContent = isDark ? 'Dark mode' : 'Light mode';

    elements.fontPicker.value = prefs.font;
    elements.sizeSlider.value = String(prefs.size);
    elements.sizeValue.textContent = prefs.size + ' px';
    elements.fontSmaller.disabled = prefs.size <= 16;
    elements.fontLarger.disabled = prefs.size >= 32;

    // Always open ONE selected passage in Bible Gateway, also after switching versions.
    if (reading && activeTasks.length) {
      elements.bibleGatewayLink.href = escapeLinkReference(activeTasks[0].label);
    }
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
    document.getElementById('download-offline-bibles')?.addEventListener('click', () => void downloadBothBiblesForOffline());
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
    // Chapter/passage links include the unique progressIndex. Show only that passage.
    // A full-reading URL without this parameter retains the legacy multi-passage view.
    const passageParam = params.get('passage');
    singlePassage = passageParam !== null;
    if (singlePassage) {
      if (!/^\d+$/.test(passageParam)) throw new Error('Invalid Scripture passage link.');
      const progressIndex = Number(passageParam);
      const task = reading.bibleTasks.find((item) => item.progressIndex === progressIndex);
      if (!task) throw new Error('This passage is not part of the selected ChronBible reading.');
      activeTasks = [task];
      document.body.classList.add('single-passage');
      try {
        sessionStorage.setItem('tjm-chronbible-last-scripture-page-v1',
          window.location.pathname + window.location.search);
      } catch {}
    } else {
      activeTasks = reading.bibleTasks;
      document.body.classList.remove('single-passage');
    }
    const shortReference = reading.reference.split(';')[0].trim();
    elements.headerReading.innerHTML = 'Reading <span>' + String(n).padStart(3, '0') + '</span>';
    elements.headerPassage.textContent = singlePassage ? activeTasks[0].label : shortReference;
    elements.headerPassage.title = singlePassage ? activeTasks[0].label : reading.reference;
    document.title = singlePassage
      ? activeTasks[0].label + ' | ChronBible'
      : 'Reading ' + n + ': ' + reading.title + ' | ChronBible';
    elements.bibleGatewayLink.href = escapeLinkReference(activeTasks[0].label);
    elements.bibleGatewayLink.textContent = 'Read ' + activeTasks[0].label + ' on Bible Gateway ↗';
    elements.back.hidden = !singlePassage && n <= 1;
    elements.back.href = singlePassage ? '/chronbible/?reading=' + n : readingHref(n - 1);
    elements.back.setAttribute('aria-label', singlePassage
      ? 'Back to reading ' + n + ' overview' : 'Previous ChronBible reading');
    elements.back.title = singlePassage ? 'Back to reading overview' : 'Previous reading';

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
    elements.progress.hidden = singlePassage;
    elements.passages.innerHTML = activeTasks.map((task, idx) => {
      const label = escapeHTML(task.label);
      return '<article class="passage" id="passage-' + task.progressIndex + '" data-task-index="' + idx + '">' +
        '<div class="passage-top"><h2 class="passage-title">' + label + '</h2>' +
        '<span class="passage-status" id="task-status-' + idx + '">WEB</span></div>' +
        '<div class="chapter-verses" id="task-verses-' + idx + '" aria-label="Scripture text for ' + label + '">' +
        '<div class="passage-loading">Loading verses…</div></div>' +
        (singlePassage ? '' : '<label class="passage-progress"><input type="checkbox" data-progress-index="' + task.progressIndex + '" disabled> Mark ' + label + ' complete</label>') +
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

  const bookCache = new Map();
  const pendingBooks = new Map();

  function parsePassage(label) {
    const match = /^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(String(label).trim());
    if (!match) throw new Error('Unsupported Scripture reference: ' + label);
    const book = BOOK_CODES[match[1]];
    if (!book) throw new Error('Unrecognized Bible book: ' + match[1]);
    const chapter = Number(match[2]);
    const start = match[3] ? Number(match[3]) : null;
    const end = match[4] ? Number(match[4]) : start;
    if (!Number.isInteger(chapter) || chapter < 1 || (start !== null && (!Number.isInteger(start) || start < 1 || !Number.isInteger(end) || end < start))) {
      throw new Error('Invalid Scripture reference: ' + label);
    }
    return { book, chapter, start, end, label };
  }

  function bookPath(version, book) {
    return BIBLE_DATA_ROOT + version + '/' + book + '.json';
  }

  async function getLocalBook(version, book, signal) {
    const id = version + '/' + book;
    if (bookCache.has(id)) return bookCache.get(id);
    if (pendingBooks.has(id)) return pendingBooks.get(id);

    const url = bookPath(version, book);
    const pending = (async () => {
      // Prefer our own checked-in files. Cache Storage also lets previously
      // downloaded books remain readable when the connection is interrupted.
      let response;
      try {
        response = await fetch(url, { signal, cache: 'force-cache' });
        if (!response.ok) throw new Error('Local Bible file returned HTTP ' + response.status);
      } catch (error) {
        if (signal?.aborted) throw error;
        if ('caches' in window) {
          try {
            response = await (await caches.open(BIBLE_CACHE_NAME)).match(url);
          } catch {}
        }
        if (!response) throw new Error('This Bible book is not available offline yet. Connect once to save it.');
      }

      const data = await response.json();
      if (data.version !== version || data.book !== book || !Array.isArray(data.chapters) || data.chapters.length === 0) {
        throw new Error('The locally stored Bible file did not pass its integrity check.');
      }
      bookCache.set(id, data);
      if ('caches' in window) {
        // An optional secondary cache protects books even when the service
        // worker is unavailable, and is shared with the offline-download button.
        try {
          const cache = await caches.open(BIBLE_CACHE_NAME);
          await cache.put(url, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
        } catch {}
      }
      return data;
    })();
    pendingBooks.set(id, pending);
    try { return await pending; }
    finally { pendingBooks.delete(id); }
  }

  async function fetchScripture(task, translation, signal) {
    const cacheKey = translation + '|' + task.label;
    if (verseCache.has(cacheKey)) return verseCache.get(cacheKey);
    const ref = parsePassage(task.label);
    const book = await getLocalBook(translation, ref.book, signal);
    const chapter = book.chapters[ref.chapter - 1];
    if (!chapter || chapter.chapter !== ref.chapter || !Array.isArray(chapter.verses)) {
      throw new Error('Chapter missing from stored Bible: ' + task.label);
    }
    const verses = chapter.verses.filter(verse =>
      typeof verse.text === 'string' && Number.isInteger(verse.number) &&
      (ref.start === null || (verse.number >= ref.start && verse.number <= ref.end))
    ).map(verse => ({
      book_name: book.englishName || task.label,
      chapter: ref.chapter,
      verse: verse.number,
      text: verse.text
    }));
    if (!verses.length) throw new Error('No verses found in stored Bible for ' + task.label);
    // When referencing a specific verse, fail visibly rather than silently
    // substituting an incorrect verse from the translation.
    if (ref.start !== null &&
        (!verses.some(v => v.verse === ref.start) || !verses.some(v => v.verse === ref.end))) {
      throw new Error('The selected translation does not contain the requested numbered verse(s): ' + task.label);
    }
    const data = { reference: task.label, translation_id: translation, verses };
    verseCache.set(cacheKey, data);
    return data;
  }

  async function downloadBothBiblesForOffline() {
    const button = document.getElementById('download-offline-bibles');
    const status = document.getElementById('offline-bible-status');
    if (!button || !status || !('caches' in window)) {
      if (status) status.textContent = 'Offline downloads are unavailable in this browser.';
      return;
    }
    button.disabled = true;
    const urls = ['web', 'kjv'].flatMap(version => BOOK_LIST.map(book => bookPath(version, book)));
    const cache = await caches.open(BIBLE_CACHE_NAME);
    let completed = 0;
    let failed = 0;
    let cursor = 0;
    status.textContent = 'Saving both Bibles: 0 / ' + urls.length + ' books';
    async function worker() {
      while (cursor < urls.length) {
        const url = urls[cursor++];
        try {
          let file = await cache.match(url);
          if (!file) {
            const response = await fetch(url, { cache: 'force-cache' });
            if (!response.ok) throw new Error('Bible file failed (' + response.status + ')');
            const data = await response.clone().json();
            if (!['web', 'kjv'].includes(data.version) || !Array.isArray(data.chapters) || !data.chapters.length) {
              throw new Error('Invalid Bible download');
            }
            await cache.put(url, response);
          }
        } catch (error) {
          failed++;
          console.warn('Offline Scripture download', url, error.message);
        } finally {
          completed++;
          status.textContent = 'Saving both Bibles: ' + completed + ' / ' + urls.length + ' books';
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: 4 }, worker));
      status.textContent = failed
        ? (completed - failed) + ' books saved; ' + failed + ' could not download. Tap again to retry.'
        : 'Both complete Bibles saved for offline reading on this device.';
    } catch {
      status.textContent = 'Unable to finish offline download. Try again when connected.';
    } finally {
      button.disabled = false;
    }
  }

  function passageError(index, error) {
    const task = activeTasks[index];
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
    if (!reading || index < 0 || index >= activeTasks.length) return;
    const requestId = scriptureRequestId;
    const translation = prefs.translation;
    const task = activeTasks[index];
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

    for (const [idx] of activeTasks.entries()) {
      const target = $('task-verses-' + idx);
      if (target) target.innerHTML = '<div class="passage-loading">Loading verses…</div>';
      $('task-status-' + idx).textContent = translation.toUpperCase();
    }
    elements.endnote.hidden = true;

    const tasks = activeTasks;
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
    elements.endnote.hidden = singlePassage || !success;
  }

  function updateProgressUI() {
    if (!reading || singlePassage) return;
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

    // Older multi-chapter reader links should show the chapter-button overview,
    // never load every passage directly and bypass the reading choices.
    const entry = new URLSearchParams(location.search);
    if (!entry.has('passage')) {
      const raw = entry.get('reading');
      const number = raw && /^\d+$/.test(raw) ? Number(raw) : null;
      const overview = '/chronbible/' + (number && number >= 1 && number <= 313
        ? '?reading=' + number : '');
      window.location.replace(overview);
      return;
    }
    try {
      const res = await fetch(PLAN_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('The reading plan is unavailable (' + res.status + ').');
      plan = await res.json();
      if (plan.planId !== window.TJM_CHRONBIBLE_CONFIG?.planId ||
          !Array.isArray(plan.readings) || plan.readings.length !== 313) {
        throw new Error('The ChronBible reading plan could not be verified.');
      }
      setReadingData();
      if (singlePassage) await loadPassages();
      else await Promise.all([loadPassages(), initProgress()]);
    } catch (error) {
      elements.status.hidden = false;
      elements.status.textContent = error.message + ' Return to the ChronBible journey and try again.';
      console.warn(error);
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/chronbible/sw.js', {
      scope: '/chronbible/', updateViaCache: 'none'
    }).catch(error => console.warn('ChronBible offline setup:', error.message));
  }

  void init();
})();