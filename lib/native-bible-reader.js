(() => {
  "use strict";

  if (window.TJMNativeBible) return;

  const TRANSLATIONS = {
    KJV: { id: "KJV", name: "King James Version", path: "/assets/bible/kjv.json" },
    WEB: { id: "WEB", name: "World English Bible", path: "/assets/bible/web.json" },
  };
  const COLORS = ["yellow", "orange", "red", "green", "cyan", "purple"];
  const COLOR_LABELS = { yellow: "Yellow", orange: "Orange", red: "Red", green: "Green", cyan: "Cyan", purple: "Purple" };
  const BOOKS = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
    "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah",
    "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
    "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
    "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts",
    "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
    "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
    "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
  ];
  const BOOK_INDEX = new Map(BOOKS.map((book, index) => [book, index]));
  const BOOK_ALIASES = new Map([
    ...BOOKS.map((book) => [book.toLowerCase(), book]),
    ["psalm", "Psalms"],
    ["song of songs", "Song of Solomon"],
    ["songs of solomon", "Song of Solomon"],
    ["canticles", "Song of Solomon"],
  ]);
  const BOOK_NAMES = Array.from(BOOK_ALIASES.keys()).sort((left, right) => right.length - left.length);
  const ONE_CHAPTER_BOOKS = new Set(["Obadiah", "Philemon", "2 John", "3 John", "Jude"]);
  const LOCAL_KEY = "tjm-bible-highlights-v1";
  const LINK_TARGET_KEY = "tjm-bible-highlights-link-target-v1";
  const TRANSLATION_KEY = "tjm-bible-translation-v1";
  const SORT_KEY = "tjm-bible-notes-sort-v1";
  const SYNC_PAGE_SIZE = 1000;

  const translationCache = new Map();
  const contexts = new Map();
  const remoteQueues = new Map();
  let getDb = () => null;
  let getSession = () => null;
  let notify = () => {};
  let defaultPlanId = "native-bible";
  let highlights = readLocalHighlights();
  let selectedTranslation = safeLocalGet(TRANSLATION_KEY) in TRANSLATIONS ? safeLocalGet(TRANSLATION_KEY) : "KJV";
  let notesSort = ["color", "canon", "chronological", "created"].includes(safeLocalGet(SORT_KEY)) ? safeLocalGet(SORT_KEY) : "created";
  let pendingSelection = null;
  let selectedHighlightId = "";
  let editingHighlight = false;
  let returnToNotes = false;
  let syncPromise = null;
  let chronologyPromise = null;
  let chronologicalOrder = new Map();
  let selectionTimer = null;
  let uiReady = false;
  let readerRefreshRevision = 0;

  function safeLocalGet(key) {
    try { return localStorage.getItem(key) || ""; } catch { return ""; }
  }

  function safeLocalSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Private browsing can disable storage. */ }
  }

  function readLocalHighlights() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizeLocalHighlight).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function normalizeLocalHighlight(item) {
    if (!item?.id || !item?.chapterLabel || !TRANSLATIONS[item?.translation]) return null;
    const startOffset = Number(item.startOffset);
    const endOffset = Number(item.endOffset);
    if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset < 0 || endOffset <= startOffset) return null;
    const id = isUuid(item.id) ? String(item.id) : makeId();
    return {
      id,
      owner: String(item.owner || "guest"),
      planId: String(item.planId || "native-bible"),
      readingId: String(item.readingId || "standalone"),
      chapterLabel: normalizeChapterLabel(item.chapterLabel),
      translation: item.translation,
      startOffset,
      endOffset,
      selectedText: String(item.selectedText || ""),
      color: COLORS.includes(item.color) ? item.color : "yellow",
      note: String(item.note || ""),
      createdAt: validIso(item.createdAt) || new Date().toISOString(),
      updatedAt: validIso(item.updatedAt) || validIso(item.createdAt) || new Date().toISOString(),
      clientMutationId: isUuid(item.clientMutationId) ? String(item.clientMutationId) : id,
      synced: Boolean(item.synced),
      deletedAt: validIso(item.deletedAt) || "",
    };
  }

  function validIso(value) {
    if (!value || Number.isNaN(Date.parse(value))) return "";
    return new Date(value).toISOString();
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  function persistLocalHighlights() {
    safeLocalSet(LOCAL_KEY, JSON.stringify(highlights));
    updateNotesButton();
  }

  function escapeHTML(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeChapterLabel(value = "") {
    const cleaned = String(value)
      .replace(/^\s*read\s+/i, "")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    const lower = cleaned.toLowerCase();
    const name = BOOK_NAMES.find((candidate) => lower === candidate || lower.startsWith(`${candidate} `));
    if (!name) return cleaned;
    const book = BOOK_ALIASES.get(name);
    const rest = cleaned.slice(name.length).trim();
    const chapter = rest.match(/^(\d+)/)?.[1];
    return chapter ? `${book} ${Number(chapter)}` : book;
  }

  function chapterParts(chapterLabel = "") {
    const normalized = normalizeChapterLabel(chapterLabel);
    const match = normalized.match(/^(.+?)\s+(\d+)$/);
    return match ? { book: match[1], chapter: Number(match[2]) } : { book: normalized, chapter: 0 };
  }

  function currentOwner() {
    return getSession()?.user?.id || "guest";
  }

  function deletionOwner(item, userId, guestTarget = "") {
    if (item?.owner === "guest") return guestTarget || userId || "";
    return userId && item?.owner === userId ? userId : "";
  }

  function visibleHighlights() {
    const owner = currentOwner();
    const guestTarget = safeLocalGet(LINK_TARGET_KEY);
    return highlights.filter((item) => !item.deletedAt && (
      item.owner === owner
      || (owner !== "guest" && item.owner === "guest" && (!guestTarget || guestTarget === owner))
    ));
  }

  async function loadTranslation(translation = selectedTranslation) {
    if (!TRANSLATIONS[translation]) translation = "KJV";
    if (!translationCache.has(translation)) {
      const promise = fetch(TRANSLATIONS[translation].path, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`${TRANSLATIONS[translation].name} could not be loaded (${response.status}).`);
          return response.json();
        })
        .then((payload) => {
          if (!payload?.chapters || Object.keys(payload.chapters).length !== 1189) throw new Error(`${TRANSLATIONS[translation].name} data is incomplete.`);
          return payload;
        });
      translationCache.set(translation, promise);
    }
    return translationCache.get(translation);
  }

  function parseVerseRanges(value) {
    if (!value) return null;
    const ranges = [];
    for (const token of value.split(/\s*,\s*/)) {
      const match = token.match(/^(\d+)(?:-(\d+))?$/);
      if (!match) continue;
      const start = Number(match[1]);
      const end = Number(match[2] || match[1]);
      ranges.push({ start: Math.min(start, end), end: Math.max(start, end) });
    }
    return ranges.length ? ranges : null;
  }

  function mergePassageSpec(specs, next) {
    const existing = specs.find((item) => item.chapterLabel === next.chapterLabel);
    if (!existing) {
      specs.push(next);
      return;
    }
    if (!existing.ranges || !next.ranges) existing.ranges = null;
    else existing.ranges.push(...next.ranges);
  }

  function parsePassage(input = "") {
    const source = String(input).replace(/^\s*read\s+/i, "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
    if (!source) return [];
    const specs = [];
    let inheritedBook = "";
    for (let segment of source.split(/\s*;\s*/)) {
      if (!segment) continue;
      const lower = segment.toLowerCase();
      const alias = BOOK_NAMES.find((candidate) => lower === candidate || lower.startsWith(`${candidate} `));
      if (alias) {
        inheritedBook = BOOK_ALIASES.get(alias);
        segment = segment.slice(alias.length).trim();
      }
      if (!inheritedBook) continue;

      if (ONE_CHAPTER_BOOKS.has(inheritedBook)) {
        if (!segment) {
          mergePassageSpec(specs, { chapterLabel: `${inheritedBook} 1`, ranges: null });
          continue;
        }
        if (!segment.includes(":")) {
          // Reading-plan labels use "Book 1" to mean the complete (and only)
          // chapter. Other bare numbers in these books are verse references.
          if (segment === "1") {
            mergePassageSpec(specs, { chapterLabel: `${inheritedBook} 1`, ranges: null });
            continue;
          }
          const ranges = parseVerseRanges(segment);
          if (ranges) {
            mergePassageSpec(specs, { chapterLabel: `${inheritedBook} 1`, ranges });
            continue;
          }
        }
      }

      let match = segment.match(/^(\d+):(\d+)-(\d+):(\d+)$/);
      if (match) {
        const startChapter = Number(match[1]);
        const endChapter = Number(match[3]);
        for (let chapter = startChapter; chapter <= endChapter; chapter += 1) {
          const ranges = chapter === startChapter
            ? [{ start: Number(match[2]), end: Number.MAX_SAFE_INTEGER }]
            : chapter === endChapter ? [{ start: 1, end: Number(match[4]) }] : null;
          mergePassageSpec(specs, { chapterLabel: `${inheritedBook} ${chapter}`, ranges });
        }
        continue;
      }

      match = segment.match(/^(\d+)-(\d+)$/);
      if (match) {
        const first = Number(match[1]);
        const last = Number(match[2]);
        for (let chapter = Math.min(first, last); chapter <= Math.max(first, last); chapter += 1) {
          mergePassageSpec(specs, { chapterLabel: `${inheritedBook} ${chapter}`, ranges: null });
        }
        continue;
      }

      match = segment.match(/^(\d+)(?::(.+))?$/);
      if (match) mergePassageSpec(specs, {
        chapterLabel: `${inheritedBook} ${Number(match[1])}`,
        ranges: parseVerseRanges(match[2]),
      });
    }
    return specs;
  }

  function chapterModel(verses) {
    // Cross-platform anchor contract (v1): offsets count JavaScript UTF-16 code
    // units in unmodified verse text joined by exactly one "\n". Verse numbers
    // and other display-only content never contribute to an offset.
    let cursor = 0;
    const positions = verses.map((verse) => {
      const text = String(verse.text ?? "");
      const item = { verse: Number(verse.verse), text, start: cursor, end: cursor + text.length };
      cursor = item.end + 1;
      return item;
    });
    return { text: positions.map((item) => item.text).join("\n"), positions };
  }

  function rangesLabel(ranges) {
    if (!ranges?.length) return "";
    return `:${ranges.map((range) => range.start === range.end ? range.start : `${range.start}-${range.end === Number.MAX_SAFE_INTEGER ? "end" : range.end}`).join(", ")}`;
  }

  function renderHighlightedText(text, absoluteStart, matchingHighlights) {
    if (!text) return "";
    const boundaries = new Set([0, text.length]);
    for (const item of matchingHighlights) {
      const start = Math.max(0, item.startOffset - absoluteStart);
      const end = Math.min(text.length, item.endOffset - absoluteStart);
      if (end > start) { boundaries.add(start); boundaries.add(end); }
    }
    const points = Array.from(boundaries).sort((left, right) => left - right);
    let html = "";
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (end <= start) continue;
      const covered = matchingHighlights
        .filter((item) => item.startOffset <= absoluteStart + start && item.endOffset >= absoluteStart + end)
        .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))
        .at(-1);
      const content = escapeHTML(text.slice(start, end));
      html += covered
        ? `<mark class="nbr-highlight nbr-highlight-${covered.color}" data-highlight-id="${escapeHTML(covered.id)}" role="button" tabindex="0" aria-label="Open highlight note">${content}</mark>`
        : content;
    }
    return html;
  }

  function relevantHighlights(chapterLabel, translation) {
    return visibleHighlights().filter((item) => item.chapterLabel === chapterLabel && item.translation === translation);
  }

  function renderChapter(chapterLabel, ranges, verses, translation) {
    const model = chapterModel(verses);
    const chapterHighlights = relevantHighlights(chapterLabel, translation);
    const groups = ranges?.length ? ranges : [{ start: 1, end: Number.MAX_SAFE_INTEGER }];
    const scriptureGroups = groups.map((range) => {
      const verseMarkup = model.positions
      .filter((item) => item.verse >= range.start && item.verse <= range.end)
      .map((item) => {
        const touching = chapterHighlights.filter((highlight) => highlight.endOffset > item.start && highlight.startOffset < item.end);
        return `<p class="nbr-verse" data-verse="${item.verse}"><sup aria-hidden="true">${item.verse}</sup><span data-verse-text data-verse-start="${item.start}">${renderHighlightedText(item.text, item.start, touching)}</span></p>`;
      }).join("");
      return `<div class="nbr-scripture-text" data-selection-group data-chapter-text-length="${model.text.length}">${verseMarkup || `<p class="nbr-empty">No verse text is available for this selection.</p>`}</div>`;
    }).join('<div class="nbr-passage-gap" aria-hidden="true">•••</div>');
    return `<section class="nbr-chapter" data-chapter-label="${escapeHTML(chapterLabel)}" data-translation="${translation}">
      <h3>${escapeHTML(chapterLabel)}${escapeHTML(rangesLabel(ranges))}</h3>
      ${scriptureGroups}
    </section>`;
  }

  function readerToolbar(translation) {
    return `<div class="nbr-toolbar">
      <label><span>Translation</span><select data-bible-translation aria-label="Bible translation">
        ${Object.values(TRANSLATIONS).map((item) => `<option value="${item.id}" ${translation === item.id ? "selected" : ""}>${escapeHTML(item.name)} (${item.id})</option>`).join("")}
      </select></label>
    </div>`;
  }

  function viewportTargetTop(savedWindowTop, savedMountTop, currentWindowTop, currentMountTop) {
    const target = Number(currentWindowTop) + Number(currentMountTop) - Number(savedMountTop);
    return Number.isFinite(target) ? Math.max(0, target) : Math.max(0, Number(savedWindowTop) || 0);
  }

  function captureReaderViewport(refreshContexts) {
    const mounts = refreshContexts.map((context) => {
      const rect = context.mount.getBoundingClientRect();
      return {
        mount: context.mount,
        viewportTop: rect.top,
        viewportBottom: rect.bottom,
        scrollTop: context.mount.scrollTop,
        scrollLeft: context.mount.scrollLeft,
      };
    });
    const anchor = mounts.find((item) => item.viewportBottom >= 0 && item.viewportTop <= window.innerHeight) || mounts[0] || null;
    return {
      windowLeft: Number(window.scrollX) || 0,
      windowTop: Number(window.scrollY) || 0,
      anchor,
      mounts,
    };
  }

  function restoreReaderViewport(snapshot) {
    if (!snapshot) return;
    snapshot.mounts.forEach((item) => {
      if (!item.mount.isConnected) return;
      item.mount.scrollTop = item.scrollTop;
      item.mount.scrollLeft = item.scrollLeft;
    });
    const currentWindowTop = Number(window.scrollY) || 0;
    const targetTop = snapshot.anchor?.mount.isConnected
      ? viewportTargetTop(snapshot.windowTop, snapshot.anchor.viewportTop, currentWindowTop, snapshot.anchor.mount.getBoundingClientRect().top)
      : snapshot.windowTop;
    window.scrollTo(snapshot.windowLeft, targetTop);
  }

  async function openPassage(mount, passage, options = {}) {
    if (!mount) return;
    ensureUi();
    const preserveContent = Boolean(options.preserveContent && mount.innerHTML);
    const contextId = mount.dataset.nativeBibleContext || makeId();
    mount.dataset.nativeBibleContext = contextId;
    const context = {
      id: contextId,
      mount,
      passage: String(passage || ""),
      planId: String(options.planId || mount.dataset.planId || defaultPlanId),
      readingId: String(options.readingId || mount.dataset.readingId || "standalone"),
    };
    contexts.set(contextId, context);
    mount.dataset.activePassage = context.passage;
    if (preserveContent) mount.setAttribute("aria-busy", "true");
    else mount.innerHTML = `<div class="nbr-loading" role="status">Opening ${escapeHTML(context.passage)}…</div>`;
    try {
      const payload = await loadTranslation(selectedTranslation);
      if (!mount.isConnected && !options.allowDetached) return;
      const specs = parsePassage(context.passage);
      if (!specs.length) throw new Error(`“${context.passage}” is not a recognized Bible passage.`);
      const chapters = specs.map((spec) => {
        const verses = payload.chapters[spec.chapterLabel];
        return verses ? renderChapter(spec.chapterLabel, spec.ranges, verses, selectedTranslation) : `<section class="nbr-chapter"><p class="nbr-empty">${escapeHTML(spec.chapterLabel)} is unavailable in this translation.</p></section>`;
      }).join("");
      mount.innerHTML = `${readerToolbar(selectedTranslation)}<div class="nbr-reader" aria-label="${escapeHTML(context.passage)} in ${selectedTranslation}">${chapters}</div><p class="nbr-source">${escapeHTML(payload.meta.name)} · ${escapeHTML(payload.meta.rights)}</p>`;
    } catch (error) {
      if (preserveContent) console.warn("The open Bible passage could not be refreshed", error.message);
      else mount.innerHTML = `<div class="nbr-error"><strong>The passage could not be opened.</strong><p>${escapeHTML(error.message)}</p><button type="button" data-retry-bible>Try again</button></div>`;
    } finally {
      if (preserveContent) mount.removeAttribute("aria-busy");
    }
  }

  async function rerenderReaders(filter = null) {
    const refreshContexts = [];
    for (const [id, context] of contexts) {
      if (!context.mount.isConnected) { contexts.delete(id); continue; }
      if (!filter || filter(context)) refreshContexts.push(context);
    }
    if (!refreshContexts.length) return;
    const revision = ++readerRefreshRevision;
    const viewport = captureReaderViewport(refreshContexts);
    await Promise.all(refreshContexts.map((context) => openPassage(context.mount, context.passage, { ...context, preserveContent: true })));
    if (revision !== readerRefreshRevision) return;
    restoreReaderViewport(viewport);
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        if (revision === readerRefreshRevision) restoreReaderViewport(viewport);
      });
    }
  }

  function enhance(scope = document) {
    ensureUi();
    scope.querySelectorAll("[data-native-bible-mount][data-active-passage]").forEach((mount) => {
      openPassage(mount, mount.dataset.activePassage, {
        planId: mount.dataset.planId,
        readingId: mount.dataset.readingId,
      });
    });
  }

  function contextForChapter(chapterElement) {
    const mount = chapterElement.closest("[data-native-bible-context]");
    return mount ? contexts.get(mount.dataset.nativeBibleContext) : null;
  }

  function rangeOffsetWithin(wrapper, container, offset) {
    const probe = document.createRange();
    probe.selectNodeContents(wrapper);
    try { probe.setEnd(container, offset); } catch { return 0; }
    return probe.toString().length;
  }

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const startNode = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const endNode = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
    const startGroup = startNode?.closest?.("[data-selection-group]");
    const endGroup = endNode?.closest?.("[data-selection-group]");
    // Discontiguous passage ranges render as separate groups. Never let one
    // saved start/end range silently include verses that were not displayed.
    if (!startGroup || startGroup !== endGroup) return;
    const startElement = startGroup.closest(".nbr-chapter");
    const verseWrappers = Array.from(startGroup.querySelectorAll("[data-verse-text]"));
    const pieces = [];
    for (const wrapper of verseWrappers) {
      if (!range.intersectsNode(wrapper)) continue;
      let start = 0;
      let end = wrapper.textContent.length;
      if (wrapper.contains(range.startContainer)) start = rangeOffsetWithin(wrapper, range.startContainer, range.startOffset);
      if (wrapper.contains(range.endContainer)) end = rangeOffsetWithin(wrapper, range.endContainer, range.endOffset);
      if (end <= start) continue;
      pieces.push({ start: Number(wrapper.dataset.verseStart) + start, end: Number(wrapper.dataset.verseStart) + end });
    }
    if (!pieces.length) return;
    const startOffset = pieces[0].start;
    const endOffset = pieces.at(-1).end;
    const chapterLabel = startElement.dataset.chapterLabel;
    const translation = startElement.dataset.translation;
    loadTranslation(translation).then((payload) => {
      const verses = payload.chapters[chapterLabel];
      if (!verses) return;
      const selectedText = chapterModel(verses).text.slice(startOffset, endOffset);
      if (!selectedText.trim()) return;
      const context = contextForChapter(startElement) || { planId: defaultPlanId, readingId: "standalone" };
      pendingSelection = { chapterLabel, translation, startOffset, endOffset, selectedText, planId: context.planId, readingId: context.readingId };
      showPalette(range.getBoundingClientRect());
    }).catch(() => {});
  }

  function showPalette(rect) {
    const palette = document.getElementById("nbr-highlight-palette");
    if (!palette) return;
    palette.hidden = false;
    const width = palette.offsetWidth || 286;
    const height = palette.offsetHeight || 90;
    const left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left + rect.width / 2 - width / 2));
    const below = rect.bottom + 10;
    const top = below + height <= window.innerHeight - 10 ? below : Math.max(10, rect.top - height - 10);
    palette.style.left = `${left}px`;
    palette.style.top = `${top}px`;
  }

  function hidePalette(clearSelection = true) {
    const palette = document.getElementById("nbr-highlight-palette");
    if (palette) palette.hidden = true;
    pendingSelection = null;
    if (clearSelection) window.getSelection()?.removeAllRanges();
  }

  function makeId() {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    const bytes = new Uint8Array(16);
    if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function addHighlight(color) {
    if (!pendingSelection || !COLORS.includes(color)) return;
    const overlaps = relevantHighlights(pendingSelection.chapterLabel, pendingSelection.translation).some((item) => (
      pendingSelection.startOffset < item.endOffset && pendingSelection.endOffset > item.startOffset
    ));
    if (overlaps) {
      hidePalette();
      notify("That selection overlaps an existing highlight. Choose unhighlighted words or edit the existing highlight.", "warning");
      return;
    }
    const now = new Date().toISOString();
    const owner = currentOwner();
    const item = normalizeLocalHighlight({
      ...pendingSelection,
      id: makeId(),
      owner,
      color,
      note: "",
      createdAt: now,
      updatedAt: now,
      clientMutationId: makeId(),
      synced: false,
    });
    if (!item) return;
    highlights.push(item);
    persistLocalHighlights();
    hidePalette();
    saveRemote(item);
    await rerenderReaders((context) => context.passage && parsePassage(context.passage).some((spec) => spec.chapterLabel === item.chapterLabel));
    notify("Highlight saved. Tap highlighted words to add a note.");
    window.dispatchEvent(new CustomEvent("tjm-bible-highlights-updated"));
  }

  function toDbRow(item, userId, { includeId = true } = {}) {
    const row = {
      user_id: userId,
      plan_id: item.planId,
      reading_id: item.readingId,
      translation: item.translation,
      chapter_label: item.chapterLabel,
      start_offset: item.startOffset,
      end_offset: item.endOffset,
      selected_text: item.selectedText,
      color: item.color,
      note: item.note,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      client_mutation_id: item.clientMutationId,
    };
    if (includeId) row.id = item.id;
    // Live writes intentionally omit this field. The database trigger also
    // refuses to clear an existing tombstone, so stale clients cannot revive it.
    if (item.deletedAt) row.deleted_at = item.deletedAt;
    return row;
  }

  function fromDbRow(row) {
    return normalizeLocalHighlight({
      id: row.id,
      owner: row.user_id,
      planId: row.plan_id,
      readingId: row.reading_id,
      translation: row.translation,
      chapterLabel: row.chapter_label,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      selectedText: row.selected_text,
      color: row.color,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      clientMutationId: row.client_mutation_id,
      synced: true,
      deletedAt: row.deleted_at,
    });
  }

  function queueRemoteOperation(itemId, operation) {
    const previous = remoteQueues.get(itemId) || Promise.resolve();
    const queued = previous.catch(() => {}).then(operation);
    remoteQueues.set(itemId, queued);
    const clean = () => { if (remoteQueues.get(itemId) === queued) remoteQueues.delete(itemId); };
    queued.then(clean, clean);
    return queued;
  }

  async function fetchAllRemoteRows(db, userId) {
    const rows = [];
    for (let from = 0; ; from += SYNC_PAGE_SIZE) {
      const { data, error } = await db.from("bible_highlights")
        .select("*")
        .eq("user_id", userId)
        .order("id", { ascending: true })
        .range(from, from + SYNC_PAGE_SIZE - 1);
      if (error) throw error;
      const page = Array.isArray(data) ? data : [];
      rows.push(...page);
      if (page.length < SYNC_PAGE_SIZE) return rows;
    }
  }

  function applySaveResponse(item, saved, requestedUpdatedAt, requestedMutationId) {
    if (saved.deletedAt) {
      Object.assign(item, saved);
      return "remote-delete";
    }
    const requestIsStillCurrent = item.updatedAt === requestedUpdatedAt
      && item.clientMutationId === requestedMutationId
      && !item.deletedAt;
    if (!item.deletedAt && Date.parse(saved.updatedAt) > Date.parse(item.updatedAt)) {
      Object.assign(item, saved);
      return "remote-newer";
    }
    if (requestIsStillCurrent) {
      Object.assign(item, saved);
      return "saved";
    }
    item.synced = false;
    return "local-newer";
  }

  async function saveRemoteNow(item) {
    const db = getDb();
    const userId = getSession()?.user?.id;
    if (!db || !userId || item.owner !== userId || item.deletedAt) return false;
    const requestedUpdatedAt = item.updatedAt;
    const requestedMutationId = item.clientMutationId;
    const row = toDbRow(item, userId);
    const { data, error } = await db.from("bible_highlights").upsert(row, { onConflict: "id" }).select("*").single();
    if (error) {
      console.warn("Bible highlight sync", error.message);
      item.synced = false;
      persistLocalHighlights();
      return false;
    }
    const saved = data && fromDbRow(data);
    if (!saved) {
      item.synced = false;
      persistLocalHighlights();
      return false;
    }
    const resolution = applySaveResponse(item, saved, requestedUpdatedAt, requestedMutationId);
    if (resolution === "remote-delete" || resolution === "remote-newer") {
      // The trigger may return the already-saved newer revision instead of the
      // stale payload sent by this tab. Reflect that canonical row immediately.
      rerenderReaders();
      renderNotesList();
      window.dispatchEvent(new CustomEvent("tjm-bible-highlights-updated"));
    }
    persistLocalHighlights();
    return item.synced;
  }

  function saveRemote(item) {
    return queueRemoteOperation(item.id, () => saveRemoteNow(item));
  }

  async function upsertRemoteTombstone(db, userId, item) {
    const deletedAt = item.deletedAt || new Date().toISOString();
    const updatedAt = item.updatedAt || deletedAt;
    const candidate = { ...item, owner: userId, deletedAt, updatedAt, synced: false };
    // Omitting the local id and resolving on the stable mutation id covers a
    // guest migration whose INSERT committed but whose response was lost.
    const { data, error } = await db.from("bible_highlights")
      .upsert(toDbRow(candidate, userId, { includeId: false }), { onConflict: "user_id,client_mutation_id" })
      .select("*")
      .single();
    if (error) throw error;
    if (!data) throw new Error("The deletion tombstone was not returned by the sync service.");
    return fromDbRow(data);
  }

  async function deleteRemoteNow(item) {
    const db = getDb();
    const userId = getSession()?.user?.id;
    if (!db || !userId || item.owner !== userId) return false;
    try {
      const saved = await upsertRemoteTombstone(db, userId, item);
      if (saved) Object.assign(item, saved);
      persistLocalHighlights();
      return Boolean(item.synced);
    } catch (error) {
      console.warn("Bible highlight delete", error.message);
      return false;
    }
  }

  function deleteRemote(item) {
    return queueRemoteOperation(item.id, () => deleteRemoteNow(item));
  }

  function syncMergeDecision(local, remote) {
    if (remote?.deletedAt) return "remote-delete";
    if (local.deletedAt) return "delete";
    if (!remote) return local.synced ? "drop" : "upload";
    if (!local.synced && Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt)) return "upload";
    return "remote";
  }

  function resolveGuestMigrationResponse(item, candidate, saved, userId) {
    const changedWhileMigrating = item.updatedAt !== candidate.updatedAt
      || item.clientMutationId !== candidate.clientMutationId;
    return changedWhileMigrating
      ? { ...item, id: saved.id, owner: userId, synced: false }
      : saved;
  }

  async function migrateGuestHighlight(db, userId, item, remoteByMutation) {
    const existing = remoteByMutation.get(item.clientMutationId);
    if (item.deletedAt) return upsertRemoteTombstone(db, userId, { ...item, id: existing?.id || item.id, owner: userId });
    // A prior request may have reached Supabase even if its response never
    // reached this browser. In that case, keep whichever revision is newer
    // instead of blindly replacing the server copy on retry.
    if (existing?.deletedAt || (existing && Date.parse(existing.updatedAt) >= Date.parse(item.updatedAt))) return existing;
    const candidate = { ...item, id: existing?.id || item.id, owner: userId, synced: false };
    const { data, error } = await db.from("bible_highlights")
      .upsert(toDbRow(candidate, userId, { includeId: Boolean(existing) }), {
        onConflict: existing ? "id" : "user_id,client_mutation_id",
      })
      .select("*");
    if (error) throw error;
    const saved = data?.[0] ? fromDbRow(data[0]) : null;
    if (!saved) throw new Error("The migrated highlight was not returned by the sync service.");
    // The user may delete this linked guest row while the migration request is
    // in flight. Follow the response with the same mutation-keyed tombstone so
    // either request order still ends in a deletion.
    if (item.deletedAt) return upsertRemoteTombstone(db, userId, { ...item, id: saved?.id || item.id, owner: userId });
    // Preserve a note/color/date edit made while the migration was in flight.
    // Normal reconciliation will upload this account-bound newer revision.
    return resolveGuestMigrationResponse(item, candidate, saved, userId);
  }

  async function syncHighlights() {
    if (syncPromise) return syncPromise;
    const db = getDb();
    const session = getSession();
    const userId = session?.user?.id;
    if (!db || !userId) {
      updateNotesButton();
      return;
    }
    syncPromise = (async () => {
      try {
        // Read first so a retried guest migration cannot overwrite a newer
        // copy that a previous, response-lost request already created.
        let remote = (await fetchAllRemoteRows(db, userId)).map(fromDbRow).filter(Boolean);
        let remoteByMutation = new Map(remote.map((item) => [item.clientMutationId, item]));
        const guestItems = highlights.filter((item) => item.owner === "guest" && !item.deletedAt);
        let guestTarget = safeLocalGet(LINK_TARGET_KEY);
        if (!guestItems.length && guestTarget) {
          safeLocalSet(LINK_TARGET_KEY, "");
          guestTarget = "";
        }
        if (guestItems.length && (!guestTarget || guestTarget === userId)) {
          if (!guestTarget) safeLocalSet(LINK_TARGET_KEY, userId);
          for (const item of guestItems) {
            try {
              const saved = await migrateGuestHighlight(db, userId, item, remoteByMutation);
              if (!saved) continue;
              const previousId = item.id;
              highlights = highlights.filter((entry) => entry !== item && entry.id !== previousId && entry.id !== saved.id && entry.clientMutationId !== saved.clientMutationId).concat(saved);
              if (selectedHighlightId === previousId) selectedHighlightId = saved.id;
              remote = remote.filter((entry) => entry.id !== saved.id && entry.clientMutationId !== saved.clientMutationId).concat(saved);
              remoteByMutation.set(saved.clientMutationId, saved);
            } catch (migrationError) {
              console.warn("Bible guest highlight migration", migrationError.message);
            }
          }
          persistLocalHighlights();
          // Refresh through the same complete paginated path. This observes a
          // migration that committed even when its response was lost.
          remote = (await fetchAllRemoteRows(db, userId)).map(fromDbRow).filter(Boolean);
          remoteByMutation = new Map(remote.map((item) => [item.clientMutationId, item]));
          for (const guest of highlights.filter((item) => item.owner === "guest" && !item.deletedAt)) {
            const saved = remoteByMutation.get(guest.clientMutationId);
            if (!saved) continue;
            if (saved.deletedAt || Date.parse(saved.updatedAt) >= Date.parse(guest.updatedAt)) {
              const previousId = guest.id;
              highlights = highlights.filter((item) => item !== guest);
              if (selectedHighlightId === previousId) selectedHighlightId = saved.id;
            } else {
              // Keep the newer local guest copy visible for a later retry, but
              // do not also render its older account copy in this snapshot.
              remote = remote.filter((item) => item.clientMutationId !== guest.clientMutationId);
              remoteByMutation.delete(guest.clientMutationId);
            }
          }
          if (!highlights.some((item) => item.owner === "guest" && !item.deletedAt)) safeLocalSet(LINK_TARGET_KEY, "");
        }
        const pendingDeletes = highlights.filter((item) => item.owner === userId && item.deletedAt && !item.synced);
        for (const item of pendingDeletes) {
          if (await deleteRemote(item)) {
            remote = remote.filter((entry) => entry.id !== item.id).concat({ ...item });
          }
        }
        const localForUser = highlights.filter((item) => item.owner === userId);
        const localDeletes = new Set(localForUser.filter((item) => item.deletedAt).map((item) => item.id));
        const merged = new Map(remote.filter((item) => !localDeletes.has(item.id)).map((item) => [item.id, item]));
        const mergedByMutation = new Map(Array.from(merged.values()).map((item) => [item.clientMutationId, item]));
        const needsUpload = [];
        for (const local of localForUser) {
          const saved = merged.get(local.id) || mergedByMutation.get(local.clientMutationId);
          const decision = syncMergeDecision(local, saved);
          if (decision === "delete") {
            if (saved && saved.id !== local.id) {
              const previousId = local.id;
              merged.delete(saved.id);
              local.id = saved.id;
              if (selectedHighlightId === previousId) selectedHighlightId = local.id;
            }
            merged.set(local.id, local);
            mergedByMutation.set(local.clientMutationId, local);
          } else if (decision === "upload") {
            if (saved && saved.id !== local.id) {
              const previousId = local.id;
              merged.delete(saved.id);
              local.id = saved.id;
              if (selectedHighlightId === previousId) selectedHighlightId = local.id;
            }
            merged.set(local.id, local);
            mergedByMutation.set(local.clientMutationId, local);
            needsUpload.push(local);
          }
        }
        // Preserve guest rows when their account-bound migration is still
        // pending (or belongs to another account on this shared device).
        highlights = highlights.filter((item) => item.owner !== userId).concat(Array.from(merged.values()));
        persistLocalHighlights();
        await Promise.all(needsUpload.map((item) => saveRemote(item)));
        await rerenderReaders();
        renderNotesList();
      } catch (error) {
        console.warn("Bible notes remain on this device", error.message);
        notify("Bible notes are saved on this device. Account sync will resume when it is available.", "warning");
      } finally {
        syncPromise = null;
      }
    })();
    return syncPromise;
  }

  function updateNotesButton() {
    const button = document.getElementById("nbr-notes-fab");
    if (!button) return;
    const count = visibleHighlights().length;
    button.querySelector("[data-notes-count]").textContent = String(count);
    button.setAttribute("aria-label", `Open notes (${count} ${count === 1 ? "highlight" : "highlights"})`);
  }

  async function referenceFor(item) {
    try {
      const payload = await loadTranslation(item.translation);
      const verses = payload.chapters[item.chapterLabel];
      if (!verses) return item.chapterLabel;
      return referenceForOffsets(item.chapterLabel, verses, item.startOffset, item.endOffset);
    } catch {
      return item.chapterLabel;
    }
  }

  function referenceForOffsets(chapterLabel, verses, startOffset, endOffset) {
    const model = chapterModel(verses);
    const touched = model.positions.filter((verse) => endOffset > verse.start && startOffset < verse.end);
    if (!touched.length) return normalizeChapterLabel(chapterLabel);
    const first = touched[0].verse;
    const last = touched.at(-1).verse;
    return `${normalizeChapterLabel(chapterLabel)}:${first}${last === first ? "" : `-${last}`}`;
  }

  async function ensureReferences(items) {
    const map = new Map();
    await Promise.all(items.map(async (item) => map.set(item.id, await referenceFor(item))));
    return map;
  }

  async function loadChronology() {
    if (chronologyPromise) return chronologyPromise;
    chronologyPromise = fetch("/chronbible/data/readings.json", { cache: "force-cache" })
      .then((response) => response.ok ? response.json() : null)
      .then((plan) => {
        chronologicalOrder = new Map();
        for (const reading of plan?.readings || []) {
          for (const task of reading.bibleTasks || []) {
            const order = Number(task.progressIndex);
            for (const spec of parsePassage(task.label)) {
              const chapterLabel = spec.chapterLabel;
              chronologicalOrder.set(chapterLabel, Math.min(chronologicalOrder.get(chapterLabel) ?? Number.MAX_SAFE_INTEGER, order));
            }
          }
        }
        return chronologicalOrder;
      })
      .catch(() => chronologicalOrder);
    return chronologyPromise;
  }

  function compareHighlights(left, right) {
    if (notesSort === "color") {
      return COLORS.indexOf(left.color) - COLORS.indexOf(right.color)
        || compareCanon(left, right)
        || Date.parse(right.createdAt) - Date.parse(left.createdAt);
    }
    if (notesSort === "canon") return compareCanon(left, right) || left.startOffset - right.startOffset;
    if (notesSort === "chronological") {
      const leftOrder = chronologicalOrder.get(left.chapterLabel) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = chronologicalOrder.get(right.chapterLabel) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.startOffset - right.startOffset || compareCanon(left, right);
    }
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  }

  function compareCanon(left, right) {
    const leftParts = chapterParts(left.chapterLabel);
    const rightParts = chapterParts(right.chapterLabel);
    return (BOOK_INDEX.get(leftParts.book) ?? 999) - (BOOK_INDEX.get(rightParts.book) ?? 999)
      || leftParts.chapter - rightParts.chapter;
  }

  async function renderNotesList() {
    const list = document.getElementById("nbr-notes-list");
    if (!list) return;
    const items = visibleHighlights().slice();
    if (notesSort === "chronological") await loadChronology();
    const references = await ensureReferences(items);
    items.sort(compareHighlights);
    list.innerHTML = items.length ? items.map((item) => `<button class="nbr-note-list-item" type="button" data-open-highlight="${escapeHTML(item.id)}">
      <span class="nbr-note-swatch nbr-highlight-${item.color}" aria-label="${COLOR_LABELS[item.color]}"></span>
      <span><strong>${escapeHTML(references.get(item.id) || item.chapterLabel)} · ${item.translation}</strong><span>${escapeHTML(item.selectedText.replace(/\s+/g, " ").trim())}</span><small>${escapeHTML(new Date(item.createdAt).toLocaleDateString(undefined, { timeZone: "UTC" }))}${item.note ? " · Note added" : ""}</small></span>
    </button>`).join("") : `<div class="nbr-notes-empty"><strong>Your highlights will appear here.</strong><p>Open a Bible reading, select any words, and choose a color.</p></div>`;
  }

  function openNotes() {
    ensureUi();
    document.getElementById("nbr-notes-dialog").hidden = false;
    document.body.classList.add("nbr-dialog-open");
    document.getElementById("nbr-notes-sort").value = notesSort;
    renderNotesList();
    document.getElementById("nbr-notes-close").focus();
  }

  function closeNotes() {
    document.getElementById("nbr-notes-dialog").hidden = true;
    if (document.getElementById("nbr-detail-dialog").hidden) document.body.classList.remove("nbr-dialog-open");
  }

  async function detailMarkup(item) {
    const reference = await referenceFor(item);
    const dateValue = item.createdAt.slice(0, 10);
    const colorOptions = COLORS.map((color) => `<label class="nbr-edit-color"><input type="radio" name="highlight-color" value="${color}" ${item.color === color ? "checked" : ""}><span class="nbr-highlight-${color}"></span><em>${COLOR_LABELS[color]}</em></label>`).join("");
    return `<div class="nbr-detail-heading">
      <div><p>${escapeHTML(reference)} · ${item.translation}</p><h2>Your highlight and note</h2></div>
      <div class="nbr-detail-menu-wrap">
        <button class="nbr-menu-button" type="button" id="nbr-detail-menu-button" aria-label="Note menu" aria-expanded="false"><span></span><span></span><span></span></button>
        <div class="nbr-detail-menu" id="nbr-detail-menu" hidden role="menu">
          <button type="button" data-detail-action="edit" role="menuitem">Edit</button>
          <button type="button" data-detail-action="delete" role="menuitem">Delete</button>
          <button type="button" data-detail-action="close" role="menuitem">Close</button>
        </div>
      </div>
    </div>
    <div class="nbr-detail-columns">
      <section class="nbr-detail-pane" aria-labelledby="nbr-highlighted-text-heading">
        <div class="nbr-pane-title"><h3 id="nbr-highlighted-text-heading">Highlighted Bible text</h3><button type="button" data-copy-highlight="${escapeHTML(item.id)}">Copy</button></div>
        <blockquote class="nbr-quote nbr-highlight-${item.color}">${escapeHTML(item.selectedText)}</blockquote>
      </section>
      <section class="nbr-detail-pane" aria-labelledby="nbr-note-heading">
        <div class="nbr-pane-title"><h3 id="nbr-note-heading">Your note</h3><button type="button" data-copy-note="${escapeHTML(item.id)}">Copy</button></div>
        ${editingHighlight ? `<form id="nbr-note-form">
          <label class="nbr-note-label">Note<textarea id="nbr-note-input" maxlength="10000" placeholder="Write your note…">${escapeHTML(item.note)}</textarea></label>
          <fieldset class="nbr-color-fieldset"><legend>Highlight color</legend>${colorOptions}</fieldset>
          <label class="nbr-date-field">Date created<input id="nbr-created-date" type="date" value="${dateValue}"></label>
          <div class="nbr-form-actions"><button type="button" data-cancel-note-edit>Cancel</button><button type="submit">Save</button></div>
        </form>` : `<div class="nbr-note-copy" tabindex="0">${item.note ? escapeHTML(item.note) : `<span>No note yet. Choose Edit from the menu to add one.</span>`}</div>`}
      </section>
    </div>`;
  }

  async function openDetail(id, edit = false, fromNotes = false) {
    const item = visibleHighlights().find((entry) => entry.id === id);
    if (!item) return;
    ensureUi();
    selectedHighlightId = id;
    editingHighlight = edit;
    returnToNotes = fromNotes || !document.getElementById("nbr-notes-dialog").hidden;
    const dialog = document.getElementById("nbr-detail-dialog");
    const card = document.getElementById("nbr-detail-card");
    dialog.hidden = false;
    document.body.classList.add("nbr-dialog-open");
    card.innerHTML = `<div class="nbr-loading">Opening note…</div>`;
    card.innerHTML = await detailMarkup(item);
    (editingHighlight ? document.getElementById("nbr-note-input") : document.getElementById("nbr-detail-menu-button"))?.focus();
  }

  function closeDetail() {
    document.getElementById("nbr-detail-dialog").hidden = true;
    selectedHighlightId = "";
    editingHighlight = false;
    if (!returnToNotes || document.getElementById("nbr-notes-dialog").hidden) document.body.classList.remove("nbr-dialog-open");
    returnToNotes = false;
  }

  async function saveNoteForm(form) {
    const item = highlights.find((entry) => entry.id === selectedHighlightId);
    if (!item) return;
    const note = form.querySelector("#nbr-note-input").value;
    const color = form.querySelector('input[name="highlight-color"]:checked')?.value || item.color;
    const date = form.querySelector("#nbr-created-date").value;
    item.note = note;
    item.color = COLORS.includes(color) ? color : item.color;
    if (date) {
      const [year, month, day] = date.split("-").map(Number);
      item.createdAt = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}${item.createdAt.slice(10) || "T12:00:00.000Z"}`;
    }
    item.updatedAt = new Date().toISOString();
    item.synced = false;
    persistLocalHighlights();
    saveRemote(item);
    editingHighlight = false;
    document.getElementById("nbr-detail-card").innerHTML = await detailMarkup(item);
    await rerenderReaders((context) => parsePassage(context.passage).some((spec) => spec.chapterLabel === item.chapterLabel));
    renderNotesList();
    notify("Highlight note saved.");
    window.dispatchEvent(new CustomEvent("tjm-bible-highlights-updated"));
  }

  function askDelete() {
    document.getElementById("nbr-delete-confirm").hidden = false;
    document.getElementById("nbr-confirm-delete-button").focus();
  }

  async function confirmDelete() {
    const item = highlights.find((entry) => entry.id === selectedHighlightId);
    if (!item) return;
    const signedInOwner = getSession()?.user?.id;
    const ownerForDelete = deletionOwner(item, signedInOwner, safeLocalGet(LINK_TARGET_KEY));
    if (ownerForDelete) {
      item.owner = ownerForDelete;
      item.deletedAt = new Date().toISOString();
      item.updatedAt = item.deletedAt;
      item.synced = false;
    } else {
      highlights = highlights.filter((entry) => entry.id !== item.id);
    }
    persistLocalHighlights();
    document.getElementById("nbr-delete-confirm").hidden = true;
    closeDetail();
    if (signedInOwner && ownerForDelete === signedInOwner) await deleteRemote(item);
    await rerenderReaders((context) => parsePassage(context.passage).some((spec) => spec.chapterLabel === item.chapterLabel));
    renderNotesList();
    notify("Highlight deleted.");
    window.dispatchEvent(new CustomEvent("tjm-bible-highlights-updated"));
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied to clipboard.");
    } catch {
      notify("Select the text and choose Copy from your device menu.", "warning");
    }
  }

  function ensureUi() {
    if (uiReady) return;
    uiReady = true;
    const host = document.createElement("div");
    host.id = "nbr-global-ui";
    host.innerHTML = `
      <div class="nbr-highlight-palette" id="nbr-highlight-palette" role="toolbar" aria-label="Choose highlight color" hidden>
        <span class="nbr-highlight-palette-label">Choose a highlight color</span>
        ${COLORS.map((color) => `<button type="button" data-choose-highlight-color="${color}" class="nbr-highlight-${color}" aria-label="${COLOR_LABELS[color]}" title="${COLOR_LABELS[color]}"></button>`).join("")}
      </div>
      <button class="nbr-notes-fab" id="nbr-notes-fab" type="button"><span aria-hidden="true">✎</span><strong>Notes</strong><em data-notes-count>0</em></button>
      <div class="nbr-dialog" id="nbr-notes-dialog" role="dialog" aria-modal="true" aria-labelledby="nbr-notes-heading" hidden>
        <div class="nbr-dialog-card nbr-notes-card">
          <header><div><p>YOUR BIBLE HIGHLIGHTS</p><h2 id="nbr-notes-heading">Notes</h2></div><button type="button" id="nbr-notes-close" aria-label="Close notes">×</button></header>
          <label class="nbr-sort-label"><span>Sort by</span><select id="nbr-notes-sort"><option value="color">Color</option><option value="canon">Biblical canon order</option><option value="chronological">Chronological order</option><option value="created">Date of creation</option></select></label>
          <div class="nbr-notes-list" id="nbr-notes-list"></div>
        </div>
      </div>
      <div class="nbr-dialog nbr-detail-dialog" id="nbr-detail-dialog" role="dialog" aria-modal="true" aria-label="Highlight and note" hidden><div class="nbr-dialog-card nbr-detail-card" id="nbr-detail-card"></div></div>
      <div class="nbr-dialog nbr-confirm-dialog" id="nbr-delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="nbr-confirm-heading" hidden>
        <div class="nbr-dialog-card"><h2 id="nbr-confirm-heading">Delete this highlight?</h2><p>The highlighted text and its note will be permanently removed.</p><div><button type="button" data-cancel-delete>Cancel</button><button type="button" id="nbr-confirm-delete-button" data-confirm-delete>Delete</button></div></div>
      </div>`;
    document.body.appendChild(host);
    updateNotesButton();
  }

  async function handleDocumentClick(event) {
    const highlightedText = event.target.closest?.("[data-highlight-id]");
    if (highlightedText) { openDetail(highlightedText.dataset.highlightId, false, false); return; }
    const target = event.target.closest("button, a, select");
    if (!target) return;
    if (target.matches("[data-native-bible-task]")) {
      event.preventDefault();
      const group = target.closest("[data-native-bible-group]") || target.parentElement;
      const mount = group.querySelector("[data-native-bible-mount]") || target.closest("section, article")?.querySelector("[data-native-bible-mount]");
      group.querySelectorAll("[data-native-bible-task]").forEach((button) => button.classList.toggle("is-active", button === target));
      if (mount) openPassage(mount, target.dataset.nativeBibleTask, {
        planId: target.dataset.planId || mount.dataset.planId,
        readingId: target.dataset.readingId || mount.dataset.readingId,
      });
      return;
    }
    if (target.matches("[data-retry-bible]")) {
      const mount = target.closest("[data-native-bible-mount]");
      const context = mount && contexts.get(mount.dataset.nativeBibleContext);
      if (context) openPassage(mount, context.passage, context);
      return;
    }
    if (target.matches("[data-choose-highlight-color]")) { addHighlight(target.dataset.chooseHighlightColor); return; }
    if (target.matches("[data-open-highlight]")) { openDetail(target.dataset.openHighlight, false, true); return; }
    if (target.id === "nbr-notes-fab") { openNotes(); return; }
    if (target.id === "nbr-notes-close") { closeNotes(); return; }
    if (target.id === "nbr-detail-menu-button") {
      const menu = document.getElementById("nbr-detail-menu");
      const opening = menu.hidden;
      menu.hidden = !opening;
      target.setAttribute("aria-expanded", String(opening));
      return;
    }
    if (target.matches("[data-detail-action]")) {
      document.getElementById("nbr-detail-menu").hidden = true;
      if (target.dataset.detailAction === "close") closeDetail();
      else if (target.dataset.detailAction === "delete") askDelete();
      else if (target.dataset.detailAction === "edit") openDetail(selectedHighlightId, true, returnToNotes);
      return;
    }
    if (target.matches("[data-cancel-note-edit]")) { openDetail(selectedHighlightId, false, returnToNotes); return; }
    if (target.matches("[data-cancel-delete]")) { document.getElementById("nbr-delete-confirm").hidden = true; return; }
    if (target.matches("[data-confirm-delete]")) { confirmDelete(); return; }
    if (target.matches("[data-copy-highlight]")) {
      const item = highlights.find((entry) => entry.id === target.dataset.copyHighlight);
      if (item) copyText(item.selectedText);
      return;
    }
    if (target.matches("[data-copy-note]")) {
      const item = highlights.find((entry) => entry.id === target.dataset.copyNote);
      if (item) copyText(item.note);
    }
  }

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-bible-translation]")) {
      selectedTranslation = TRANSLATIONS[event.target.value] ? event.target.value : "KJV";
      safeLocalSet(TRANSLATION_KEY, selectedTranslation);
      hidePalette();
      rerenderReaders();
    } else if (event.target.id === "nbr-notes-sort") {
      notesSort = event.target.value;
      safeLocalSet(SORT_KEY, notesSort);
      renderNotesList();
    }
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "nbr-note-form") return;
    event.preventDefault();
    saveNoteForm(event.target);
  });
  document.addEventListener("pointerup", (event) => {
    if (event.target.closest("#nbr-highlight-palette")) return;
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(captureSelection, 20);
  });
  document.addEventListener("keyup", (event) => {
    if (!event.shiftKey) return;
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(captureSelection, 80);
  });
  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(captureSelection, 500);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!document.getElementById("nbr-highlight-palette")?.hidden && !event.target.closest("#nbr-highlight-palette")) hidePalette();
    if (!event.target.closest("#nbr-detail-menu, #nbr-detail-menu-button")) {
      const menu = document.getElementById("nbr-detail-menu");
      if (menu) menu.hidden = true;
    }
  }, true);
  document.addEventListener("keydown", (event) => {
    const highlightedText = event.target.closest?.("[data-highlight-id]");
    if (highlightedText && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openDetail(highlightedText.dataset.highlightId, false, false);
      return;
    }
    if (event.key !== "Escape") return;
    if (!document.getElementById("nbr-delete-confirm")?.hidden) document.getElementById("nbr-delete-confirm").hidden = true;
    else if (!document.getElementById("nbr-detail-dialog")?.hidden) closeDetail();
    else if (!document.getElementById("nbr-notes-dialog")?.hidden) closeNotes();
    else hidePalette();
  });

  function configure(options = {}) {
    if (typeof options.getDb === "function") getDb = options.getDb;
    if (typeof options.getSession === "function") getSession = options.getSession;
    if (typeof options.toast === "function") notify = options.toast;
    if (options.planId) defaultPlanId = String(options.planId);
    ensureUi();
    updateNotesButton();
    syncHighlights();
    return api;
  }

  const api = {
    configure,
    enhance,
    openPassage,
    syncHighlights,
    refresh: () => rerenderReaders(),
    parsePassage,
    normalizeChapterLabel,
    getTranslation: () => selectedTranslation,
    getHighlights: () => visibleHighlights().map((item) => ({ ...item })),
    offsetContract: Object.freeze({
      version: 1,
      separator: "\n",
      chapterText: (verses = []) => chapterModel(verses).text,
      referenceForOffsets,
    }),
    viewportContract: Object.freeze({ targetTop: viewportTargetTop }),
    syncContract: Object.freeze({ mergeDecision: syncMergeDecision, deletionOwner, fetchAllRemoteRows, applySaveResponse, resolveGuestMigrationResponse }),
  };

  window.TJMNativeBible = api;
})();
