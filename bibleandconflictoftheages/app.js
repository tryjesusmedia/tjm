(() => {
  "use strict";

  const CONFIG = window.TJM_CONFLICT_CONFIG;
  const PLAN_PATH = "data/readings.json";
  const CHAPTER_PROGRESS_PLAN_ID = "bible-conflict-ages-chapters-v1";
  // Exact printed page ranges confirmed against the official EGW Writings chapter text.
  // These fill the ranges omitted from the supplied Prophets and Kings plan entries.
  const PK_PAGE_RANGES = new Map([
    ["introduction", "15–22"], [1, "25–34"], [2, "35–50"], [3, "51–60"], [4, "61–74"],
    [5, "75–86"], [6, "87–98"], [7, "99–108"], [8, "109–116"], [9, "119–128"], [10, "129–142"],
    [23, "279–292"], [24, "293–300"], [25, "303–310"], [26, "311–321"], [27, "322–330"],
    [28, "331–339"], [29, "340–348"], [30, "349–366"],
  ]);
  const root = document.getElementById("view-root");
  const loading = document.getElementById("loading-state");
  const authGate = document.getElementById("auth-gate");
  const authError = document.getElementById("auth-error");
  const signInButton = document.getElementById("google-sign-in");
  const guestButton = document.getElementById("continue-without-sign-in");
  const headerSignIn = document.getElementById("header-sign-in");
  const profileButton = document.getElementById("profile-button");
  const accountMenu = document.getElementById("account-menu");
  const toastRegion = document.getElementById("toast-region");
  const syncStatus = document.getElementById("sync-status");

  let db = null;
  let plan = null;
  let session = null;
  let guestBrowsing = false;
  let settings = null;
  let progress = new Map();
  let chapterCompleted = new Set();
  let chapterTaskCount = 0;
  let activeView = "readings";
  let currentIndex = 0;
  let activeBook = "PP";
  let refreshTimer = null;

  function resolveReadingId(readingId) {
  return plan?.readingAliases?.[readingId] || readingId;
}

function escapeHTML(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function displayName() {
    const metadata = session?.user?.user_metadata ?? {};
    return metadata.full_name || metadata.name || session?.user?.email?.split("@")[0] || "Try Jesus member";
  }

  function avatarUrl() {
    const metadata = session?.user?.user_metadata ?? {};
    return metadata.avatar_url || metadata.picture || "";
  }

  function initials(name) {
    return String(name || "T").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  }

  function setSync(label, mode = "") {
    syncStatus.className = `sync-status${mode ? ` is-${mode}` : ""}`;
    syncStatus.innerHTML = `<i></i>${escapeHTML(label)}`;
  }

  function toast(message, type = "") {
    const item = document.createElement("div");
    item.className = `toast${type ? ` ${type}` : ""}`;
    item.textContent = message;
    toastRegion.appendChild(item);
    setTimeout(() => item.remove(), 4200);
  }

  function isoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function guestSettings() {
    return {
      start_date: isoDate(new Date()),
      schedule_mode: "pace",
      last_reading_id: plan?.readings?.[0]?.id ?? null,
    };
  }

  function showSignIn() {
    authError.textContent = "";
    authGate.hidden = false;
  }

  function guestBanner() {
    if (session || !guestBrowsing) return "";
    return `<aside class="save-banner" aria-label="Saving requires sign-in"><div><strong>Viewing without an account</strong><span>You can explore every reading and keep notes on this device. Sign in to sync progress, highlights, and notes across devices.</span></div><button class="button button-primary" type="button" data-require-sign-in>Sign in to sync</button></aside>`;
  }

  function prepareChapterProgressIndex() {
  const tasks = plan.readings.flatMap((reading) => [
    ...(reading.bibleTasks ?? []),
    ...(reading.commentaryTasks ?? []),
  ]);
  const reserved = new Set(tasks
    .map((task) => task.legacyProgressIndex)
    .filter((index) => Number.isInteger(index) && index >= 0));
  let nextIndex = 0;
  let maximumIndex = -1;

  for (const task of tasks) {
    if (Number.isInteger(task.legacyProgressIndex) && task.legacyProgressIndex >= 0) {
      task.progressIndex = task.legacyProgressIndex;
    } else {
      while (reserved.has(nextIndex)) nextIndex += 1;
      task.progressIndex = nextIndex;
      nextIndex += 1;
    }
    maximumIndex = Math.max(maximumIndex, task.progressIndex);
  }
  chapterTaskCount = maximumIndex + 1;
}

function taskGroupComplete(reading, kind) {
    const tasks = kind === "bible" ? reading.bibleTasks : reading.commentaryTasks;
    const hasAssignment = kind === "bible" ? reading.bibleReference : reading.commentaryCitation;
    return !hasAssignment || (tasks?.length > 0 && tasks.every((task) => chapterCompleted.has(task.progressIndex)));
  }

  function readingProgress(reading) {
    return progress.get(reading.id) ?? {
      reading_id: reading.id,
      bible_complete: false,
      commentary_complete: false,
    };
  }

  function readingComplete(reading) {
    return taskGroupComplete(reading, "bible") && taskGroupComplete(reading, "commentary");
  }

  function completedCount(code = null) {
    return plan.readings.filter((reading) => (!code || reading.code === code) && readingComplete(reading)).length;
  }

  function currentReading() {
    return plan.readings[Math.max(0, Math.min(currentIndex, plan.readings.length - 1))];
  }

  function companionTitles(reading) {
    const titles = (reading?.commentaryTasks ?? []).map((task) => String(task.title || "").trim()).filter(Boolean);
    if (titles.length) return titles;
    if (reading?.commentaryCitation) return [reading.commentaryCitation];
    if (reading?.bibleReference) return [`Scripture—${reading.bibleReference}`];
    return [reading?.title || "Reading assignment"];
  }

  function companionChapterSummary(reading) {
    const sections = (reading?.commentaryTasks ?? []).map((task) => {
      if (Number.isInteger(task.chapterNumber)) return `Chapter ${task.chapterNumber}`;
      return String(task.title || task.label || "Introduction").split("—")[0].replace(/^Read\s+/i, "").trim();
    }).filter(Boolean);
    if (!sections.length) return reading?.bibleReference && !reading?.commentaryCitation ? "Scripture assignment" : "Companion reading";
    if (sections.length === 1) return sections[0];
    if (sections.every((section) => /^Chapter \d+$/.test(section))) {
      return `Chapters ${sections.map((section) => section.replace("Chapter ", "")).join(" & ")}`;
    }
    return sections.join(" & ");
  }

  function companionIdentity(reading, includeBook = true) {
    const chapter = companionChapterSummary(reading);
    if (reading?.bibleReference && !reading?.commentaryCitation) return `Scripture · ${reading.bibleReference}`;
    return includeBook ? `${reading?.code || ""} · ${chapter}` : chapter;
  }

  function companionHeading(reading, className = "") {
    return companionTitles(reading).map((title) => `<span${className ? ` class="${className}"` : ""}>${escapeHTML(title)}</span>`).join("");
  }

  function companionPageSummary(reading) {
    const code = String(reading?.code || "").toUpperCase();
    if (!code || !reading?.commentaryCitation) return "";
    const ranges = [...reading.commentaryCitation.matchAll(new RegExp(`\\b${code}\\s+(\\d+(?:\\.\\d+)?)(?:\\s*[-–]\\s*(\\d+(?:\\.\\d+)?))?`, "gi"))]
      .map((match) => `${code} ${match[1]}${match[2] && match[2] !== match[1] ? `–${match[2]}` : ""}`);
    if (ranges.length) return [...new Set(ranges)].join(" · ");
    if (code === "PK") {
      return (reading.commentaryTasks ?? []).map((task) => {
        const key = Number.isInteger(task.chapterNumber) ? task.chapterNumber : "introduction";
        const pageRange = PK_PAGE_RANGES.get(key);
        return pageRange ? `PK ${pageRange}` : "";
      }).filter(Boolean).join(" · ");
    }
    return "";
  }

  function bookChapterRange(readings) {
    const tasks = readings.flatMap((reading) => reading.commentaryTasks ?? []);
    const numbers = tasks.map((task) => task.chapterNumber).filter(Number.isInteger);
    const hasIntroduction = tasks.some((task) => !Number.isInteger(task.chapterNumber) && /^Introduction/i.test(task.title || task.label || ""));
    if (!numbers.length) return hasIntroduction ? "Introduction" : "Companion chapters";
    const range = `Chapters ${Math.min(...numbers)}–${Math.max(...numbers)}`;
    return hasIntroduction ? `Introduction + ${range}` : range;
  }

  function defaultReadingIndex() {
    if (settings?.last_reading_id) {
      const last = plan.readings.findIndex((reading) => reading.id === resolveReadingId(settings.last_reading_id));
      if (last >= 0 && !readingComplete(plan.readings[last])) return last;
    }
    const firstIncomplete = plan.readings.findIndex((reading) => !readingComplete(reading));
    return firstIncomplete >= 0 ? firstIncomplete : plan.readings.length - 1;
  }

  function showView(name, focusMain = false) {
    activeView = name;
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    render();
    if (focusMain) {
      document.getElementById("journey-main").focus({ preventScroll: true });
      window.scrollTo({ top: document.querySelector(".journey-nav").offsetTop, behavior: "smooth" });
    }
  }

  async function updateLastReading(readingId) {
    if (!session || !settings || settings.last_reading_id === readingId) return;
    settings.last_reading_id = readingId;
    const { error } = await db.from("conflict_journey_settings").upsert({
      user_id: session.user.id,
      plan_id: CONFIG.planId,
      start_date: settings.start_date,
      schedule_mode: settings.schedule_mode,
      last_reading_id: readingId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,plan_id" });
    if (error) console.warn("Could not update current reading", error.message);
  }

  function goToReading(index, view = "readings") {
    currentIndex = Math.max(0, Math.min(Number(index), plan.readings.length - 1));
    activeBook = currentReading().code;
    updateLastReading(currentReading().id);
    showView(view, true);
  }

  function reviewFlag(reading) {
    if (!reading.reviewNote) return "";
    return `<p class="source-flag"><span aria-hidden="true">△</span><span><strong>Source reference needs review.</strong><br>${escapeHTML(reading.reviewNote)}</span></p>`;
  }

  function sourceTaskLinks(reading, kind, tasks) {
    const style = kind === "bible" ? "button-primary" : "button-secondary";
    const label = kind === "bible" ? "Scripture chapter choices" : "Companion chapter choices";
    if (!tasks?.length) return `<button class="button ${style}" type="button" disabled>${kind === "bible" ? "No Scripture listed" : "No companion reading listed"}</button>`;
    const taskList = `<div class="source-task-list" aria-label="${label}">${tasks.map((task) => {
      const taskTitle = kind === "commentary" && task.title ? task.title : task.label;
      const linkLabel = kind === "commentary" ? taskTitle.replace(/^Read\s+/i, "") : task.label;
      const action = kind === "bible"
        ? `<button class="button ${style} source-task" type="button" data-native-bible-task="${escapeHTML(task.label)}" data-plan-id="${escapeHTML(CONFIG.planId)}" data-reading-id="${escapeHTML(reading.id)}" data-open-source="bible" aria-label="Read ${escapeHTML(taskTitle.replace(/^Read\s+/i, ""))} here">${escapeHTML(linkLabel)}</button>`
        : `<a class="button ${style} source-task" href="${escapeHTML(task.url)}" target="_blank" rel="noopener noreferrer" data-open-source="commentary" data-reading-id="${reading.id}" aria-label="Read ${escapeHTML(taskTitle.replace(/^Read\s+/i, ""))} on EGW Writings">${escapeHTML(linkLabel)} <span>↗</span></a>`;
      return `<div class="source-task-row"><input class="chapter-checkbox" type="checkbox" data-chapter-progress="${task.progressIndex}" data-reading-id="${reading.id}" aria-label="Mark ${escapeHTML(taskTitle.replace(/^Read\s+/i, ""))} complete" ${chapterCompleted.has(task.progressIndex) ? "checked" : ""}>${action}</div>`;
    }).join("")}</div>`;
    if (kind === "commentary") return taskList;
    return `<div data-native-bible-group>${taskList}<div class="nbr-inline-reader" data-native-bible-mount data-plan-id="${escapeHTML(CONFIG.planId)}" data-reading-id="${escapeHTML(reading.id)}"><p class="nbr-empty">Choose a Scripture passage to read it here.</p></div></div>`;
  }

  function renderReadings() {
    const reading = currentReading();
    const scriptureActions = sourceTaskLinks(reading, "bible", reading.bibleTasks);
    const commentaryActions = sourceTaskLinks(reading, "commentary", reading.commentaryTasks);
    const commentaryPages = companionPageSummary(reading);
    const scriptureCard = reading.bibleReference ? `
            <article class="reading-card scripture-card">
              <div class="card-kicker"><span>THE BIBLE</span><span class="source-order">READ FIRST</span></div>
              <h3>${escapeHTML(reading.bibleReference)}</h3>
              <div class="reading-actions">
                ${scriptureActions}
              </div>
              ${reviewFlag(reading)}
            </article>` : "";
    const companionCard = reading.commentaryCitation ? `
            <article class="reading-card companion-card${reading.bibleReference ? "" : " companion-only"}">
              <div class="card-kicker"><span>${escapeHTML(reading.commentaryBook).toUpperCase()}</span><span class="source-order">COMPANION READING</span></div>
              ${commentaryPages ? `<p class="citation">${escapeHTML(commentaryPages)}</p>` : ""}
              <div class="reading-actions">
                ${commentaryActions}
              </div>
              ${reading.bibleReference ? "" : reviewFlag(reading)}
            </article>` : "";
    return `
      <section aria-labelledby="readings-heading">
        <header class="view-heading">
          <div>
            <p class="eyebrow">CONFLICT OF THE AGES</p>
            <h2 id="readings-heading" class="chapter-heading">${companionHeading(reading)}</h2>
          </div>
          <div class="reading-switcher" aria-label="Reading navigation">
            <button class="icon-button nav-button" type="button" data-day-nav="prev" ${currentIndex === 0 ? "disabled" : ""}>Previous</button>
            <span class="reading-number"><small>${Math.round((completedCount() / plan.readings.length) * 100)}% COMPLETE</small></span>
            <button class="icon-button nav-button" type="button" data-day-nav="next" ${currentIndex === plan.readings.length - 1 ? "disabled" : ""}>Next</button>
          </div>
        </header>

        <div class="readings-grid">
          <div class="reading-stack nbr-full-width">
            ${scriptureCard}
            ${companionCard}
          </div>
        </div>
      </section>`;
  }

  function renderJourney() {
    const bookSections = plan.books.map((book) => {
      const readings = plan.readings.filter((reading) => reading.code === book.code);
      const complete = completedCount(book.code);
      const percent = Math.round((complete / readings.length) * 100);
      const isOpen = activeBook === book.code;
      return `<section class="book-section">
        <button class="book-summary" type="button" data-book="${book.code}" aria-expanded="${isOpen}">
          <span class="book-badge">${book.code}</span>
          <span><h3>${escapeHTML(book.title)}</h3><p>${escapeHTML(bookChapterRange(readings))}</p></span>
          <span class="book-progress"><span class="progress-track"><i style="width:${percent}%"></i></span><small>${complete} of ${readings.length} complete · ${percent}%</small></span>
        </button>
        <div class="reading-list" ${isOpen ? "" : "hidden"}>
          ${readings.map((reading) => {
            const complete = readingComplete(reading);
            return `<button class="journey-reading ${complete ? "done" : ""}" type="button" data-reading-index="${reading.day - 1}"><span class="reading-check" aria-hidden="true">${complete ? "✓" : ""}</span><span><strong>${companionHeading(reading, "journey-chapter-title")}</strong><small>${escapeHTML(reading.bibleReference ? `Scripture: ${reading.bibleReference}` : `${reading.commentaryBook} companion chapter`)}</small></span><em>${reading.reviewNote ? "Needs review △" : "Open →"}</em></button>`;
          }).join("")}
        </div>
      </section>`;
    }).join("");

    return `<section aria-labelledby="journey-heading"><header class="view-heading"><div><p class="eyebrow">THE COMPLETE STORY</p><h2 id="journey-heading">Your journey</h2><p>Every pairing appears in the order supplied. Open a book to revisit any reading, with completed readings visible at a glance.</p></div></header><div class="book-grid">${bookSections}</div></section>`;
  }

  function bestStreak() {
    let best = 0;
    let current = 0;
    for (const reading of plan.readings) {
      if (readingComplete(reading)) { current += 1; best = Math.max(best, current); }
      else current = 0;
    }
    return best;
  }

  function renderProgress() {
    const completed = completedCount();
    const bibleComplete = plan.readings.filter((reading) => reading.bibleReference && taskGroupComplete(reading, "bible")).length;
    const commentaryComplete = plan.readings.filter((reading) => reading.commentaryCitation && taskGroupComplete(reading, "commentary")).length;
    return `<section aria-labelledby="progress-heading"><header class="view-heading"><div><p class="eyebrow">YOUR READING JOURNEY</p><h2 id="progress-heading">Progress</h2><p>${session ? "Your completion state is saved to your account and available on every signed-in device." : "This preview starts at zero. Sign in to save your completion state across devices."}</p></div></header>
      <div class="stat-grid"><article class="stat-card"><strong>${Math.round((completed / plan.readings.length) * 100)}%</strong><span>Journey complete</span></article><article class="stat-card"><strong>${completed}</strong><span>Complete readings</span></article><article class="stat-card"><strong>${window.TJMNativeBible?.getHighlights().length || 0}</strong><span>Bible highlights</span></article><article class="stat-card"><strong>${bestStreak()}</strong><span>Best reading run</span></article></div>
      <div class="progress-layout"><article class="progress-panel"><h3>By companion book</h3>${plan.books.map((book) => { const count = completedCount(book.code); const percent = Math.round(count / book.readingCount * 100); return `<div class="book-progress-row"><header><span>${escapeHTML(book.shortTitle)}</span><span>${count}/${book.readingCount}</span></header><span class="progress-track"><i style="width:${percent}%"></i></span></div>`; }).join("")}<p style="color:#81767e;font-size:9px;line-height:1.6">${bibleComplete} Scripture assignments and ${commentaryComplete} companion assignments marked complete.</p><details class="review-queue"><summary>${plan.reviewQueue.length} supplied references in the review queue</summary>${plan.reviewQueue.map((item) => { const reading = plan.readings.find((entry) => entry.day === item.day); return `<div class="review-item"><strong>${escapeHTML(reading ? companionIdentity(reading) : "Source entry")}</strong><br>${escapeHTML(item.reviewNote)}</div>`; }).join("")}</details></article>
      <article class="progress-panel"><h3>Your Bible notes</h3><p>Use the floating Notes button to review every highlighted passage and private note.</p></article></div>
    </section>`;
  }

  function render() {
    if (!plan) return;
    let content;
    if (activeView === "readings") content = renderReadings();
    else if (activeView === "journey") content = renderJourney();
    else if (activeView === "progress") content = renderProgress();
    else content = renderReadings();
    root.innerHTML = `${guestBanner()}${content}`;
    window.TJMNativeBible?.enhance(root);
  }

  function migrateLegacyChapterProgress() {
    const migrated = new Set();
    for (const reading of plan.readings) {
      const saved = readingProgress(reading);
      if (saved.bible_complete) for (const task of reading.bibleTasks ?? []) migrated.add(task.progressIndex);
      if (saved.commentary_complete) for (const task of reading.commentaryTasks ?? []) migrated.add(task.progressIndex);
    }
    return migrated;
  }

  async function syncAggregateReadingProgress(reading) {
    const previous = readingProgress(reading);
    const bibleComplete = taskGroupComplete(reading, "bible");
    const commentaryComplete = taskGroupComplete(reading, "commentary");
    const completedAt = bibleComplete && commentaryComplete ? (previous.completed_at || new Date().toISOString()) : null;
    const next = { ...previous, bible_complete: bibleComplete, commentary_complete: commentaryComplete, completed_at: completedAt };
    progress.set(reading.id, next);
    const { data, error } = await db.from("conflict_reading_progress").upsert({
      user_id: session.user.id,
      plan_id: CONFIG.planId,
      reading_id: reading.id,
      bible_complete: bibleComplete,
      commentary_complete: commentaryComplete,
      bible_opened_at: next.bible_opened_at || null,
      commentary_opened_at: next.commentary_opened_at || null,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,plan_id,reading_id" }).select().single();
    if (error) console.warn("Could not update legacy reading completion", error.message);
    else progress.set(reading.id, data);
  }

  async function toggleChapter(progressIndex, readingId, checked) {
    if (!session) { showSignIn(); return; }
    const chapterIndex = Number(progressIndex);
    const reading = plan.readings.find((item) => item.id === readingId);
    if (!reading || !Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterIndex >= chapterTaskCount) return;
    const previous = new Set(chapterCompleted);
    if (checked) chapterCompleted.add(chapterIndex);
    else chapterCompleted.delete(chapterIndex);
    currentIndex = reading.day - 1;
    setSync("Saving…", "saving");
    render();
    const { error } = await db.from("reading_plan_progress").upsert({
      user_id: session.user.id,
      plan_id: CHAPTER_PROGRESS_PLAN_ID,
      completed_indices: Array.from(chapterCompleted).sort((left, right) => left - right),
      last_index: currentIndex,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,plan_id" });
    if (error) {
      chapterCompleted = previous;
      setSync("Sync failed", "error");
      toast(error.message, "error");
      render();
      return;
    }
    await syncAggregateReadingProgress(reading);
    updateLastReading(reading.id);
    setSync("Synced across devices", "synced");
    render();
  }

  async function saveReadingProgress(readingId, field, value) {
    const reading = plan.readings.find((item) => item.id === readingId);
    if (!reading || !session) return;
    const previous = readingProgress(reading);
    const next = { ...previous, [field]: value, reading_id: readingId };
    const bibleDone = !reading.bibleReference || Boolean(next.bible_complete);
    const commentaryDone = !reading.commentaryCitation || Boolean(next.commentary_complete);
    next.completed_at = bibleDone && commentaryDone ? (previous.completed_at || new Date().toISOString()) : null;
    progress.set(readingId, next);
    setSync("Saving…", "saving");
    render();
    const { data, error } = await db.from("conflict_reading_progress").upsert({
      user_id: session.user.id,
      plan_id: CONFIG.planId,
      reading_id: readingId,
      bible_complete: Boolean(next.bible_complete),
      commentary_complete: Boolean(next.commentary_complete),
      bible_opened_at: next.bible_opened_at || null,
      commentary_opened_at: next.commentary_opened_at || null,
      completed_at: next.completed_at,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,plan_id,reading_id" }).select().single();
    if (error) {
      progress.set(readingId, previous);
      setSync("Sync failed", "error");
      toast(error.message, "error");
      render();
      return;
    }
    progress.set(readingId, data);
    setSync("Synced across devices", "synced");
    render();
  }

  async function recordOpen(readingId, kind) {
    const reading = plan.readings.find((item) => item.id === readingId);
    if (!reading || !session) return;
    const previous = readingProgress(reading);
    const field = kind === "bible" ? "bible_opened_at" : "commentary_opened_at";
    if (previous[field]) return;
    await saveReadingProgress(readingId, field, new Date().toISOString());
  }

  async function loadMemberData() {
    setSync("Syncing your journey…", "saving");
    const userId = session.user.id;
    const [progressResult, chapterProgressResult, settingsResult] = await Promise.all([
      db.from("conflict_reading_progress").select("*").eq("user_id", userId).eq("plan_id", CONFIG.planId),
      db.from("reading_plan_progress").select("completed_indices,last_index").eq("user_id", userId).eq("plan_id", CHAPTER_PROGRESS_PLAN_ID).maybeSingle(),
      db.from("conflict_journey_settings").select("*").eq("user_id", userId).eq("plan_id", CONFIG.planId).maybeSingle(),
    ]);
    const firstError = [progressResult, chapterProgressResult, settingsResult].find((result) => result.error)?.error;
    if (firstError) throw firstError;
    progress = new Map((progressResult.data ?? []).map((row) => [row.reading_id, row]));
    settings = settingsResult.data;
    if (!settings) {
      const { data, error } = await db.from("conflict_journey_settings").insert({
        user_id: userId,
        plan_id: CONFIG.planId,
        start_date: isoDate(new Date()),
        schedule_mode: "pace",
        last_reading_id: plan.readings[0].id,
      }).select().single();
      if (error) throw error;
      settings = data;
    }
    const savedChapterIndices = chapterProgressResult.data?.completed_indices;
    if (Array.isArray(savedChapterIndices)) {
      chapterCompleted = new Set(savedChapterIndices.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < chapterTaskCount));
    } else {
      chapterCompleted = migrateLegacyChapterProgress();
      const migratedLastIndex = Math.max(0, plan.readings.findIndex((reading) => reading.id === settings.last_reading_id));
      const { error } = await db.from("reading_plan_progress").upsert({
        user_id: userId,
        plan_id: CHAPTER_PROGRESS_PLAN_ID,
        completed_indices: Array.from(chapterCompleted).sort((left, right) => left - right),
        last_index: migratedLastIndex,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,plan_id" });
      if (error) throw error;
    }
    currentIndex = defaultReadingIndex();
    activeBook = currentReading().code;
    setSync("Synced across devices", "synced");
  }

  function updateProfile() {
    if (!session) { profileButton.hidden = true; return; }
    const name = displayName();
    const avatar = avatarUrl();
    document.getElementById("profile-name").textContent = name.split(" ")[0] || "Member";
    document.getElementById("profile-initial").textContent = initials(name);
    document.getElementById("account-email").textContent = session.user.email || "Signed in with Google";
    const image = document.getElementById("profile-avatar");
    if (avatar) { image.src = avatar; image.hidden = false; document.getElementById("profile-initial").hidden = true; }
    else { image.hidden = true; document.getElementById("profile-initial").hidden = false; }
    profileButton.hidden = false;
  }

  async function applySession(nextSession) {
    session = nextSession;
    accountMenu.hidden = true;
    updateProfile();
    if (!session) {
      progress = new Map();
      chapterCompleted = new Set();
      settings = guestSettings();
      currentIndex = 0;
      clearInterval(refreshTimer);
      authGate.hidden = guestBrowsing;
      headerSignIn.hidden = !guestBrowsing;
      setSync(guestBrowsing ? "Viewing only — not saved" : "Sign in to save progress");
      render();
      window.TJMNativeBible?.syncHighlights();
      return;
    }
    guestBrowsing = false;
    authGate.hidden = true;
    headerSignIn.hidden = true;
    try {
      await loadMemberData();
      render();
      await window.TJMNativeBible?.syncHighlights();
      scheduleRefresh();
    } catch (error) {
      console.error(error);
      setSync("Backend setup required", "error");
      authError.textContent = "Your Google sign-in worked, but the reading-plan database has not been installed yet. The site owner must run the included Supabase migration.";
      authGate.hidden = false;
    }
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
      if (document.visibilityState !== "visible" || !session) return;
      try { await Promise.all([loadMemberData(), window.TJMNativeBible?.syncHighlights()]); render(); } catch (error) { console.warn("Background sync", error.message); }
    }, 60000);
  }

  async function signInGoogle() {
    authError.textContent = "";
    signInButton.disabled = true;
    signInButton.lastChild.textContent = " Connecting…";
    try {
      if (!db?.auth) throw new Error("The secure account service is still loading. Please refresh and try again.");
      const redirectTo = CONFIG.siteUrl || `${location.origin}${location.pathname}`;
      const { error } = await db.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Google sign-in", error);
      authError.textContent = error?.message || "Google sign-in could not be started. Please refresh and try again.";
      signInButton.disabled = false;
      signInButton.lastChild.textContent = " Continue with Google";
    }
  }

  document.querySelector(".journey-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button) showView(button.dataset.view, true);
  });

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target) return;
    if (target.hasAttribute("data-require-sign-in")) showSignIn();
    else if (target.dataset.dayNav) goToReading(currentIndex + (target.dataset.dayNav === "next" ? 1 : -1));
    else if (target.dataset.readingIndex) goToReading(Number(target.dataset.readingIndex));
    else if (target.dataset.book) { activeBook = activeBook === target.dataset.book ? "" : target.dataset.book; render(); }
    else if (target.dataset.viewShortcut) showView(target.dataset.viewShortcut, true);
    else if (target.dataset.openSource) recordOpen(target.dataset.readingId, target.dataset.openSource);
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-chapter-progress]")) {
      if (!session) target.checked = false;
      toggleChapter(target.dataset.chapterProgress, target.dataset.readingId, target.checked);
    }
  });

  profileButton.addEventListener("click", () => {
    const opening = accountMenu.hidden;
    accountMenu.hidden = !opening;
    profileButton.setAttribute("aria-expanded", String(opening));
  });
  document.getElementById("sign-out").addEventListener("click", async () => { guestBrowsing = false; await db.auth.signOut(); });
  signInButton.addEventListener("click", signInGoogle);
  guestButton.addEventListener("click", () => {
    guestBrowsing = true;
    authError.textContent = "";
    authGate.hidden = true;
    headerSignIn.hidden = false;
    settings = guestSettings();
    setSync("Viewing only — not saved");
    render();
  });
  headerSignIn.addEventListener("click", showSignIn);
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && session) {
      try { await Promise.all([loadMemberData(), window.TJMNativeBible?.syncHighlights()]); render(); } catch (error) { console.warn(error.message); }
    }
  });

  async function init() {
    try {
      const response = await fetch(PLAN_PATH, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Reading plan could not be loaded (${response.status}).`);
      plan = await response.json();
      const readingsAreValid = Array.isArray(plan.readings) && plan.readings.length > 0;
    const declaredReadingCount = Array.isArray(plan.books)
      ? plan.books.reduce((total, book) => total + (Number(book.readingCount) || 0), 0)
      : readingsAreValid ? plan.readings.length : 0;
    const readingSequenceIsValid = readingsAreValid
      && declaredReadingCount === plan.readings.length
      && new Set(plan.readings.map((reading) => reading.id)).size === plan.readings.length
      && plan.readings.every((reading, index) => reading?.id && reading.day === index + 1);
    if (plan.planId !== CONFIG.planId || !readingSequenceIsValid) throw new Error("Reading plan validation failed.");
      prepareChapterProgressIndex();
      if (chapterTaskCount !== 1696) throw new Error("Chapter progress validation failed.");
      document.getElementById("hero-reading-count").textContent = plan.readings.length;
      window.TJMNativeBible.configure({ getDb: () => db, getSession: () => session, toast, planId: CONFIG.planId });
      loading.hidden = true;
      root.hidden = false;
      render();
      if (!window.supabase?.createClient) throw new Error("The secure account service could not be loaded. Please refresh and try again.");
      db = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } });
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      await applySession(data.session);
      db.auth.onAuthStateChange((_event, nextSession) => {
        if (nextSession?.access_token === session?.access_token) return;
        setTimeout(() => applySession(nextSession), 0);
      });
    } catch (error) {
      console.error(error);
      loading.innerHTML = `<strong>We could not prepare the journey.</strong><p>${escapeHTML(error.message)}</p><button class="button button-primary" type="button" onclick="location.reload()">Try again</button>`;
      authError.textContent = error.message;
      authGate.hidden = false;
    }
  }

  init();
})();
