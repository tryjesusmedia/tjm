(() => {
  "use strict";

  const CONFIG = window.TJM_CONFLICT_CONFIG;
  const PLAN_PATH = "data/readings.json";
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
  let principles = [];
  let posts = [];
  let replies = [];
  let activeView = "today";
  let currentIndex = 0;
  let activeBook = "PP";
  let calendarMonth = startOfMonth(new Date());
  let principleSearch = "";
  let selectedMembersPrincipleId = "";
  let refreshTimer = null;

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

  function parseDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 12);
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function differenceInDays(left, right) {
    const a = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
    const b = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
    return Math.round((a - b) / 86400000);
  }

  function formatDate(date, options = {}) {
    return new Intl.DateTimeFormat(undefined, options).format(date);
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
    return `<aside class="save-banner" aria-label="Saving requires sign-in"><div><strong>Viewing without an account</strong><span>You can explore every reading, but progress, principles, cross-references, and discussion activity are saved only after you sign in.</span></div><button class="button button-primary" type="button" data-require-sign-in>Sign in to save</button></aside>`;
  }

  function readingProgress(reading) {
    return progress.get(reading.id) ?? {
      reading_id: reading.id,
      bible_complete: false,
      commentary_complete: false,
    };
  }

  function readingComplete(reading) {
    const saved = readingProgress(reading);
    const bibleDone = !reading.bibleReference || Boolean(saved.bible_complete);
    const commentaryDone = !reading.commentaryCitation || Boolean(saved.commentary_complete);
    return bibleDone && commentaryDone;
  }

  function completedCount(code = null) {
    return plan.readings.filter((reading) => (!code || reading.code === code) && readingComplete(reading)).length;
  }

  function currentReading() {
    return plan.readings[Math.max(0, Math.min(currentIndex, plan.readings.length - 1))];
  }

  function defaultReadingIndex() {
    if (settings?.last_reading_id) {
      const last = plan.readings.findIndex((reading) => reading.id === settings.last_reading_id);
      if (last >= 0 && !readingComplete(plan.readings[last])) return last;
    }
    const firstIncomplete = plan.readings.findIndex((reading) => !readingComplete(reading));
    return firstIncomplete >= 0 ? firstIncomplete : plan.readings.length - 1;
  }

  function nextPrincipleNumber() {
    return principles.reduce((max, principle) => Math.max(max, Number(principle.principle_number) || 0), 0) + 1;
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

  function goToReading(index, view = "today") {
    currentIndex = Math.max(0, Math.min(Number(index), plan.readings.length - 1));
    activeBook = currentReading().code;
    updateLastReading(currentReading().id);
    showView(view, true);
  }

  function reviewFlag(reading) {
    if (!reading.reviewNote) return "";
    return `<p class="source-flag"><span aria-hidden="true">△</span><span><strong>Source reference needs review.</strong><br>${escapeHTML(reading.reviewNote)}</span></p>`;
  }

  function exactSource(reading, dark = false) {
    return `<details class="source-exact${dark ? " dark" : ""}"><summary>View supplied source entry</summary><pre>${escapeHTML(reading.sourceEntry)}</pre></details>`;
  }

  function completeToggle(reading, field, checked, label) {
    if (!session) return `<button class="button button-secondary" type="button" data-require-sign-in>Sign in to save progress</button>`;
    return `<label class="complete-toggle"><input type="checkbox" data-progress-field="${field}" data-reading-id="${reading.id}" ${checked ? "checked" : ""}><i></i><span>${escapeHTML(label)}</span></label>`;
  }

  function renderToday() {
    const reading = currentReading();
    const saved = readingProgress(reading);
    const dayPrinciples = principles.filter((principle) => principle.reading_id === reading.id);
    const scriptureAction = reading.bibleUrl
      ? `<a class="button button-primary" href="${escapeHTML(reading.bibleUrl)}" target="_blank" rel="noopener noreferrer" data-open-source="bible" data-reading-id="${reading.id}">Read Scripture <span>↗</span></a>`
      : `<button class="button button-primary" type="button" disabled>${reading.bibleReference ? "Awaiting reference review" : "No Scripture listed"}</button>`;
    const commentaryAction = reading.commentaryCitation
      ? `<a class="button button-secondary" href="${escapeHTML(reading.commentaryUrl)}" target="_blank" rel="noopener noreferrer" data-open-source="commentary" data-reading-id="${reading.id}">Read free on EGW Writings <span>↗</span></a>`
      : `<button class="button button-secondary" type="button" disabled>No companion reading listed</button>`;
    const principlePanel = session ? `
          <aside class="principle-panel" aria-labelledby="principle-heading">
            <p class="eyebrow">YOUR PRIVATE DISCOVERY</p>
            <h3 id="principle-heading">What principles do you see after today’s reading?</h3>
            <p>Write one principle at a time. It receives a permanent number you can connect to discoveries anywhere else in the journey.</p>
            <form id="principle-form">
              <div class="principle-number">PRINCIPLE <strong>#${nextPrincipleNumber()}</strong></div>
              <div class="field">
                <label for="principle-body">The principle I see</label>
                <textarea id="principle-body" maxlength="2000" required placeholder="In my own words…"></textarea>
              </div>
              <div class="field">
                <label for="cross-references">Related principle numbers</label>
                <input id="cross-references" inputmode="numeric" maxlength="120" placeholder="12, 19, 42">
                <small>Separate numbers with commas. Existing numbers become clickable connections.</small>
              </div>
              <div class="panel-actions"><button class="button button-primary" type="submit">Save principle</button></div>
            </form>
            <div class="principles-for-day">
              <strong>${dayPrinciples.length ? `${dayPrinciples.length} saved for this reading` : "No principles saved for this reading yet"}</strong>
              ${dayPrinciples.map((principle) => principleMini(principle, true)).join("")}
            </div>
          </aside>` : `
          <aside class="principle-panel" aria-labelledby="principle-heading">
            <p class="eyebrow">YOUR PRIVATE DISCOVERY</p>
            <h3 id="principle-heading">Save numbered principles and cross-references</h3>
            <p>You can read the entire journey without an account. Sign in with Google when you want to save your own numbered discoveries and connect them across readings.</p>
            <button class="button button-primary" type="button" data-require-sign-in>Sign in to save principles</button>
          </aside>`;

    return `
      <section aria-labelledby="today-heading">
        <header class="view-heading">
          <div>
            <p class="eyebrow">${escapeHTML(reading.commentaryBook)} · READING ${reading.day} OF ${plan.readings.length}</p>
            <h2 id="today-heading">${escapeHTML(reading.title)}</h2>
            <p>${settings?.schedule_mode === "calendar" ? `Scheduled for ${escapeHTML(formatDate(addDays(parseDate(settings.start_date), reading.day - 1), { weekday: "long", month: "long", day: "numeric" }))}.` : "Move at your own pace. Your next unfinished reading will be waiting whenever you return."}</p>
          </div>
          <div class="day-switcher" aria-label="Reading navigation">
            <button class="icon-button" type="button" data-day-nav="prev" aria-label="Previous reading" ${currentIndex === 0 ? "disabled" : ""}>‹</button>
            <span class="day-pill"><strong>Day ${reading.day}</strong><small>${Math.round((completedCount() / plan.readings.length) * 100)}% COMPLETE</small></span>
            <button class="icon-button" type="button" data-day-nav="next" aria-label="Next reading" ${currentIndex === plan.readings.length - 1 ? "disabled" : ""}>›</button>
          </div>
        </header>

        <div class="today-grid">
          <div class="reading-stack">
            <article class="reading-card scripture-card">
              <div class="card-kicker"><span>THE BIBLE</span><span class="source-order">READ FIRST</span></div>
              <h3>${escapeHTML(reading.bibleReference || "No Scripture passage listed")}</h3>
              <p class="citation">${reading.bibleReference ? "Open the exact supplied passage on Bible Gateway (KJV), then return to record what you discovered." : "This source entry contains only a Conflict of the Ages assignment. The omission is preserved exactly as supplied."}</p>
              <div class="reading-actions">
                ${scriptureAction}
                ${reading.bibleReference ? completeToggle(reading, "bible_complete", saved.bible_complete, "Scripture complete") : ""}
              </div>
              ${reviewFlag(reading)}
              ${exactSource(reading, true)}
            </article>

            <article class="reading-card companion-card">
              <div class="card-kicker"><span>CONFLICT OF THE AGES</span><span class="source-order">COMPANION READING</span></div>
              <h3>${escapeHTML(reading.commentaryBook)}</h3>
              <p class="citation">${escapeHTML(reading.commentaryCitation || "No companion reading was listed in this source entry.")}</p>
              <div class="reading-actions">
                ${commentaryAction}
                ${reading.commentaryCitation ? completeToggle(reading, "commentary_complete", saved.commentary_complete, "Companion complete") : ""}
              </div>
            </article>
          </div>

          ${principlePanel}
        </div>
      </section>`;
  }

  function principleMini(principle, shareButton = false) {
    const references = (principle.cross_reference_numbers ?? []).map((number) => `<button type="button" class="reference-chip" data-find-principle="${number}">#${number}</button>`).join("");
    return `<article class="principle-mini"><b>PRINCIPLE #${principle.principle_number}</b><p>${escapeHTML(principle.body)}</p>${references ? `<div class="reference-chips">${references}</div>` : ""}${shareButton ? `<button class="button button-secondary" type="button" data-share-principle="${principle.id}" style="margin-top:10px">Share my finding</button>` : ""}</article>`;
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
          <span><h3>${escapeHTML(book.title)}</h3><p>${readings[0].day === readings.at(-1).day ? `Reading ${readings[0].day}` : `Readings ${readings[0].day}–${readings.at(-1).day}`}</p></span>
          <span class="book-progress"><span class="progress-track"><i style="width:${percent}%"></i></span><small>${complete} of ${readings.length} complete · ${percent}%</small></span>
        </button>
        <div class="reading-list" ${isOpen ? "" : "hidden"}>
          ${readings.map((reading) => {
            const complete = readingComplete(reading);
            return `<button class="journey-reading ${complete ? "done" : ""}" type="button" data-reading-index="${reading.day - 1}"><span class="reading-check" aria-hidden="true">${complete ? "✓" : ""}</span><span><strong>Day ${reading.day} · ${escapeHTML(reading.title)}</strong><small>${escapeHTML(reading.bibleReference || reading.commentaryCitation)}</small></span><em>${reading.reviewNote ? "Needs review △" : "Open →"}</em></button>`;
          }).join("")}
        </div>
      </section>`;
    }).join("");

    return `<section aria-labelledby="journey-heading"><header class="view-heading"><div><p class="eyebrow">THE COMPLETE STORY</p><h2 id="journey-heading">Your journey</h2><p>Every pairing appears in the order supplied. Open a book to revisit any reading, with completed days visible at a glance.</p></div></header><div class="book-grid">${bookSections}</div></section>`;
  }

  function renderCalendar() {
    const monthStart = calendarMonth;
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12);
    const firstWeekday = monthStart.getDay();
    const cells = [];
    for (let index = 0; index < firstWeekday; index += 1) cells.push(`<span class="calendar-day is-empty"></span>`);
    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 12);
      const readingIndex = differenceInDays(date, parseDate(settings.start_date));
      const reading = plan.readings[readingIndex];
      const today = isoDate(date) === isoDate(new Date());
      cells.push(`<button class="calendar-day ${today ? "is-today" : ""} ${reading && readingComplete(reading) ? "is-complete" : ""}" type="button" ${reading ? `data-reading-index="${readingIndex}"` : "disabled"}><strong>${day}</strong><span>${reading ? `Day ${reading.day}<br>${escapeHTML(reading.bibleReference || reading.commentaryCode)}` : "Outside journey"}</span></button>`);
    }

    return `<section aria-labelledby="calendar-heading"><header class="view-heading"><div><p class="eyebrow">A CALM VIEW OF THE DAYS</p><h2 id="calendar-heading">Calendar</h2><p>Choose a fixed calendar or move at your own pace. Changing the mode never removes completed readings or principles.</p></div></header>
      <div class="toolbar">
        <div class="mode-toggle" aria-label="Reading schedule mode"><button type="button" data-mode="pace" class="${settings.schedule_mode === "pace" ? "active" : ""}">My pace</button><button type="button" data-mode="calendar" class="${settings.schedule_mode === "calendar" ? "active" : ""}">Calendar mode</button></div>
        <label class="field" style="margin:0"><span class="eyebrow" style="margin:0">START DATE</span><input id="start-date" type="date" value="${escapeHTML(settings.start_date)}"></label>
      </div>
      <div class="calendar-shell"><div class="calendar-header"><button class="icon-button" type="button" data-calendar="prev" aria-label="Previous month">‹</button><h3>${escapeHTML(formatDate(monthStart, { month: "long", year: "numeric" }))}</h3><button class="icon-button" type="button" data-calendar="next" aria-label="Next month">›</button></div><div class="calendar-grid">${["SUN","MON","TUE","WED","THU","FRI","SAT"].map((day) => `<span class="weekday">${day}</span>`).join("")}${cells.join("")}</div></div>
    </section>`;
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
    const bibleComplete = plan.readings.filter((reading) => reading.bibleReference && readingProgress(reading).bible_complete).length;
    const commentaryComplete = plan.readings.filter((reading) => reading.commentaryCitation && readingProgress(reading).commentary_complete).length;
    const filteredPrinciples = principles.filter((principle) => `${principle.principle_number} ${principle.body} ${(principle.cross_reference_numbers ?? []).join(" ")}`.toLowerCase().includes(principleSearch.toLowerCase()));
    return `<section aria-labelledby="progress-heading"><header class="view-heading"><div><p class="eyebrow">EVERY DISCOVERY IN ONE PLACE</p><h2 id="progress-heading">Progress & principles</h2><p>${session ? "Your completion state and private principle index are saved to the same account used by the Try Jesus app." : "This preview starts at zero. Sign in to save your completion state and private principle index across the website and app."}</p></div></header>
      <div class="stat-grid"><article class="stat-card"><strong>${Math.round((completed / plan.readings.length) * 100)}%</strong><span>Journey complete</span></article><article class="stat-card"><strong>${completed}</strong><span>Complete readings</span></article><article class="stat-card"><strong>${principles.length}</strong><span>Personal principles</span></article><article class="stat-card"><strong>${bestStreak()}</strong><span>Best reading run</span></article></div>
      <div class="progress-layout"><article class="progress-panel"><h3>By companion book</h3>${plan.books.map((book) => { const count = completedCount(book.code); const percent = Math.round(count / book.readingCount * 100); return `<div class="book-progress-row"><header><span>${escapeHTML(book.shortTitle)}</span><span>${count}/${book.readingCount}</span></header><span class="progress-track"><i style="width:${percent}%"></i></span></div>`; }).join("")}<p style="color:#81767e;font-size:9px;line-height:1.6">${bibleComplete} Scripture assignments and ${commentaryComplete} companion assignments marked complete.</p><details class="review-queue"><summary>${plan.reviewQueue.length} supplied references in the review queue</summary>${plan.reviewQueue.map((item) => `<div class="review-item"><strong>Day ${item.day}</strong><br>${escapeHTML(item.reviewNote)}</div>`).join("")}</details></article>
      <article class="progress-panel"><h3>My principle index</h3><div class="toolbar"><input id="principle-search" type="search" value="${escapeHTML(principleSearch)}" placeholder="Search number, words, or cross-reference"></div><div class="principle-index">${filteredPrinciples.length ? filteredPrinciples.map((principle) => `<article class="principle-index-card" id="principle-${principle.principle_number}"><header><b>PRINCIPLE #${principle.principle_number} · DAY ${plan.readings.find((reading) => reading.id === principle.reading_id)?.day ?? "—"}</b><button type="button" data-delete-principle="${principle.id}">Delete</button></header><p>${escapeHTML(principle.body)}</p>${(principle.cross_reference_numbers ?? []).length ? `<div class="reference-chips">${principle.cross_reference_numbers.map((number) => `<button type="button" class="reference-chip" data-find-principle="${number}">#${number}</button>`).join("")}</div>` : ""}</article>`).join("") : `<div class="empty-card">${principles.length ? "No principles match this search." : "Your first numbered principle will appear here after you save it from Today."}</div>`}</div></article></div>
    </section>`;
  }

  function renderMembers() {
    if (!session) {
      return `<section aria-labelledby="members-heading"><header class="view-heading"><div><p class="eyebrow">LEARN FROM ONE ANOTHER</p><h2 id="members-heading">Members discussion</h2><p>Sharing is connected to your member identity so the conversation remains thoughtful and accountable.</p></div></header><div class="empty-card"><strong>Sign in to join Members.</strong><p>You can explore the full reading plan without an account. Google sign-in is required only when you want to share a finding, ask a question, or reply.</p><button class="button button-primary" type="button" data-require-sign-in>Sign in to join</button></div></section>`;
    }
    const selected = principles.find((principle) => principle.id === selectedMembersPrincipleId);
    const feed = posts.map((post) => {
      const postReplies = replies.filter((reply) => reply.post_id === post.id);
      const reading = plan.readings.find((item) => item.id === post.reading_id);
      const author = post.author_name || "Try Jesus member";
      return `<article class="member-post"><div class="post-author">${post.author_avatar_url ? `<img class="avatar" src="${escapeHTML(post.author_avatar_url)}" alt="">` : `<span class="avatar">${escapeHTML(initials(author))}</span>`}<span><strong>${escapeHTML(author)}</strong><small>${reading ? `Day ${reading.day} · ` : ""}${escapeHTML(formatDate(new Date(post.created_at), { month: "short", day: "numeric", year: "numeric" }))}</small></span></div>${post.principle_number ? `<blockquote class="post-principle"><b>PRINCIPLE #${post.principle_number}</b><br>${escapeHTML(post.principle_body || "")}</blockquote>` : ""}<p class="post-body">${escapeHTML(post.body)}</p><div class="reply-list">${postReplies.map((reply) => `<div class="reply"><b>${escapeHTML(reply.author_name || "Member")}</b> · ${escapeHTML(reply.body)}</div>`).join("")}</div><form class="reply-form" data-post-id="${post.id}"><input name="reply" maxlength="1000" required aria-label="Reply to ${escapeHTML(author)}" placeholder="Add to the discussion…"><button type="submit">Reply</button></form></article>`;
    }).join("");
    return `<section aria-labelledby="members-heading"><header class="view-heading"><div><p class="eyebrow">LEARN FROM ONE ANOTHER</p><h2 id="members-heading">Members discussion</h2><p>Share a discovery or a sincere question. This space is for thoughtful conversation, not an official answer key.</p></div></header><div class="members-layout"><aside class="share-panel"><p class="eyebrow">SHARE DELIBERATELY</p><h3>Share a finding</h3><p>Your principles are private until you choose one here and post it. Your Google email address is never displayed.</p><form id="post-form"><div class="field"><label for="post-principle">Principle (optional)</label><select id="post-principle"><option value="">Share without a principle</option>${principles.map((principle) => `<option value="${principle.id}" ${selected?.id === principle.id ? "selected" : ""}>#${principle.principle_number} — ${escapeHTML(principle.body.slice(0, 72))}</option>`).join("")}</select></div><div class="field"><label for="post-body">Observation or question</label><textarea id="post-body" minlength="3" maxlength="2000" required placeholder="What did you notice, and what would you like other members to consider?"></textarea><small>This will be visible to signed-in members.</small></div><button class="button button-primary" type="submit">Post to Members</button></form></aside><div class="member-feed">${feed || `<div class="empty-card">No member findings have been shared yet. You can begin the conversation.</div>`}</div></div></section>`;
  }

  function render() {
    if (!plan) return;
    let content;
    if (activeView === "today") content = renderToday();
    else if (activeView === "journey") content = renderJourney();
    else if (activeView === "calendar") content = renderCalendar();
    else if (activeView === "progress") content = renderProgress();
    else content = renderMembers();
    root.innerHTML = `${guestBanner()}${content}`;
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

  function parseCrossReferences(value) {
    return Array.from(new Set(String(value).split(/[^0-9]+/).filter(Boolean).map(Number).filter((number) => Number.isInteger(number) && number > 0))).sort((a, b) => a - b);
  }

  async function createPrinciple(form) {
    const body = form.querySelector("#principle-body").value.trim();
    const crossReferences = parseCrossReferences(form.querySelector("#cross-references").value);
    if (!body) return;
    const unknown = crossReferences.filter((number) => !principles.some((principle) => principle.principle_number === number));
    if (unknown.length) {
      toast(`Principle ${unknown.map((number) => `#${number}`).join(", ")} does not exist yet. Save it later as a cross-reference.`, "error");
      return;
    }
    setSync("Saving principle…", "saving");
    const { data, error } = await db.rpc("create_conflict_principle", {
      p_plan_id: CONFIG.planId,
      p_reading_id: currentReading().id,
      p_body: body,
      p_cross_reference_numbers: crossReferences,
    });
    if (error) { setSync("Sync failed", "error"); toast(error.message, "error"); return; }
    const created = Array.isArray(data) ? data[0] : data;
    if (created) principles.push(created);
    principles.sort((a, b) => a.principle_number - b.principle_number);
    setSync("Principle saved", "synced");
    toast(`Principle #${created?.principle_number ?? nextPrincipleNumber() - 1} saved.`);
    render();
  }

  async function deletePrinciple(id) {
    if (!window.confirm("Delete this private principle? Existing member posts will keep the shared snapshot.")) return;
    const { error } = await db.from("conflict_principles").delete().eq("id", id).eq("user_id", session.user.id);
    if (error) { toast(error.message, "error"); return; }
    principles = principles.filter((principle) => principle.id !== id);
    render();
    toast("Principle deleted.");
  }

  async function createPost(form) {
    const principleId = form.querySelector("#post-principle").value;
    const principle = principles.find((item) => item.id === principleId);
    const body = form.querySelector("#post-body").value.trim();
    if (!body) return;
    const readingId = principle?.reading_id || currentReading().id;
    const { data, error } = await db.from("conflict_discussion_posts").insert({
      user_id: session.user.id,
      plan_id: CONFIG.planId,
      reading_id: readingId,
      principle_id: principle?.id || null,
      principle_number: principle?.principle_number || null,
      principle_body: principle?.body || null,
      body,
      author_name: displayName(),
      author_avatar_url: avatarUrl() || null,
    }).select().single();
    if (error) { toast(error.message, "error"); return; }
    posts.unshift(data);
    selectedMembersPrincipleId = "";
    render();
    toast("Your finding is now visible to members.");
  }

  async function createReply(form) {
    const body = new FormData(form).get("reply")?.toString().trim();
    if (!body) return;
    const { data, error } = await db.from("conflict_discussion_replies").insert({
      post_id: form.dataset.postId,
      user_id: session.user.id,
      body,
      author_name: displayName(),
      author_avatar_url: avatarUrl() || null,
    }).select().single();
    if (error) { toast(error.message, "error"); return; }
    replies.push(data);
    render();
  }

  async function updateSettings(changes) {
    const previous = { ...settings };
    settings = { ...settings, ...changes };
    render();
    if (!session) {
      setSync("Viewing only — not saved");
      toast("This calendar choice is temporary. Sign in to save it across devices.");
      return;
    }
    setSync("Saving settings…", "saving");
    const { data, error } = await db.from("conflict_journey_settings").upsert({
      user_id: session.user.id,
      plan_id: CONFIG.planId,
      start_date: settings.start_date,
      schedule_mode: settings.schedule_mode,
      last_reading_id: settings.last_reading_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,plan_id" }).select().single();
    if (error) { settings = previous; setSync("Sync failed", "error"); toast(error.message, "error"); render(); return; }
    settings = data;
    setSync("Synced across devices", "synced");
    render();
  }

  async function loadMemberData() {
    setSync("Syncing your journey…", "saving");
    const userId = session.user.id;
    const [progressResult, settingsResult, principlesResult, postsResult, repliesResult] = await Promise.all([
      db.from("conflict_reading_progress").select("*").eq("user_id", userId).eq("plan_id", CONFIG.planId),
      db.from("conflict_journey_settings").select("*").eq("user_id", userId).eq("plan_id", CONFIG.planId).maybeSingle(),
      db.from("conflict_principles").select("*").eq("user_id", userId).eq("plan_id", CONFIG.planId).order("principle_number"),
      db.from("conflict_discussion_posts").select("*").eq("plan_id", CONFIG.planId).order("created_at", { ascending: false }).limit(100),
      db.from("conflict_discussion_replies").select("*").order("created_at", { ascending: true }).limit(500),
    ]);
    const firstError = [progressResult, settingsResult, principlesResult, postsResult, repliesResult].find((result) => result.error)?.error;
    if (firstError) throw firstError;
    progress = new Map((progressResult.data ?? []).map((row) => [row.reading_id, row]));
    principles = principlesResult.data ?? [];
    posts = postsResult.data ?? [];
    const postIds = new Set(posts.map((post) => post.id));
    replies = (repliesResult.data ?? []).filter((reply) => postIds.has(reply.post_id));
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
    currentIndex = defaultReadingIndex();
    activeBook = currentReading().code;
    calendarMonth = startOfMonth(new Date());
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
      settings = guestSettings();
      principles = [];
      posts = [];
      replies = [];
      currentIndex = 0;
      clearInterval(refreshTimer);
      authGate.hidden = guestBrowsing;
      headerSignIn.hidden = !guestBrowsing;
      setSync(guestBrowsing ? "Viewing only — not saved" : "Sign in to save progress");
      render();
      return;
    }
    guestBrowsing = false;
    authGate.hidden = true;
    headerSignIn.hidden = true;
    try {
      await loadMemberData();
      render();
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
      try { await loadMemberData(); render(); } catch (error) { console.warn("Background sync", error.message); }
    }, 60000);
  }

  async function signInGoogle() {
    authError.textContent = "";
    signInButton.disabled = true;
    signInButton.lastChild.textContent = " Connecting…";
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) {
      authError.textContent = error.message;
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
    else if (target.dataset.calendar) { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + (target.dataset.calendar === "next" ? 1 : -1), 1, 12); render(); }
    else if (target.dataset.mode) updateSettings({ schedule_mode: target.dataset.mode });
    else if (target.dataset.sharePrinciple) { selectedMembersPrincipleId = target.dataset.sharePrinciple; showView("members", true); }
    else if (target.dataset.findPrinciple) { principleSearch = String(target.dataset.findPrinciple); showView("progress", true); setTimeout(() => document.getElementById(`principle-${target.dataset.findPrinciple}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); }
    else if (target.dataset.deletePrinciple) deletePrinciple(target.dataset.deletePrinciple);
    else if (target.dataset.openSource) recordOpen(target.dataset.readingId, target.dataset.openSource);
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-progress-field]")) saveReadingProgress(target.dataset.readingId, target.dataset.progressField, target.checked);
    else if (target.id === "start-date" && target.value) { calendarMonth = startOfMonth(parseDate(target.value)); updateSettings({ start_date: target.value }); }
  });

  root.addEventListener("input", (event) => {
    if (event.target.id === "principle-search") { principleSearch = event.target.value; const selection = event.target.selectionStart; render(); const input = document.getElementById("principle-search"); input?.focus(); input?.setSelectionRange(selection, selection); }
  });

  root.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.id === "principle-form") createPrinciple(event.target);
    else if (event.target.id === "post-form") createPost(event.target);
    else if (event.target.matches(".reply-form")) createReply(event.target);
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
      try { await loadMemberData(); render(); } catch (error) { console.warn(error.message); }
    }
  });

  async function init() {
    try {
      const response = await fetch(PLAN_PATH, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Reading plan could not be loaded (${response.status}).`);
      plan = await response.json();
      if (plan.planId !== CONFIG.planId || !Array.isArray(plan.readings) || plan.readings.length !== 265) throw new Error("Reading plan validation failed.");
      document.getElementById("hero-reading-count").textContent = plan.readings.length;
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
