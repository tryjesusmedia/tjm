(() => {
  "use strict";

  const CONFIG = window.TJM_CHRONBIBLE_CONFIG;
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
  let completed = new Set();
  let currentIndex = 0;
  let lastIndex = 0;
  let activeView = "readings";
  let activeSection = "";
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
    return `<aside class="save-banner" aria-label="Saving requires sign-in"><div><strong>Viewing without an account</strong><span>You can explore every reading task and keep notes on this device. Sign in to sync chapter progress, highlights, and notes across devices.</span></div><button class="button button-primary" type="button" data-require-sign-in>Sign in to sync</button></aside>`;
  }

  function showView(name, focusMain = false) {
    activeView = name;
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    render();
    if (focusMain) {
      document.getElementById("journey-main").focus({ preventScroll: true });
      const hero = document.querySelector(".journey-hero");
      const journeyTop = hero ? hero.getBoundingClientRect().bottom + window.scrollY : 0;
      window.scrollTo({ top: journeyTop, behavior: "smooth" });
    }
  }

  function sourceTaskLinks(reading) {
    if (!reading.bibleTasks?.length) return `<button class="button button-primary" type="button" disabled>No chapter links available</button>`;
    return `<div data-native-bible-group><div class="chapter-task-list" aria-label="Scripture chapter choices">${reading.bibleTasks.map((task) => `<div class="chapter-task-row"><input class="chapter-checkbox" type="checkbox" data-chapter-progress="${task.progressIndex}" data-reading-index="${reading.index}" aria-label="Mark ${escapeHTML(task.label)} complete" ${completed.has(task.progressIndex) ? "checked" : ""}><button class="button button-primary source-task" type="button" data-native-bible-task="${escapeHTML(task.label)}" data-plan-id="${escapeHTML(CONFIG.planId)}" data-reading-id="${escapeHTML(reading.id)}">Read ${escapeHTML(task.label)}</button></div>`).join("")}</div><div class="nbr-inline-reader" data-native-bible-mount data-plan-id="${escapeHTML(CONFIG.planId)}" data-reading-id="${escapeHTML(reading.id)}"><p class="nbr-empty">Choose a chapter to read it here.</p></div></div>`;
  }

  function reviewFlag(reading) {
    if (!reading.reviewNote) return "";
    return `<p class="source-flag"><span aria-hidden="true">△</span><span><strong>Source reference needs review.</strong><br>${escapeHTML(reading.reviewNote)}</span></p>`;
  }

  function renderReadings() {
    const reading = currentReading();
    const next = nextIncomplete();
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

          <aside class="chapter-side" aria-labelledby="reading-place-heading">
            <p class="eyebrow">YOUR READING PLACE</p>
            <h3 id="reading-place-heading">${session ? "Your reading place" : "Sign in when you want to save."}</h3>
            ${session ? "" : "<p>You can explore the entire plan now. Google sign-in is optional and is required only for saved, cross-device progress.</p>"}
            <div class="side-progress">
              <div class="progress-track"><i style="width:${percent}%"></i></div>
              <strong>${completedTaskCount()} of ${plan.readings.length} tasks</strong>
              <small>${completed.size} OF ${plan.chapterCount} CHAPTERS COMPLETE · ${percent}%</small>
            </div>
            ${session ? `<button class="button button-primary" type="button" data-reading-index="${next.index}">Continue next task</button>` : `<button class="button button-primary" type="button" data-require-sign-in>Sign in with Google to sync</button>`}
            <button class="button button-secondary" type="button" data-view-shortcut="journey">View the full journey</button>
          </aside>
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
    const rows = plan.sections.map((section) => {
      const readings = sectionReadings(section.title);
      const count = readings.filter(readingComplete).length;
      const sectionPercent = Math.round((count / readings.length) * 100);
      return `<div class="book-progress-row"><header><span>${escapeHTML(section.title)}</span><span>${count} / ${readings.length}</span></header><div class="progress-track"><i style="width:${sectionPercent}%"></i></div></div>`;
    }).join("");

    const tasksComplete = completedTaskCount();
    const highlightCount = window.TJMNativeBible?.getHighlights().length || 0;
    return `<section aria-labelledby="progress-heading"><header class="view-heading"><div><p class="eyebrow">YOUR READING PROGRESS</p><h2 id="progress-heading">Continue the story</h2><p>${session ? "Your chapter progress, highlights, and notes are synced across your signed-in devices." : "Sign in with Google whenever you want progress, highlights, and notes synced across devices."}</p></div></header>${guestBanner()}<div class="stat-grid"><article class="stat-card"><strong>${tasksComplete}</strong><span>Tasks complete</span></article><article class="stat-card"><strong>${completed.size}</strong><span>Chapters complete</span></article><article class="stat-card"><strong>${percent}%</strong><span>Journey complete</span></article><article class="stat-card"><strong>${highlightCount}</strong><span>Bible highlights</span></article></div><div class="progress-layout progress-layout-wide"><article class="progress-panel"><h3>Progress by section</h3>${rows}</article><aside class="next-reading-card"><p class="eyebrow">NEXT UNFINISHED READING TASK</p><h3>${escapeHTML(next.title)}</h3><p>${escapeHTML(next.reference)}</p><button class="button button-primary" type="button" data-reading-index="${next.index}">Continue reading</button>${session ? "" : `<button class="button button-secondary" type="button" data-require-sign-in>Sign in to save progress</button>`}</aside></div></section>`;
  }

  function render() {
    if (!plan) return;
    let content;
    if (activeView === "readings") content = renderReadings();
    else if (activeView === "journey") content = renderJourney();
    else if (activeView === "progress") content = renderProgress();
    else content = renderReadings();
    root.innerHTML = `${activeView === "progress" ? "" : guestBanner()}${content}`;
    window.TJMNativeBible?.enhance(root);
  }

  async function persistProgress(previousCompleted, previousLastIndex) {
    if (!session) return;
    setSync("Saving…", "saving");
    const { error } = await db.from("reading_plan_progress").upsert({
      user_id: session.user.id,
      plan_id: CONFIG.planId,
      completed_indices: Array.from(completed).sort((a, b) => a - b),
      last_index: lastIndex,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,plan_id" });

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

  async function loadMemberData() {
    setSync("Syncing your progress…", "saving");
    const userId = session.user.id;
    const progressResult = await db.from("reading_plan_progress").select("completed_indices,last_index,updated_at").eq("user_id", userId).eq("plan_id", CONFIG.planId).maybeSingle();
    if (progressResult.error) throw progressResult.error;
    let memberData = progressResult.data;
    if (!memberData && plan.previousPlanId) {
      const { data: legacyData, error: legacyError } = await db.from("reading_plan_progress")
        .select("completed_indices,last_index,updated_at")
        .eq("user_id", userId)
        .eq("plan_id", plan.previousPlanId)
        .maybeSingle();
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
      if (taskLegacyError) throw taskLegacyError;
      if (taskLegacyData) {
        const migrated = migrateV2Progress(taskLegacyData);
        memberData = { completed_indices: migrated.completed, last_index: migrated.lastIndex, updated_at: new Date().toISOString() };
      }
    }
    if (!memberData && plan.originalLegacyPlanId) {
      const { data: originalLegacyData, error: originalLegacyError } = await db.from("reading_plan_progress").select("completed_indices,last_index,updated_at").eq("user_id", userId).eq("plan_id", plan.originalLegacyPlanId).maybeSingle();
      if (originalLegacyError) throw originalLegacyError;
      if (originalLegacyData) {
        const migrated = migrateV1Progress(originalLegacyData);
        memberData = { completed_indices: migrated.completed, last_index: migrated.lastIndex, updated_at: new Date().toISOString() };
      }
    }
    if (memberData && !progressResult.data) {
      const { error: migrationError } = await db.from("reading_plan_progress").upsert({ user_id: userId, plan_id: CONFIG.planId, completed_indices: memberData.completed_indices, last_index: memberData.last_index, updated_at: memberData.updated_at }, { onConflict: "user_id,plan_id" });
      if (migrationError) throw migrationError;
    }
    completed = new Set((memberData?.completed_indices ?? []).map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < plan.chapterCount));
    lastIndex = normalizeIndex(memberData?.last_index ?? 0);
    currentIndex = lastIndex;
    activeSection = currentReading().section;
    setSync("Synced with the app", "synced");
  }

  function updateProfile() {
    if (!session) {
      profileButton.hidden = true;
      return;
    }
    const name = displayName();
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
      try {
        await Promise.all([loadMemberData(), window.TJMNativeBible?.syncHighlights()]);
        render();
      } catch (error) {
        console.warn("Background sync", error.message);
      }
    }, 45000);
  }

  async function applySession(nextSession) {
    session = nextSession;
    accountMenu.hidden = true;
    updateProfile();
    if (!session) {
      completed = new Set();
      currentIndex = 0;
      lastIndex = 0;
      activeSection = plan.readings[0].section;
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
    if (target.hasAttribute("data-require-sign-in")) showSignIn();
    else if (target.dataset.readingNav) goToReading(currentIndex + (target.dataset.readingNav === "next" ? 1 : -1));
    else if (target.dataset.readingIndex !== undefined) goToReading(Number(target.dataset.readingIndex));
    else if (target.dataset.section !== undefined) {
      activeSection = activeSection === target.dataset.section ? "" : target.dataset.section;
      render();
    } else if (target.dataset.viewShortcut) showView(target.dataset.viewShortcut, true);
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
      try {
        await Promise.all([loadMemberData(), window.TJMNativeBible?.syncHighlights()]);
        render();
      } catch (error) {
        console.warn(error.message);
      }
    }
  });

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
      if (plan.planId !== CONFIG.planId || plan.notesPlanId !== CONFIG.notesPlanId || !Array.isArray(plan.readings) || plan.readings.length !== plan.readingCount || plan.readings.length !== 313 || plan.chapterCount !== 1205 || !indicesAreValid || !chaptersAreValid || !jobIsInPlace) throw new Error("Reading plan validation failed.");
      document.getElementById("hero-reading-count").textContent = plan.readings.length;
      document.getElementById("hero-section-count").textContent = plan.sections.length;
      activeSection = plan.readings[0].section;
      window.TJMNativeBible.configure({ getDb: () => db, getSession: () => session, toast, planId: CONFIG.planId });
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
