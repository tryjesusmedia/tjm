(() => {
  "use strict";

  const CONFIG = window.TJM_CHRONBIBLE_CONFIG;
  const PLAN_PATH = "data/readings.json";
  const POINTS_PER_CHAPTER = 10;
  const REWARD_MILESTONES = Object.freeze([1, 25, 100, 250, 500, 750, 1000, 1205]);
  const FIRST_NAME_HOLD_MS = 1400;
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
  let completed = new Set();
  let currentIndex = 0;
  let lastIndex = 0;
  let activeView = "readings";
  let activeSection = "";
  let refreshTimer = null;
  let journeyAlias = "";
  let journeyFirstName = "";
  let leaderboard = [];
  let leaderboardLoaded = false;
  let leaderboardLoading = false;
  let leaderboardError = "";
  let leaderboardOpen = true;
  let nameHoldTimer = null;
  let namePointerStart = null;
  let lastNameTapAt = 0;
  let lastAliasTapAt = 0;
  let nameEditInProgress = false;
  let nameEditRequestId = 0;
  let identityVersion = 0;
  let visitRefreshPromise = null;
  let sessionVersion = 0;
  let leaderboardRequestId = 0;
  let visitRefreshId = 0;

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

  function normalizeIndex(value) {
    const index = Number(value);
    if (!Number.isInteger(index)) return 0;
    return Math.max(0, Math.min(index, plan.readings.length - 1));
  }

  function currentReading() {
    return plan.readings[normalizeIndex(currentIndex)];
  }

  function percentComplete() {
    return Math.round((completed.size / plan.chapterCount) * 100);
  }

  function metadataFirstName() {
    const metadata = session?.user?.user_metadata ?? {};
    const supplied = String(metadata.given_name || metadata.full_name || metadata.name || "").trim();
    const first = supplied.split(/\s+/)[0] || "Friend";
    return first.length <= 40 && !/[<>\u0000-\u001f\u007f]/u.test(first) ? first : "Friend";
  }

  function friendlyFirstName() {
    return journeyFirstName || metadataFirstName();
  }

  function isCurrentSession(userId, version) {
    return Boolean(userId && session?.user?.id === userId && sessionVersion === version);
  }

  function resetRewardState() {
    leaderboardRequestId += 1;
    visitRefreshId += 1;
    nameEditRequestId += 1;
    identityVersion += 1;
    nameEditInProgress = false;
    cancelNameGesture();
    visitRefreshPromise = null;
    journeyAlias = "";
    journeyFirstName = "";
    leaderboard = [];
    leaderboardLoaded = false;
    leaderboardLoading = false;
    leaderboardError = "";
  }

  function rewardSummary() {
    const completedChapters = completed.size;
    const nextMilestone = REWARD_MILESTONES.find((milestone) => completedChapters < milestone) ?? null;
    const milestoneProgress = nextMilestone === null
      ? 100
      : Math.round((completedChapters / nextMilestone) * 100);
    return {
      completedChapters,
      journeyPoints: completedChapters * POINTS_PER_CHAPTER,
      nextMilestone,
      milestoneProgress: Math.max(0, Math.min(100, milestoneProgress)),
    };
  }

  function readingComplete(reading) {
    return reading.bibleTasks.every((task) => completed.has(task.progressIndex));
  }

  function completedTaskCount() {
    return plan.readings.filter(readingComplete).length;
  }

  function nextIncomplete() {
    return plan.readings.find((reading) => !readingComplete(reading)) ?? plan.readings[plan.readings.length - 1];
  }

  function sectionReadings(title) {
    return plan.readings.filter((reading) => reading.section === title);
  }

  function migrateV3Progress(data) {
    return {
      completed: Array.from(new Set((data?.completed_indices ?? []).map((index) => plan.previousChapterMigration?.[String(index)]).filter(Number.isInteger))).sort((left, right) => left - right),
      lastIndex: normalizeIndex(plan.previousReadingMigration?.[String(data?.last_index ?? 0)] ?? 0),
    };
  }

  function migrateV2Progress(data) {
    const completed = (data?.completed_indices ?? []).flatMap((taskIndex) => plan.taskChapterMigration?.[String(taskIndex)] ?? []);
    return {
      completed: Array.from(new Set(completed)).sort((left, right) => left - right),
      lastIndex: normalizeIndex(plan.taskReadingMigration?.[String(data?.last_index ?? 0)] ?? 0),
    };
  }

  function migrateV1Progress(data) {
    const completedLegacy = new Set((data?.completed_indices ?? []).map(Number));
    const lastLegacyIndex = Number(data?.last_index ?? 0);
    const readingMigration = plan.originalReadingMigration?.[String(lastLegacyIndex)] ?? { first: 0, last: 0, resume: 0 };
    return {
      completed: Array.from(new Set(Array.from(completedLegacy).flatMap((legacyIndex) => plan.originalChapterMigration?.[String(legacyIndex)] ?? []))).sort((left, right) => left - right),
      lastIndex: completedLegacy.has(lastLegacyIndex) ? (readingMigration.resume ?? readingMigration.last) : readingMigration.first,
    };
  }

  function showSignIn() {
    authError.textContent = "";
    authGate.hidden = false;
  }

  function guestBanner() {
    if (session || !guestBrowsing) return "";
    return `<aside class="save-banner" aria-label="Saving requires sign-in"><div><strong>Viewing without an account</strong><span>You can explore every reading task. Sign in to sync your chapter progress across devices.</span></div><button class="button button-primary" type="button" data-require-sign-in>Sign in to sync</button></aside>`;
  }

  function showView(name, focusMain = false) {
    activeView = name;
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    render();
    if (name === "rewards" && session) void refreshJourneyFromVisit();
    if (focusMain) {
      document.getElementById("journey-main").focus({ preventScroll: true });
      const hero = document.querySelector(".journey-hero");
      const journeyTop = hero ? hero.getBoundingClientRect().bottom + window.scrollY : 0;
      window.scrollTo({ top: journeyTop, behavior: "smooth" });
    }
  }

  function sourceTaskLinks(reading) {
    if (!reading.bibleTasks?.length) return `<button class="button button-primary" type="button" disabled>No chapter links available</button>`;
    return `<div class="chapter-task-list" aria-label="Scripture chapter choices">${reading.bibleTasks.map((task) => `<div class="chapter-task-row"><input class="chapter-checkbox" type="checkbox" data-chapter-progress="${task.progressIndex}" data-reading-index="${reading.index}" aria-label="Mark ${escapeHTML(task.label)} complete" ${completed.has(task.progressIndex) ? "checked" : ""}><a class="button button-primary source-task" href="${escapeHTML(task.url)}" target="_blank" rel="noopener noreferrer" aria-label="Read ${escapeHTML(task.label)} on BibleGateway">Read ${escapeHTML(task.label)} <span aria-hidden="true">↗</span></a></div>`).join("")}</div>`;
  }

  function reviewFlag(reading) {
    if (!reading.reviewNote) return "";
    return `<p class="source-flag"><span aria-hidden="true">△</span><span><strong>Source reference needs review.</strong><br>${escapeHTML(reading.reviewNote)}</span></p>`;
  }

  function renderReadings() {
    const reading = currentReading();
    const percent = percentComplete();
    return `
      <section aria-labelledby="readings-heading">
        <header class="view-heading">
          <div>
            <p class="eyebrow">${escapeHTML(reading.section)} · READING TASK ${reading.number} OF ${plan.readings.length}</p>
            <h2 id="readings-heading">${escapeHTML(reading.title)}</h2>
          </div>
          <div class="reading-switcher" aria-label="Reading navigation">
            <button class="icon-button" type="button" data-reading-nav="prev" aria-label="Previous reading" ${currentIndex === 0 ? "disabled" : ""}>‹</button>
            <span class="reading-number"><strong>Task ${reading.number}</strong><small>${percent}% COMPLETE</small></span>
            <button class="icon-button" type="button" data-reading-nav="next" aria-label="Next reading" ${currentIndex === plan.readings.length - 1 ? "disabled" : ""}>›</button>
          </div>
        </header>

        <div class="readings-grid">
          <article class="reading-card scripture-card">
            <div class="card-kicker"><span>THE BIBLE</span><span class="source-order">SCRIPTURE READING</span></div>
            <h3>${escapeHTML(reading.reference)}</h3>
            ${reading.partCount > 1 ? `<p class="citation">Part ${reading.partNumber} of ${reading.partCount} from the original assignment “${escapeHTML(reading.sourceReference)}.”</p>` : ""}
            <div class="reading-actions">
              ${sourceTaskLinks(reading)}
            </div>
            ${reviewFlag(reading)}
          </article>
        </div>
      </section>`;
  }

  function renderJourney() {
    const sections = plan.sections.map((section) => {
      const readings = sectionReadings(section.title);
      const completeCount = readings.filter(readingComplete).length;
      const percent = Math.round((completeCount / readings.length) * 100);
      const open = activeSection === section.title;
      return `<article class="book-section">
        <button class="book-summary" type="button" data-section="${escapeHTML(section.title)}" aria-expanded="${open}">
          <span class="book-badge">${String(section.number).padStart(2, "0")}</span>
          <span><h3>${escapeHTML(section.title)}</h3><p>Tasks ${readings[0].number}–${readings[readings.length - 1].number} · ${readings.length} ${readings.length === 1 ? "task" : "tasks"}</p></span>
          <span class="book-progress"><span class="progress-track"><i style="width:${percent}%"></i></span><small>${completeCount} OF ${readings.length} COMPLETE</small></span>
        </button>
        ${open ? `<div class="reading-list">${readings.map((reading) => `<button class="journey-reading ${readingComplete(reading) ? "done" : ""}" type="button" data-reading-index="${reading.index}"><span class="reading-check">✓</span><span><strong>${escapeHTML(reading.title)}</strong><small>${escapeHTML(reading.reference)}${reading.partCount > 1 ? ` · Part ${reading.partNumber} of ${reading.partCount}` : ""}</small></span><em>Open →</em></button>`).join("")}</div>` : ""}
      </article>`;
    }).join("");

    return `<section aria-labelledby="journey-heading"><header class="view-heading"><div><p class="eyebrow">THE COMPLETE SEQUENCE</p><h2 id="journey-heading">The chronological journey</h2><p>Across ${plan.sections.length} major historical sections, the complete journey is organized into ${plan.readings.length} manageable, named reading tasks, including all 42 chapters of Job between Genesis 11 and Genesis 12.</p></div></header><div class="book-grid">${sections}</div>${plan.reviewQueue?.length ? `<details class="review-queue"><summary>${plan.reviewQueue.length} supplied reference marked for review</summary>${plan.reviewQueue.map((item) => `<div class="review-item"><strong>${escapeHTML(item.reference)}</strong><br>${escapeHTML(item.note)}</div>`).join("")}</details>` : ""}</section>`;
  }

  function renderProgress() {
    const percent = percentComplete();
    const next = nextIncomplete();
    const rewards = rewardSummary();
    const rows = plan.sections.map((section) => {
      const readings = sectionReadings(section.title);
      const count = readings.filter(readingComplete).length;
      const sectionPercent = Math.round((count / readings.length) * 100);
      return `<div class="book-progress-row"><header><span>${escapeHTML(section.title)}</span><span>${count} / ${readings.length}</span></header><div class="progress-track"><i style="width:${sectionPercent}%"></i></div></div>`;
    }).join("");

    const tasksComplete = completedTaskCount();
    return `<section aria-labelledby="progress-heading"><header class="view-heading"><div><p class="eyebrow">YOUR READING PROGRESS</p><h2 id="progress-heading">Continue the story</h2><p>${session ? "Your chapter progress and Journey Points are synced across your signed-in devices." : "Sign in with Google whenever you want your progress and Journey Points synced across devices."}</p></div></header>${guestBanner()}<div class="stat-grid"><article class="stat-card"><strong>${tasksComplete}</strong><span>Tasks complete</span></article><article class="stat-card"><strong>${completed.size}</strong><span>Chapters complete</span></article><article class="stat-card"><strong>${percent}%</strong><span>Journey complete</span></article><article class="stat-card reward-stat"><strong>${rewards.journeyPoints.toLocaleString()}</strong><span>Journey Points</span></article></div><div class="progress-layout progress-layout-wide"><article class="progress-panel"><h3>Progress by section</h3>${rows}</article><aside class="next-reading-card"><p class="eyebrow">NEXT UNFINISHED READING TASK</p><h3>${escapeHTML(next.title)}</h3><p>${escapeHTML(next.reference)}</p><button class="button button-primary" type="button" data-reading-index="${next.index}">Continue reading</button><button class="button button-secondary" type="button" data-view-shortcut="rewards">View Journey leaderboard</button>${session ? "" : `<button class="button button-secondary" type="button" data-require-sign-in>Sign in to save progress</button>`}</aside></div></section>`;
  }

  function renderMilestones(rewards) {
    return REWARD_MILESTONES.map((milestone) => {
      const earned = rewards.completedChapters >= milestone;
      const label = milestone === plan.chapterCount ? "Journey complete" : `${milestone.toLocaleString()} chapters`;
      return `<li class="milestone ${earned ? "earned" : ""}"><span aria-hidden="true">${earned ? "✓" : "◇"}</span><strong>${label}</strong></li>`;
    }).join("");
  }

  function renderLeaderboardRows() {
    if (leaderboardLoading && !leaderboardLoaded) return `<div class="leaderboard-state"><span class="loading-orb"></span><strong>Gathering the community…</strong></div>`;
    if (leaderboardError) return `<div class="leaderboard-state leaderboard-error"><strong>Leaderboard unavailable</strong><p>${escapeHTML(leaderboardError)}</p><button class="button button-secondary" type="button" data-retry-leaderboard>Try again</button></div>`;
    if (!leaderboard.length) return `<div class="leaderboard-state"><strong>The journey is just beginning.</strong><p>Complete a chapter and return here to see the community.</p></div>`;
    return `<div class="leaderboard-list" role="list" aria-label="All Journey readers">${leaderboard.map((entry) => `<article class="leaderboard-row ${entry.is_current_user ? "is-current" : ""}" role="listitem"><span class="leaderboard-rank">#${entry.rank}</span><span class="leaderboard-identity">${entry.is_current_user ? `<button class="leaderboard-alias leaderboard-alias-edit" type="button" data-edit-alias aria-label="${escapeHTML(entry.alias)}. Double-tap or press and hold to change your leaderboard name."><strong>${escapeHTML(entry.alias)}</strong><small>YOU</small><em>Double-tap or hold to edit</em></button>` : `<span class="leaderboard-alias"><strong>${escapeHTML(entry.alias)}</strong></span>`}</span><span class="leaderboard-score"><strong>${Number(entry.journey_points).toLocaleString()} JP</strong><small>${Number(entry.completed_chapters).toLocaleString()} chapters</small></span></article>`).join("")}</div>`;
  }

  function renderRewards() {
    const rewards = rewardSummary();
    const nextLabel = rewards.nextMilestone === null
      ? "You completed the full journey."
      : rewards.nextMilestone === 1
        ? "Complete your first chapter to reach your first milestone."
        : `${rewards.nextMilestone - rewards.completedChapters} chapters to the ${rewards.nextMilestone.toLocaleString()}-chapter milestone.`;
    const welcome = session
      ? `<button class="member-welcome" type="button" data-edit-first-name aria-label="Welcome, ${escapeHTML(friendlyFirstName())}. Double-tap or press and hold to change your first name.">Welcome, ${escapeHTML(friendlyFirstName())}!</button><span class="name-edit-hint">Double-tap or press and hold your name to change it.</span>`
      : `<p class="member-welcome member-welcome-guest">Welcome, Friend!</p>`;

    return `<section aria-labelledby="rewards-heading" class="rewards-view"><header class="view-heading"><div><p class="eyebrow">JOURNEY POINTS</p><h2 id="rewards-heading">Celebrate steady progress.</h2><p>Each distinct completed chapter earns 10 Journey Points.</p></div></header><div class="reward-overview"><article class="points-card">${welcome}<p class="eyebrow">YOUR JOURNEY POINTS</p><strong>${rewards.journeyPoints.toLocaleString()}</strong><span>${rewards.completedChapters.toLocaleString()} of ${plan.chapterCount.toLocaleString()} chapters complete</span><div class="reward-progress"><div class="progress-track"><i style="width:${rewards.milestoneProgress}%"></i></div><small>${escapeHTML(nextLabel)}</small></div></article></div><article class="milestone-panel"><header><div><p class="eyebrow">MILESTONES</p><h3>Markers along the way</h3></div></header><ul>${renderMilestones(rewards)}</ul></article><article class="leaderboard-panel ${leaderboardOpen ? "is-open" : "is-closed"}"><button class="leaderboard-toggle" type="button" data-toggle-leaderboard aria-expanded="${leaderboardOpen}"><span><span class="eyebrow">ALL READERS</span><strong>Journey leaderboard</strong></span><i aria-hidden="true">${leaderboardOpen ? "−" : "+"}</i></button>${leaderboardOpen ? (session ? renderLeaderboardRows() : `<div class="leaderboard-state"><strong>Sign in to view the leaderboard.</strong><p>Your local progress remains available without an account.</p><button class="button button-primary" type="button" data-require-sign-in>Sign in to join</button></div>`) : ""}</article></section>`;
  }

  function render() {
    if (!plan) return;
    let content;
    if (activeView === "readings") content = renderReadings();
    else if (activeView === "journey") content = renderJourney();
    else if (activeView === "progress") content = renderProgress();
    else if (activeView === "rewards") content = renderRewards();
    else content = renderReadings();
    root.innerHTML = `${activeView === "progress" || activeView === "rewards" ? "" : guestBanner()}${content}`;
  }

  async function loadJourneyIdentity({ userId = session?.user?.id, version = sessionVersion } = {}) {
    if (!db || !isCurrentSession(userId, version)) return false;
    const identityVersionAtStart = identityVersion;
    const [profileResult, firstNameResult] = await Promise.all([
      db.rpc("ensure_journey_profile"),
      db.rpc("get_my_journey_first_name"),
    ]);
    if (identityVersionAtStart !== identityVersion || !isCurrentSession(userId, version)) return false;
    if (profileResult.error) throw profileResult.error;
    if (firstNameResult.error) throw firstNameResult.error;
    journeyAlias = String(profileResult.data || "");
    journeyFirstName = String(firstNameResult.data || metadataFirstName());
    updateProfile();
    return true;
  }

  async function loadJourneyRewards({ identityReady = false } = {}) {
    if (!session || !db || leaderboardLoading || nameEditInProgress) return false;
    const userId = session.user.id;
    const version = sessionVersion;
    const requestId = ++leaderboardRequestId;
    leaderboardLoading = true;
    leaderboardError = "";
    if (activeView === "rewards") render();
    try {
      const identityLoaded = identityReady || await loadJourneyIdentity({ userId, version });
      if (!isCurrentSession(userId, version) || requestId !== leaderboardRequestId) return false;
      if (!identityLoaded) return false;
      const leaderboardResult = await db.rpc("get_journey_leaderboard");
      if (!isCurrentSession(userId, version) || requestId !== leaderboardRequestId) return false;
      if (leaderboardResult.error) throw leaderboardResult.error;
      leaderboard = Array.isArray(leaderboardResult.data) ? leaderboardResult.data : [];
      leaderboardLoaded = true;
      return true;
    } catch (error) {
      if (isCurrentSession(userId, version) && requestId === leaderboardRequestId) {
        leaderboardError = error.message || "Please try again in a moment.";
      }
      return false;
    } finally {
      if (isCurrentSession(userId, version) && requestId === leaderboardRequestId) {
        leaderboardLoading = false;
        if (activeView === "rewards") render();
      }
    }
  }

  async function editJourneyAlias() {
    if (!session) {
      showSignIn();
      return;
    }
    const userId = session.user.id;
    const version = sessionVersion;
    const answer = window.prompt("Choose your public leaderboard name (3–40 characters).", journeyAlias);
    if (answer === null) return;
    const alias = answer.trim().replace(/\s+/g, " ");
    if (alias.length < 3 || alias.length > 40 || /[<>\u0000-\u001f\u007f]/u.test(alias)) {
      toast("Please enter a leaderboard name from 3 to 40 characters.", "error");
      return;
    }
    leaderboardLoading = true;
    leaderboardError = "";
    render();
    const { data, error } = await db.rpc("update_journey_alias", { p_alias: alias });
    if (!isCurrentSession(userId, version)) return;
    if (error) {
      leaderboardLoading = false;
      leaderboardError = error.message;
      render();
      return;
    }
    journeyAlias = String(data || "");
    leaderboardLoading = false;
    leaderboardLoaded = false;
    await loadJourneyRewards();
    toast(`Your leaderboard name is now ${journeyAlias}.`);
  }

  async function editJourneyFirstName() {
    if (nameEditInProgress) return;
    if (!session) {
      showSignIn();
      return;
    }
    const userId = session.user.id;
    const version = sessionVersion;
    const requestId = ++nameEditRequestId;
    nameEditInProgress = true;
    try {
      const answer = window.prompt("What first name should we use to welcome you?", friendlyFirstName());
      if (answer === null) return;
      if (requestId !== nameEditRequestId || !isCurrentSession(userId, version)) return;
      const firstName = answer.trim();
      if (!firstName || firstName.length > 40 || /[<>\u0000-\u001f\u007f]/u.test(firstName)) {
        toast("Please enter a first name from 1 to 40 characters.", "error");
        return;
      }
      identityVersion += 1;
      const { data, error } = await db.rpc("update_my_journey_first_name", { p_first_name: firstName });
      if (requestId !== nameEditRequestId || !isCurrentSession(userId, version)) return;
      if (error) throw error;
      identityVersion += 1;
      journeyFirstName = String(data || firstName);
      updateProfile();
      renderPreservingPlace();
      toast(`Welcome, ${journeyFirstName}!`);
    } catch (error) {
      if (requestId === nameEditRequestId && isCurrentSession(userId, version)) {
        toast(error.message || "Your first name could not be saved.", "error");
      }
    } finally {
      if (requestId === nameEditRequestId) nameEditInProgress = false;
    }
  }

  function clearNameHold() {
    if (nameHoldTimer) clearTimeout(nameHoldTimer);
    const pointer = namePointerStart;
    if (pointer?.target?.hasPointerCapture?.(pointer.id)) {
      try { pointer.target.releasePointerCapture(pointer.id); } catch {}
    }
    nameHoldTimer = null;
    namePointerStart = null;
  }

  function cancelNameGesture() {
    clearNameHold();
    lastNameTapAt = 0;
    lastAliasTapAt = 0;
  }

  function beginNameHold(event) {
    const target = event.target.closest("[data-edit-first-name], [data-edit-alias]");
    if (!target || !event.isPrimary || event.button !== 0) return;
    clearNameHold();
    const kind = target.hasAttribute("data-edit-alias") ? "alias" : "first-name";
    namePointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, at: Date.now(), target, kind };
    try { target.setPointerCapture?.(event.pointerId); } catch {}
    nameHoldTimer = setTimeout(() => {
      clearNameHold();
      if (kind === "alias") {
        lastAliasTapAt = 0;
        void editJourneyAlias();
      } else {
        lastNameTapAt = 0;
        void editJourneyFirstName();
      }
    }, FIRST_NAME_HOLD_MS);
  }

  function moveNameHold(event) {
    if (!namePointerStart || event.pointerId !== namePointerStart.id) return;
    if (Math.hypot(event.clientX - namePointerStart.x, event.clientY - namePointerStart.y) > 12) {
      clearNameHold();
      lastNameTapAt = 0;
    }
  }

  function finishNameTap(event) {
    if (!namePointerStart || event.pointerId !== namePointerStart.id) return;
    const start = namePointerStart;
    const isTap = Date.now() - start.at < 700
      && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 12;
    clearNameHold();
    if (!isTap) return;
    const now = Date.now();
    const lastTapAt = start.kind === "alias" ? lastAliasTapAt : lastNameTapAt;
    if (now - lastTapAt <= 500) {
      if (start.kind === "alias") {
        lastAliasTapAt = 0;
        void editJourneyAlias();
      } else {
        lastNameTapAt = 0;
        void editJourneyFirstName();
      }
    } else {
      if (start.kind === "alias") lastAliasTapAt = now;
      else lastNameTapAt = now;
    }
  }

  async function refreshJourneyFromVisit() {
    if (!session || activeView !== "rewards" || document.visibilityState === "hidden" || nameEditInProgress) return false;
    if (visitRefreshPromise) return visitRefreshPromise;
    const userId = session.user.id;
    const version = sessionVersion;
    const refreshId = ++visitRefreshId;
    const refreshPromise = (async () => {
      try {
        const loaded = await loadMemberData({ preservePlace: true, userId, version });
        if (!loaded || !isCurrentSession(userId, version)) return false;
        await loadJourneyRewards();
        if (!isCurrentSession(userId, version)) return false;
        renderPreservingPlace();
        return true;
      } catch (error) {
        if (isCurrentSession(userId, version)) console.warn("Journey refresh", error.message);
        return false;
      } finally {
        if (refreshId === visitRefreshId) visitRefreshPromise = null;
      }
    })();
    visitRefreshPromise = refreshPromise;
    return refreshPromise;
  }

  async function persistProgress(previousCompleted, previousLastIndex) {
    if (!session) return;
    const userId = session.user.id;
    const version = sessionVersion;
    const completedIndices = Array.from(completed).sort((a, b) => a - b);
    const savedLastIndex = lastIndex;
    setSync("Saving…", "saving");
    const { error } = await db.from("reading_plan_progress").upsert({
      user_id: userId,
      plan_id: CONFIG.planId,
      completed_indices: completedIndices,
      last_index: savedLastIndex,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,plan_id" });

    if (!isCurrentSession(userId, version)) return;
    if (error) {
      completed = previousCompleted;
      lastIndex = previousLastIndex;
      currentIndex = normalizeIndex(lastIndex);
      setSync("Sync failed", "error");
      toast(error.message, "error");
      render();
      return;
    }
    setSync("Synced with the app", "synced");
    if (activeView === "rewards") await loadJourneyRewards();
  }

  async function goToReading(index, view = "readings") {
    const nextIndex = normalizeIndex(index);
    const previousCompleted = new Set(completed);
    const previousLastIndex = lastIndex;
    currentIndex = nextIndex;
    lastIndex = nextIndex;
    activeSection = currentReading().section;
    showView(view, true);
    if (session && previousLastIndex !== lastIndex) await persistProgress(previousCompleted, previousLastIndex);
  }

  async function toggleChapter(progressIndex, readingIndex, checked) {
    if (!session) {
      showSignIn();
      return;
    }
    const chapterIndex = Number(progressIndex);
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterIndex >= plan.chapterCount) return;
    const normalizedReadingIndex = normalizeIndex(readingIndex);
    const previousCompleted = new Set(completed);
    const previousLastIndex = lastIndex;
    if (checked) completed.add(chapterIndex);
    else completed.delete(chapterIndex);
    currentIndex = normalizedReadingIndex;
    lastIndex = normalizedReadingIndex;
    render();
    await persistProgress(previousCompleted, previousLastIndex);
  }

  async function loadMemberData({ preservePlace = false, userId = session?.user?.id, version = sessionVersion } = {}) {
    if (!isCurrentSession(userId, version)) return false;
    setSync("Syncing your progress…", "saving");
    const progressResult = await db.from("reading_plan_progress").select("completed_indices,last_index,updated_at").eq("user_id", userId).eq("plan_id", CONFIG.planId).maybeSingle();
    if (!isCurrentSession(userId, version)) return false;
    if (progressResult.error) throw progressResult.error;
    let memberData = progressResult.data;
    if (!memberData && plan.previousPlanId) {
      const { data: legacyData, error: legacyError } = await db.from("reading_plan_progress")
        .select("completed_indices,last_index,updated_at")
        .eq("user_id", userId)
        .eq("plan_id", plan.previousPlanId)
        .maybeSingle();
      if (!isCurrentSession(userId, version)) return false;
      if (legacyError) throw legacyError;
      if (legacyData) {
        const migrated = migrateV3Progress(legacyData);
        memberData = { completed_indices: migrated.completed, last_index: migrated.lastIndex, updated_at: new Date().toISOString() };
      }
    }
    if (!memberData && plan.taskLegacyPlanId) {
      const { data: taskLegacyData, error: taskLegacyError } = await db.from("reading_plan_progress")
        .select("completed_indices,last_index,updated_at")
        .eq("user_id", userId)
        .eq("plan_id", plan.taskLegacyPlanId)
        .maybeSingle();
      if (!isCurrentSession(userId, version)) return false;
      if (taskLegacyError) throw taskLegacyError;
      if (taskLegacyData) {
        const migrated = migrateV2Progress(taskLegacyData);
        memberData = { completed_indices: migrated.completed, last_index: migrated.lastIndex, updated_at: new Date().toISOString() };
      }
    }
    if (!memberData && plan.originalLegacyPlanId) {
      const { data: originalLegacyData, error: originalLegacyError } = await db.from("reading_plan_progress").select("completed_indices,last_index,updated_at").eq("user_id", userId).eq("plan_id", plan.originalLegacyPlanId).maybeSingle();
      if (!isCurrentSession(userId, version)) return false;
      if (originalLegacyError) throw originalLegacyError;
      if (originalLegacyData) {
        const migrated = migrateV1Progress(originalLegacyData);
        memberData = { completed_indices: migrated.completed, last_index: migrated.lastIndex, updated_at: new Date().toISOString() };
      }
    }
    if (memberData && !progressResult.data) {
      const { error: migrationError } = await db.from("reading_plan_progress").upsert({ user_id: userId, plan_id: CONFIG.planId, completed_indices: memberData.completed_indices, last_index: memberData.last_index, updated_at: memberData.updated_at }, { onConflict: "user_id,plan_id" });
      if (!isCurrentSession(userId, version)) return false;
      if (migrationError) throw migrationError;
    }
    if (!isCurrentSession(userId, version)) return false;
    completed = new Set((memberData?.completed_indices ?? []).map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < plan.chapterCount));
    lastIndex = normalizeIndex(memberData?.last_index ?? 0);
    if (!preservePlace) {
      currentIndex = lastIndex;
      activeSection = currentReading().section;
    }
    setSync("Synced with the app", "synced");
    return true;
  }

  function renderPreservingPlace() {
    const scrollLeft = window.scrollX;
    const scrollTop = window.scrollY;
    render();
    requestAnimationFrame(() => window.scrollTo({ left: scrollLeft, top: scrollTop, behavior: "auto" }));
  }

  function updateProfile() {
    if (!session) {
      profileButton.hidden = true;
      return;
    }
    const name = journeyFirstName || displayName();
    const avatar = avatarUrl();
    document.getElementById("profile-name").textContent = name.split(" ")[0] || "Member";
    document.getElementById("profile-initial").textContent = initials(name);
    document.getElementById("account-email").textContent = session.user.email || "Signed in with Google";
    const image = document.getElementById("profile-avatar");
    if (avatar) {
      image.src = avatar;
      image.hidden = false;
      document.getElementById("profile-initial").hidden = true;
    } else {
      image.hidden = true;
      document.getElementById("profile-initial").hidden = false;
    }
    profileButton.hidden = false;
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
      if (document.visibilityState !== "visible" || !session) return;
      const userId = session.user.id;
      const version = sessionVersion;
      try {
        const loaded = await loadMemberData({ preservePlace: true, userId, version });
        if (!loaded || !isCurrentSession(userId, version)) return;
        if (activeView === "rewards") await loadJourneyRewards();
        if (!isCurrentSession(userId, version)) return;
        renderPreservingPlace();
      } catch (error) {
        console.warn("Background sync", error.message);
      }
    }, 45000);
  }

  async function applySession(nextSession) {
    const previousUserId = session?.user?.id || "";
    const nextUserId = nextSession?.user?.id || "";
    if (previousUserId !== nextUserId) {
      sessionVersion += 1;
      clearInterval(refreshTimer);
      completed = new Set();
      currentIndex = 0;
      lastIndex = 0;
      activeSection = plan.readings[0].section;
      resetRewardState();
    }
    session = nextSession;
    accountMenu.hidden = true;
    if (!session) {
      updateProfile();
      completed = new Set();
      currentIndex = 0;
      lastIndex = 0;
      activeSection = plan.readings[0].section;
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
    const userId = session.user.id;
    const version = sessionVersion;
    profileButton.hidden = true;
    try {
      const [loaded, identityLoaded] = await Promise.all([
        loadMemberData({ userId, version }),
        loadJourneyIdentity({ userId, version }),
      ]);
      if (!loaded || !identityLoaded || !isCurrentSession(userId, version)) return;
      render();
      if (activeView === "rewards") await loadJourneyRewards({ identityReady: true });
      scheduleRefresh();
    } catch (error) {
      console.error(error);
      setSync("Sync unavailable", "error");
      authError.textContent = "Your Google sign-in worked, but your progress could not be loaded. Please try again or contact Try Jesus Media.";
      authGate.hidden = false;
    }
  }

  async function signInGoogle() {
    authError.textContent = "";
    signInButton.disabled = true;
    const { error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: CONFIG.siteUrl },
    });
    if (error) {
      authError.textContent = error.message;
      signInButton.disabled = false;
    }
  }

  document.querySelector(".journey-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button) showView(button.dataset.view, true);
  });

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target) return;
    if (target.hasAttribute("data-edit-first-name") && event.detail === 0) void editJourneyFirstName();
    else if (target.hasAttribute("data-edit-alias") && event.detail === 0) void editJourneyAlias();
    else if (target.hasAttribute("data-toggle-leaderboard")) { leaderboardOpen = !leaderboardOpen; renderPreservingPlace(); }
    else if (target.hasAttribute("data-require-sign-in")) showSignIn();
    else if (target.dataset.readingNav) goToReading(currentIndex + (target.dataset.readingNav === "next" ? 1 : -1));
    else if (target.dataset.readingIndex !== undefined) goToReading(Number(target.dataset.readingIndex));
    else if (target.dataset.section !== undefined) {
      activeSection = activeSection === target.dataset.section ? "" : target.dataset.section;
      render();
    } else if (target.dataset.viewShortcut) showView(target.dataset.viewShortcut, true);
    else if (target.hasAttribute("data-retry-leaderboard")) loadJourneyRewards();
  });

  root.addEventListener("pointerdown", beginNameHold);
  window.addEventListener("pointermove", moveNameHold);
  window.addEventListener("pointerup", finishNameTap);
  window.addEventListener("pointercancel", cancelNameGesture);
  document.addEventListener("pointerout", (event) => {
    if (event.relatedTarget === null) cancelNameGesture();
  });
  window.addEventListener("blur", cancelNameGesture);
  window.addEventListener("scroll", cancelNameGesture, { passive: true });
  root.addEventListener("contextmenu", (event) => {
    if (!event.target.closest("[data-edit-first-name], [data-edit-alias]")) return;
    event.preventDefault();
  });
  root.addEventListener("keydown", (event) => {
    const target = event.target.closest("[data-edit-first-name], [data-edit-alias]");
    if (event.repeat || !target || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (target.hasAttribute("data-edit-alias")) void editJourneyAlias();
    else void editJourneyFirstName();
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-chapter-progress]")) {
      if (!session) target.checked = false;
      toggleChapter(target.dataset.chapterProgress, target.dataset.readingIndex, target.checked);
    }
  });

  profileButton.addEventListener("click", () => {
    const opening = accountMenu.hidden;
    accountMenu.hidden = !opening;
    profileButton.setAttribute("aria-expanded", String(opening));
  });
  document.getElementById("sign-out").addEventListener("click", async () => {
    guestBrowsing = false;
    await db.auth.signOut();
  });
  signInButton.addEventListener("click", signInGoogle);
  guestButton.addEventListener("click", () => {
    guestBrowsing = true;
    authError.textContent = "";
    authGate.hidden = true;
    headerSignIn.hidden = false;
    setSync("Viewing only — not saved");
    render();
  });
  headerSignIn.addEventListener("click", showSignIn);
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && session) {
      const userId = session.user.id;
      const version = sessionVersion;
      try {
        const loaded = await loadMemberData({ preservePlace: true, userId, version });
        if (!loaded || !isCurrentSession(userId, version)) return;
        if (activeView === "rewards") await loadJourneyRewards();
        if (!isCurrentSession(userId, version)) return;
        renderPreservingPlace();
      } catch (error) {
        console.warn(error.message);
      }
    }
  });
  window.addEventListener("pageshow", () => { void refreshJourneyFromVisit(); });
  window.addEventListener("focus", () => { void refreshJourneyFromVisit(); });

  async function init() {
    try {
      const response = await fetch(PLAN_PATH, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Reading plan could not be loaded (${response.status}).`);
      plan = await response.json();
      const indicesAreValid = plan.readings?.every((reading, index) => reading.index === index && reading.number === index + 1 && reading.bibleTasks?.length);
      const chapterIndices = plan.readings.flatMap((reading) => reading.bibleTasks.map((task) => task.progressIndex));
      const chaptersAreValid = chapterIndices.length === plan.chapterCount && chapterIndices.every((index, position) => index === position);
      const jobIsInPlace = plan.readings.slice(4, 9).every((reading) => reading.sourceNumber === 1)
        && plan.readings[3]?.reference === "Genesis 10-11"
        && plan.readings[9]?.reference === "Genesis 12-17";
      if (plan.planId !== CONFIG.planId || !Array.isArray(plan.readings) || plan.readings.length !== plan.readingCount || plan.readings.length !== 313 || plan.chapterCount !== 1205 || !indicesAreValid || !chaptersAreValid || !jobIsInPlace) throw new Error("Reading plan validation failed.");
      document.getElementById("hero-section-count").textContent = plan.sections.length;
      activeSection = plan.readings[0].section;
      loading.hidden = true;
      root.hidden = false;
      render();
      if (!window.supabase?.createClient) throw new Error("The secure account service could not be loaded. Please refresh and try again.");
      db = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
      });
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
