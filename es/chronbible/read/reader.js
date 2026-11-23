(() => {
  'use strict';

  const PLAN_URL = '/es/chronbible/data/readings.json';
  const PREF_KEY = 'chronbible-es-scripture-reader-settings-v1';
  // Both complete 66-book Bible texts are versioned alongside this application.
  // No third-party Bible API or key is needed to display Scripture.
  const BIBLE_DATA_ROOT = '/es/chronbible/read/text/';
  const BIBLE_CACHE_NAME = 'chronbible-es-bibles-v1';
  const BOOK_CODES = Object.freeze({
    "Génesis": "Gen",
    "Éxodo": "Exod",
    "Levítico": "Lev",
    "Números": "Num",
    "Deuteronomio": "Deut",
    "Josué": "Josh",
    "Jueces": "Judg",
    "Rut": "Ruth",
    "1 Samuel": "1Sam",
    "2 Samuel": "2Sam",
    "1 Reyes": "1Kgs",
    "2 Reyes": "2Kgs",
    "1 Crónicas": "1Chr",
    "2 Crónicas": "2Chr",
    "Esdras": "Ezra",
    "Nehemías": "Neh",
    "Ester": "Esth",
    "Job": "Job",
    "Salmo": "Ps",
    "Salmos": "Ps",
    "Proverbios": "Prov",
    "Eclesiastés": "Eccl",
    "Cantar de los Cantares": "Song",
    "Isaías": "Isa",
    "Jeremías": "Jer",
    "Lamentaciones": "Lam",
    "Ezequiel": "Ezek",
    "Daniel": "Dan",
    "Oseas": "Hos",
    "Joel": "Joel",
    "Amós": "Amos",
    "Abdías": "Obad",
    "Jonás": "Jonah",
    "Miqueas": "Mic",
    "Nahúm": "Nah",
    "Habacuc": "Hab",
    "Sofonías": "Zeph",
    "Hageo": "Hag",
    "Zacarías": "Zech",
    "Malaquías": "Mal",
    "Mateo": "Matt",
    "Marcos": "Mark",
    "Lucas": "Luke",
    "Juan": "John",
    "Hechos": "Acts",
    "Romanos": "Rom",
    "1 Corintios": "1Cor",
    "2 Corintios": "2Cor",
    "Gálatas": "Gal",
    "Efesios": "Eph",
    "Filipenses": "Phil",
    "Colosenses": "Col",
    "1 Tesalonicenses": "1Thess",
    "2 Tesalonicenses": "2Thess",
    "1 Timoteo": "1Tim",
    "2 Timoteo": "2Tim",
    "Tito": "Titus",
    "Filemón": "Phlm",
    "Hebreos": "Heb",
    "Santiago": "Jas",
    "1 Pedro": "1Pet",
    "2 Pedro": "2Pet",
    "1 Juan": "1John",
    "2 Juan": "2John",
    "3 Juan": "3John",
    "Judas": "Jude",
    "Apocalipsis": "Rev"
  });
  const BOOK_LIST = Object.freeze(["Gen","Exod","Lev","Num","Deut","Josh","Judg","Ruth","1Sam","2Sam","1Kgs","2Kgs","1Chr","2Chr","Ezra","Neh","Esth","Job","Ps","Prov","Eccl","Song","Isa","Jer","Lam","Ezek","Dan","Hos","Joel","Amos","Obad","Jonah","Mic","Nah","Hab","Zeph","Hag","Zech","Mal","Matt","Mark","Luke","John","Acts","Rom","1Cor","2Cor","Gal","Eph","Phil","Col","1Thess","2Thess","1Tim","2Tim","Titus","Phlm","Heb","Jas","1Pet","2Pet","1John","2John","3John","Jude","Rev"]);
  const EBIBLE_BOOK_CODES = Object.freeze(["GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI","1CH","2CH","EZR","NEH","EST","JOB","PSA","PRO","ECC","SNG","ISA","JER","LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP","HAG","ZEC","MAL","MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL","EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAS","1PE","2PE","1JN","2JN","3JN","JUD","REV"]);
  // Prefer the requested local font. Use a visually faithful hosted substitute
  // on Android and other devices where Microsoft fonts are not installed.
  const FONTS = {
    'Arial': "Arial, Arimo, Helvetica, sans-serif",
    'Times New Roman': "'Times New Roman', Tinos, Times, serif",
    'Calibri': "Calibri, Carlito, Arial, sans-serif",
    'Georgia': "Georgia, Gelasio, serif"
  };
  const DEFAULT_PREFS = { translation: 'bes', theme: 'light', font: 'Georgia', size: 20 };

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
        translation: saved.translation === 'rv1909' ? 'rv1909' : 'bes',
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
    const isRV = prefs.translation === 'rv1909';
    const isDark = prefs.theme === 'dark';
    document.body.classList.toggle('reader-theme-dark', isDark);
    document.body.classList.toggle('reader-theme-light', !isDark);
    document.documentElement.style.setProperty('--scripture-font', FONTS[prefs.font]);
    document.documentElement.style.setProperty('--scripture-size', prefs.size + 'px');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#171418' : '#F8F5EC');

    // Two equal choices, without on/off colors or semantics.
    elements.translationSwitch.dataset.position = isRV ? 'left' : 'right';
    elements.translationSwitch.setAttribute('aria-label',
      isRV ? 'RV1909 seleccionada. Cambiar a BES' : 'BES seleccionada. Cambiar a RV1909');
    elements.translationLeft.classList.toggle('is-selected', isRV);
    elements.translationValue.classList.toggle('is-selected', !isRV);
    elements.versionDescription.textContent = isRV ? 'Reina-Valera 1909' : 'Biblia en Español Sencillo 2026';

    elements.themeSwitch.dataset.position = isDark ? 'left' : 'right';
    elements.themeSwitch.setAttribute('aria-label',
      isDark ? 'Modo oscuro seleccionado. Cambiar a claro' : 'Modo claro seleccionado. Cambiar a oscuro');
    elements.themeLeft.classList.toggle('is-selected', isDark);
    elements.themeValue.classList.toggle('is-selected', !isDark);
    elements.themeDescription.textContent = isDark ? 'Modo oscuro' : 'Modo claro';

    elements.fontPicker.value = prefs.font;
    elements.sizeSlider.value = String(prefs.size);
    elements.sizeValue.textContent = prefs.size + ' px';
    elements.fontSmaller.disabled = prefs.size <= 16;
    elements.fontLarger.disabled = prefs.size >= 32;

    // Abrir la misma referencia bíblica en la edición oficial de eBible.org.
    if (reading && activeTasks.length) {
      elements.bibleGatewayLink.href = escapeLinkReference(activeTasks[0].label);
    }
    elements.credit.textContent = isRV
      ? 'Texto bíblico: Reina-Valera 1909 (dominio público).'
      : 'Texto bíblico: Biblia en Español Sencillo 2026 (dominio público).';

    if (loadScripture && reading) void loadPassages();
  }

  function setMenu(open) {
    elements.menu.hidden = !open;
    elements.scrim.hidden = !open;
    elements.menuBtn.setAttribute('aria-expanded', String(open));
    elements.menuBtn.setAttribute('aria-label', open ? 'Cerrar opciones de lectura' : 'Abrir opciones de lectura');
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
      prefs.translation = prefs.translation === 'bes' ? 'rv1909' : 'bes';
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
    return '/es/chronbible/read/?reading=' + number;
  }

  function setReadingData() {
    const params = new URLSearchParams(location.search);
    const n = Number(params.get('reading') || 1);
    if (!Number.isInteger(n) || n < 1 || n > plan.readings.length) {
      throw new Error('Lectura no encontrada. Elige una lectura del recorrido.');
    }
    reading = plan.readings[n - 1];
    if (!reading || reading.number !== n || !Array.isArray(reading.bibleTasks)) {
      throw new Error('No encontramos esta lectura en la guía.');
    }
    // Chapter/passage links include the unique progressIndex. Show only that passage.
    // A full-reading URL without this parameter retains the legacy multi-passage view.
    const passageParam = params.get('passage');
    singlePassage = passageParam !== null;
    if (singlePassage) {
      if (!/^\d+$/.test(passageParam)) throw new Error('Enlace al pasaje bíblico no válido.');
      const progressIndex = Number(passageParam);
      const task = reading.bibleTasks.find((item) => item.progressIndex === progressIndex);
      if (!task) throw new Error('Este pasaje no forma parte de esta lectura de ChronBible.');
      activeTasks = [task];
      document.body.classList.add('single-passage');
      try {
        sessionStorage.setItem('tjm-chronbible-es-last-scripture-page-v1',
          window.location.pathname + window.location.search);
      } catch {}
    } else {
      activeTasks = reading.bibleTasks;
      document.body.classList.remove('single-passage');
    }
    const shortReference = reading.reference.split(';')[0].trim();
    elements.headerReading.innerHTML = 'Lectura <span>' + String(n).padStart(3, '0') + '</span>';
    elements.headerPassage.textContent = singlePassage ? activeTasks[0].label : shortReference;
    elements.headerPassage.title = singlePassage ? activeTasks[0].label : reading.reference;
    document.title = singlePassage
      ? activeTasks[0].label + ' | ChronBible'
      : 'Lectura ' + n + ': ' + reading.title + ' | ChronBible';
    elements.bibleGatewayLink.href = escapeLinkReference(activeTasks[0].label);
    elements.bibleGatewayLink.textContent = 'Leer ' + activeTasks[0].label + ' en eBible.org ↗';
    elements.back.hidden = !singlePassage && n <= 1;
    elements.back.href = singlePassage ? '/es/chronbible/?reading=' + n : readingHref(n - 1);
    elements.back.setAttribute('aria-label', singlePassage
      ? 'Volver al resumen de la lectura ' + n : 'Lectura anterior de ChronBible');
    elements.back.title = singlePassage ? 'Volver al resumen de lectura' : 'Lectura anterior';

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
      elements.next.textContent = 'Lectura ' + (n + 1) + ' →';
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
        '<div class="passage-loading">Cargando versículos…</div></div>' +
        (singlePassage ? '' : '<label class="passage-progress"><input type="checkbox" data-progress-index="' + task.progressIndex + '" disabled> Mark ' + label + ' complete</label>') +
        '</article>';
    }).join('');
    if (location.hash.startsWith('#passage-')) {
      requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
    }
  }

  function escapeLinkReference(ref) {
    const passage = parsePassage(ref);
    const idx = BOOK_LIST.indexOf(passage.book);
    if (idx < 0) return 'https://ebible.org/spabes/';
    const edition = prefs.translation === 'rv1909' ? 'spaRV1909' : 'spabes';
    return 'https://ebible.org/' + edition + '/' +
      EBIBLE_BOOK_CODES[idx] + String(passage.chapter).padStart(2, '0') + '.htm';
  }

  function renderVerses(data, label) {
    if (!data || !Array.isArray(data.verses) || data.verses.length === 0) {
      throw new Error('No hay versículos disponibles para ' + label + '.');
    }
    const verses = data.verses.filter((item) => Number.isInteger(Number(item.verse)) && typeof item.text === 'string');
    if (!verses.length) throw new Error('No hay versículos legibles para ' + label + '.');

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
    if (!match) throw new Error('Referencia bíblica no reconocida: ' + label);
    const book = BOOK_CODES[match[1]];
    if (!book) throw new Error('Libro bíblico no reconocido: ' + match[1]);
    const chapter = Number(match[2]);
    const start = match[3] ? Number(match[3]) : null;
    const end = match[4] ? Number(match[4]) : start;
    if (!Number.isInteger(chapter) || chapter < 1 || (start !== null && (!Number.isInteger(start) || start < 1 || !Number.isInteger(end) || end < start))) {
      throw new Error('Referencia bíblica no válida: ' + label);
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
        // Book requests are intentionally not aborted when users switch editions:
        // the shared in-flight download can finish and populate the local cache.
        response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) throw new Error('Local Bible file returned HTTP ' + response.status);
      } catch (error) {
        if ('caches' in window) {
          try {
            response = await (await caches.open(BIBLE_CACHE_NAME)).match(url);
          } catch {}
        }
        if (!response) throw new Error('Este libro aún no está disponible sin conexión. Conéctate una vez para guardarlo.');
      }

      const data = await response.json();
      if (data.version !== version || data.book !== book || !Array.isArray(data.chapters) || data.chapters.length === 0) {
        throw new Error('El archivo bíblico guardado no superó la verificación.');
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
      throw new Error('Capítulo no encontrado en la Biblia guardada: ' + task.label);
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
    if (!verses.length) throw new Error('No se encontraron versículos para ' + task.label);
    // When referencing a specific verse, fail visibly rather than silently
    // substituting an incorrect verse from the translation.
    if (ref.start !== null &&
        (!verses.some(v => v.verse === ref.start) || !verses.some(v => v.verse === ref.end))) {
      throw new Error('La versión elegida no contiene los números de versículo solicitados: ' + task.label);
    }
    const data = { reference: task.label, translation_id: translation, verses };
    verseCache.set(cacheKey, data);
    return data;
  }

  async function downloadBothBiblesForOffline() {
    const button = document.getElementById('download-offline-bibles');
    const status = document.getElementById('offline-bible-status');
    if (!button || !status || !('caches' in window)) {
      if (status) status.textContent = 'Este navegador no admite descargas sin conexión.';
      return;
    }
    button.disabled = true;
    const urls = ['bes', 'rv1909'].flatMap(version => BOOK_LIST.map(book => bookPath(version, book)));
    const cache = await caches.open(BIBLE_CACHE_NAME);
    let completed = 0;
    let failed = 0;
    let cursor = 0;
    status.textContent = 'Guardando ambas Biblias: 0 / ' + urls.length + ' libros';
    async function worker() {
      while (cursor < urls.length) {
        const url = urls[cursor++];
        try {
          let file = await cache.match(url);
          if (!file) {
            const response = await fetch(url, { cache: 'force-cache' });
            if (!response.ok) throw new Error('Bible file failed (' + response.status + ')');
            const data = await response.clone().json();
            if (!['bes', 'rv1909'].includes(data.version) || !Array.isArray(data.chapters) || !data.chapters.length) {
              throw new Error('Invalid Bible download');
            }
            await cache.put(url, response);
          }
        } catch (error) {
          failed++;
          console.warn('Offline Scripture download', url, error.message);
        } finally {
          completed++;
          status.textContent = 'Guardando ambas Biblias: ' + completed + ' / ' + urls.length + ' libros';
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: 4 }, worker));
      status.textContent = failed
        ? (completed - failed) + ' libros guardados; ' + failed + ' no se descargaron. Pulsa para reintentar.'
        : 'Ambas Biblias se guardaron para leerlas sin conexión.';
    } catch {
      status.textContent = 'No se completó la descarga. Inténtalo con conexión.';
    } finally {
      button.disabled = false;
    }
  }

  function passageError(index, error) {
    const task = activeTasks[index];
    const target = $('task-verses-' + index);
    if (!target) return;
    target.innerHTML = '<div class="passage-error"><p>No pudimos cargar este pasaje por ahora. ' +
      'Comprueba tu conexión e inténtalo de nuevo.</p>' +
      '<button type="button" data-retry-task="' + index + '">Reintentar</button>' +
      '<a target="_blank" rel="noopener noreferrer" href="' +
      escapeHTML(escapeLinkReference(task.label)) + '">Leer en eBible.org ↗</a></div>';
    $('task-status-' + index).textContent = 'No disponible';
    console.warn('ChronBible passage', task.label, error?.message || error);
  }

  async function retryPassage(index) {
    if (!reading || index < 0 || index >= activeTasks.length) return;
    const requestId = scriptureRequestId;
    const translation = prefs.translation;
    const task = activeTasks[index];
    $('task-verses-' + index).innerHTML = '<div class="passage-loading">Cargando versículos…</div>';
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
    elements.status.textContent = 'Cargando ' + (translation === 'bes' ? 'Biblia en Español Sencillo 2026' : 'Reina-Valera 1909') + '…';

    for (const [idx] of activeTasks.entries()) {
      const target = $('task-verses-' + idx);
      if (target) target.innerHTML = '<div class="passage-loading">Cargando versículos…</div>';
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
    // Los errores individuales muestran opciones para reintentar y consultar eBible.org.
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
    elements.completeButton.textContent = allComplete ? 'Marcar lectura como pendiente' : 'Marcar lectura completada';
    elements.signIn.hidden = Boolean(session);
    elements.progressHelp.textContent = session
      ? checkedCount + ' of ' + indices.length + ' passages completed. Changes sync with your ChronBible account.'
      : 'Inicia sesión en ChronBible para guardar el progreso.';
  }

  async function initProgress() {
    const config = window.TJM_CHRONBIBLE_CONFIG;
    if (!window.supabase?.createClient || !config) {
      elements.progressHelp.textContent = 'Inicia sesión en ChronBible para guardar tu progreso.';
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
      console.warn('Progreso del lector ChronBible:', error.message);
      elements.progressStatus.textContent = 'No se pudo cargar tu progreso. Puedes seguir leyendo la Biblia.';
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
    elements.progressStatus.textContent = 'Guardando…';
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
      elements.progressStatus.textContent = 'Progreso guardado.';
    } catch (error) {
      completed = oldCompleted;
      elements.progressStatus.textContent = 'No se pudo guardar el progreso. Inténtalo de nuevo.';
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
      const overview = '/es/chronbible/' + (number && number >= 1 && number <= 313
        ? '?reading=' + number : '');
      window.location.replace(overview);
      return;
    }
    try {
      const res = await fetch(PLAN_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('El plan de lectura no está disponible (' + res.status + ').');
      plan = await res.json();
      if (plan.planId !== window.TJM_CHRONBIBLE_CONFIG?.planId ||
          !Array.isArray(plan.readings) || plan.readings.length !== 313) {
        throw new Error('No se pudo verificar el plan de ChronBible.');
      }
      setReadingData();
      if (singlePassage) await loadPassages();
      else await Promise.all([loadPassages(), initProgress()]);
    } catch (error) {
      elements.status.hidden = false;
      elements.status.textContent = error.message + ' Vuelve al recorrido de ChronBible e inténtalo de nuevo.';
      console.warn(error);
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/es/chronbible/sw.js', {
      scope: '/es/chronbible/', updateViaCache: 'none'
    }).catch(error => console.warn('Configuración sin conexión de ChronBible:', error.message));
  }

  void init();
})();