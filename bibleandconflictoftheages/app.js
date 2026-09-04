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
  let principles = [];
  let deletedPrinciples = [];
  let posts = [];
  let replies = [];
  let activeView = "readings";
  let currentIndex = 0;
  let activeBook = "PP";
  let principleSearch = "";
  let selectedMembersPrincipleId = "";
  let refreshTimer = null;
  const principleManager = window.TJMPrinciples.createController({
    planId: CONFIG.planId,
    exportFilename: "bible-and-conflict-of-the-ages",
    getDb: () => db,
    getSession: () => session,
    getPrinciples: () => principles,
    setPrinciples: (nextPrinciples) => { principles = nextPrinciples; },
    getDeletedPrinciples: () => deletedPrinciples,
    setDeletedPrinciples: (nextPrinciples) => { deletedPrinciples = nextPrinciples; },
    getReadings: () => readingsWithAliases(),
    escapeHTML,
    toast,
    setSync,
    showSignIn,
    rerender: render,
    showPrinciples: openPrinciplesMap,
    goToReadingById: (readingId) => {
      const index = plan.readings.findIndex((reading) => reading.id === resolveReadingId(readingId));
      if (index >= 0) goToReading(index, "readings");
    },
    readingLabel: (reading) => companionIdentity(reading),
  });

  function resolveReadingId(readingId) {
  return plan?.readingAliases?.[readingId] || readingId;
}

function readingIdsFor(readingId) {
  return [
    readingId,
    ...Object.entries(plan?.readingAliases || {})
      .filter(([, targetId]) => targetId === readingId)
      .map(([aliasId]) => aliasId),
  ];
}

function readingsWithAliases() {
  const readings = plan?.readings || [];
  const aliases = Object.entries(plan?.readingAliases || {}).map(([aliasId, targetId]) => {
    const target = readings.find((reading) => reading.id === targetId);
    return target ? { ...target, id: aliasId, aliasOf: targetId } : null;
  }).filter(Boolean);
  return [...readings, ...aliases];
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
    return `<aside class="save-banner" aria-label="Saving requires sign-in"><div><strong>Viewing without an account</strong><span>You can explore every reading, but progress, principles, cross-references, and principle groups are saved only after you sign in.</span></div><button class="button button-primary" type="button" data-require-sign-in>Sign in to save</button></aside>`;
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

  function nextPrincipleNumber() {
    return principleManager.nextNumber();
  }

  function showView(name, focusMain = false) {
    if (name === "principles") { openPrinciplesMap(); return; }
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
    return `<div class="source-task-list" aria-label="${label}">${tasks.map((task) => {
      const taskTitle = kind === "commentary" && task.title ? task.title : task.label;
      const linkLabel = kind === "commentary" ? taskTitle.replace(/^Read\s+/i, "") : task.label;
      return `<div class="source-task-row"><input class="chapter-checkbox" type="checkbox" data-chapter-progress="${task.progressIndex}" data-reading-id="${reading.id}" aria-label="Mark ${escapeHTML(taskTitle.replace(/^Read\s+/i, ""))} complete" ${chapterCompleted.has(task.progressIndex) ? "checked" : ""}><a class="button ${style} source-task" href="${escapeHTML(task.url)}" target="_blank" rel="noopener noreferrer" data-open-source="${kind}" data-reading-id="${reading.id}" aria-label="Read ${escapeHTML(taskTitle.replace(/^Read\s+/i, ""))} on ${kind === "commentary" ? "EGW Writings" : "Bible Gateway"}">${escapeHTML(linkLabel)} <span>↗</span></a></div>`;
    }).join("")}</div>`;
  }

  function renderReadings() {
    const reading = currentReading();
    const readingIds = new Set(readingIdsFor(reading.id));
    const readingPrinciples = principles.filter((principle) => readingIds.has(principle.reading_id));
    const scriptureActions = sourceTaskLinks(reading, "bible", reading.bibleTasks);
    const commentaryActions = sourceTaskLinks(reading, "commentary", reading.commentaryTasks);
    const commentaryPages = companionPageSummary(reading);
    const scriptureCard = reading.bibleReference ? `
            <article class="reading-card scripture-card">
              <div class="card-kicker"><span>THE BIBLE</span><span class="source-order">READ FIRST</span></div>
              <h3>${escapeHTML(reading.bibleReference)}</h3>
              <p class="citation">Choose one chapter at a time. Each link opens only that chapter or its assigned verses on Bible Gateway (KJV).</p>
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
    const principlePanel = session ? `
          <aside class="principle-panel" aria-labelledby="principle-heading">
            ${principleManager.renderReadingReturnLink(reading.id)}
            <p class="eyebrow">YOUR PRIVATE DISCOVERY</p>
            <h3 id="principle-heading">What principles do you see after this reading?</h3>
            <p>Write one principle at a time. It receives a permanent number so you can organize your discoveries throughout the journey.</p>
            <form id="principle-form">
              ${principleManager.renderCreateNumberField()}
              <div class="field">
                <label for="principle-body">The principle I see</label>
                <textarea id="principle-body" maxlength="2000" required placeholder="In my own words…"></textarea>
              </div>
              <div class="panel-actions"><button class="button button-primary" type="submit">Save principle</button></div>
            </form>
            <div class="principles-for-reading">
              <strong>${readingPrinciples.length ? `${readingPrinciples.length} saved for this reading` : "No principles saved for this reading yet"}</strong>
              ${readingPrinciples.map((principle) => principleManager.renderReadingPrinciple(principle)).join("")}
            </div>
          </aside>` : `
          <aside class="principle-panel" aria-labelledby="principle-heading">
            <p class="eyebrow">YOUR PRIVATE DISCOVERY</p>
            <h3 id="principle-heading">Save numbered principles from your reading</h3>
            <p>You can read the entire journey without an account. Sign in with Google when you want to save and organize your own numbered discoveries.</p>
            <button class="button button-primary" type="button" data-require-sign-in>Sign in to save principles</button>
          </aside>`;

    return `
      <section aria-labelledby="readings-heading">
        <header class="view-heading">
          <div>
            <p class="eyebrow">CONFLICT OF THE AGES</p>
            <h2 id="readings-heading" class="chapter-heading">${companionHeading(reading)}</h2>
            <p>Move at your own pace. A reading may take one sitting, several days, or longer; your next unfinished reading will be waiting whenever you return.</p>
          </div>
          <div class="reading-switcher" aria-label="Reading navigation">
            <button class="icon-button nav-button" type="button" data-day-nav="prev" ${currentIndex === 0 ? "disabled" : ""}>Previous</button>
            <span class="reading-number"><small>${Math.round((completedCount() / plan.readings.length) * 100)}% COMPLETE</small></span>
            <button class="icon-button nav-button" type="button" data-day-nav="next" ${currentIndex === plan.readings.length - 1 ? "disabled" : ""}>Next</button>
          </div>
        </header>

        <div class="readings-grid">
          <div class="reading-stack">
            ${scriptureCard}
            ${companionCard}
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
      <div class="stat-grid"><article class="stat-card"><strong>${Math.round((completed / plan.readings.length) * 100)}%</strong><span>Journey complete</span></article><article class="stat-card"><strong>${completed}</strong><span>Complete readings</span></article><article class="stat-card"><strong>${principles.length}</strong><span>Personal principles</span></article><article class="stat-card"><strong>${bestStreak()}</strong><span>Best reading run</span></article></div>
      <div class="progress-layout"><article class="progress-panel"><h3>By companion book</h3>${plan.books.map((book) => { const count = completedCount(book.code); const percent = Math.round(count / book.readingCount * 100); return `<div class="book-progress-row"><header><span>${escapeHTML(book.shortTitle)}</span><span>${count}/${book.readingCount}</span></header><span class="progress-track"><i style="width:${percent}%"></i></span></div>`; }).join("")}<p style="color:#81767e;font-size:9px;line-height:1.6">${bibleComplete} Scripture assignments and ${commentaryComplete} companion assignments marked complete.</p><details class="review-queue"><summary>${plan.reviewQueue.length} supplied references in the review queue</summary>${plan.reviewQueue.map((item) => { const reading = plan.readings.find((entry) => entry.day === item.day); return `<div class="review-item"><strong>${escapeHTML(reading ? companionIdentity(reading) : "Source entry")}</strong><br>${escapeHTML(item.reviewNote)}</div>`; }).join("")}</details></article>
      <article class="progress-panel"><h3>Your principles</h3><p>Your ${principles.length} private ${principles.length === 1 ? "principle is" : "principles are"} organized in your Principles Map.</p><button class="button button-primary" type="button" data-view-shortcut="principles">Open Principles Map</button></article></div>
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
      return `<article class="member-post"><div class="post-author">${post.author_avatar_url ? `<img class="avatar" src="${escapeHTML(post.author_avatar_url)}" alt="">` : `<span class="avatar">${escapeHTML(initials(author))}</span>`}<span><strong>${escapeHTML(author)}</strong><small>${reading ? `${escapeHTML(companionIdentity(reading))} · ` : ""}${escapeHTML(formatDate(new Date(post.created_at), { month: "short", day: "numeric", year: "numeric" }))}</small></span></div>${post.principle_number ? `<blockquote class="post-principle"><b>PRINCIPLE #${post.principle_number}</b><br>${escapeHTML(post.principle_body || "")}</blockquote>` : ""}<p class="post-body">${escapeHTML(post.body)}</p><div class="reply-list">${postReplies.map((reply) => `<div class="reply"><b>${escapeHTML(reply.author_name || "Member")}</b> · ${escapeHTML(reply.body)}</div>`).join("")}</div><form class="reply-form" data-post-id="${post.id}"><input name="reply" maxlength="1000" required aria-label="Reply to ${escapeHTML(author)}" placeholder="Add to the discussion…"><button type="submit">Reply</button></form></article>`;
    }).join("");
    return `<section aria-labelledby="members-heading"><header class="view-heading"><div><p class="eyebrow">LEARN FROM ONE ANOTHER</p><h2 id="members-heading">Members discussion</h2><p>Share a discovery or a sincere question. This space is for thoughtful conversation, not an official answer key.</p></div></header><div class="members-layout"><aside class="share-panel"><p class="eyebrow">SHARE DELIBERATELY</p><h3>Share a finding</h3><p>Your principles are private until you choose one here and post it. Your Google email address is never displayed.</p><form id="post-form"><div class="field"><label for="post-principle">Principle (optional)</label><select id="post-principle"><option value="">Share without a principle</option>${principles.map((principle) => `<option value="${principle.id}" ${selected?.id === principle.id ? "selected" : ""}>#${principle.principle_number} — ${escapeHTML(principle.body.slice(0, 72))}</option>`).join("")}</select></div><div class="field"><label for="post-body">Observation or question</label><textarea id="post-body" minlength="3" maxlength="2000" required placeholder="What did you notice, and what would you like other members to consider?"></textarea><small>This will be visible to signed-in members.</small></div><button class="button button-primary" type="submit">Post to Members</button></form></aside><div class="member-feed">${feed || `<div class="empty-card">No member findings have been shared yet. You can begin the conversation.</div>`}</div></div></section>`;
  }

  function render() {
    if (!plan) return;
    let content;
    if (activeView === "readings") content = renderReadings();
    else if (activeView === "journey") content = renderJourney();
    else if (activeView === "progress") content = renderProgress();
    else content = principleManager.renderTab();
    root.innerHTML = `${guestBanner()}${content}`;
    window.dispatchEvent(new CustomEvent("tjm-principles-updated", {
      detail: { planId: CONFIG.planId, rows: principles },
    }));
  }

  function openPrinciplesMap() {
    window.dispatchEvent(new CustomEvent("tjm-open-principles-map"));
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

  function parseCrossReferences(value) {
    return Array.from(new Set(String(value).split(/[^0-9]+/).filter(Boolean).map(Number).filter((number) => Number.isInteger(number) && number > 0))).sort((a, b) => a - b);
  }

  async function createPrinciple(form) {
    await principleManager.createFromForm(form, currentReading().id);
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

  async function loadMemberData() {
    setSync("Syncing your journey…", "saving");
    const userId = session.user.id;
    const [progressResult, chapterProgressResult, settingsResult, principlesResult] = await Promise.all([
      db.from("conflict_reading_progress").select("*").eq("user_id", userId).eq("plan_id", CONFIG.planId),
      db.from("reading_plan_progress").select("completed_indices,last_index").eq("user_id", userId).eq("plan_id", CHAPTER_PROGRESS_PLAN_ID).maybeSingle(),
      db.from("conflict_journey_settings").select("*").eq("user_id", userId).eq("plan_id", CONFIG.planId).maybeSingle(),
      db.from("conflict_principles").select("*").eq("user_id", userId).eq("plan_id", CONFIG.planId).order("principle_number"),
    ]);
    const firstError = [progressResult, chapterProgressResult, settingsResult, principlesResult].find((result) => result.error)?.error;
    if (firstError) throw firstError;
    progress = new Map((progressResult.data ?? []).map((row) => [row.reading_id, row]));
    principles = (principlesResult.data ?? []).filter((principle) => !principle.deleted_at);
    deletedPrinciples = (principlesResult.data ?? []).filter((principle) => principle.deleted_at);
    posts = [];
    replies = [];
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
      principles = [];
      deletedPrinciples = [];
      posts = [];
      replies = [];
      principleManager.resetForSession();
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
    if (principleManager.handleClick(target)) return;
    if (target.hasAttribute("data-require-sign-in")) showSignIn();
    else if (target.dataset.dayNav) goToReading(currentIndex + (target.dataset.dayNav === "next" ? 1 : -1));
    else if (target.dataset.readingIndex) goToReading(Number(target.dataset.readingIndex));
    else if (target.dataset.book) { activeBook = activeBook === target.dataset.book ? "" : target.dataset.book; render(); }
    else if (target.dataset.viewShortcut === "principles") openPrinciplesMap();
    else if (target.dataset.viewShortcut) showView(target.dataset.viewShortcut, true);
    else if (target.dataset.sharePrinciple) { selectedMembersPrincipleId = target.dataset.sharePrinciple; showView("members", true); }
    else if (target.dataset.findPrinciple) { principleSearch = String(target.dataset.findPrinciple); showView("progress", true); setTimeout(() => document.getElementById(`principle-${target.dataset.findPrinciple}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); }
    else if (target.dataset.openSource) recordOpen(target.dataset.readingId, target.dataset.openSource);
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (principleManager.handleChange(target)) return;
    if (target.matches("[data-chapter-progress]")) {
      if (!session) target.checked = false;
      toggleChapter(target.dataset.chapterProgress, target.dataset.readingId, target.checked);
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.id === "principle-search") { principleSearch = event.target.value; const selection = event.target.selectionStart; render(); const input = document.getElementById("principle-search"); input?.focus(); input?.setSelectionRange(selection, selection); }
  });

  root.addEventListener("submit", (event) => {
    event.preventDefault();
    if (principleManager.handleSubmit(event.target)) return;
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
