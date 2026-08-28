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
    return Math.round((completed.size / plan.readings.length) * 100);
  }

  function nextIncomplete() {
    return plan.readings.find((reading) => !completed.has(reading.index)) ?? plan.readings[plan.readings.length - 1];
  }

  function sectionReadings(title) {
    return plan.readings.filter((reading) => reading.section === title);
  }

  function showSignIn() {
    authError.textContent = "";
    authGate.hidden = false;
  }

  function guestBanner() {
    if (session || !guestBrowsing) return "";
    return `<aside class="save-banner" aria-label="Saving requires sign-in"><div><strong>Viewing without an account</strong><span>You can explore every reading, but your completed assignments and reading place are saved and synced only after you sign in.</span></div><button class="button button-primary" type="button" data-require-sign-in>Sign in to save</button></aside>`;
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

  function sourceTaskLinks(reading) {
    if (!reading.bibleTasks?.length) return `<button class="button button-primary" type="button" disabled>No chapter links available</button>`;
    return `<div class="source-task-list" aria-label="Scripture chapter choices">${reading.bibleTasks.map((task) => `<a class="button button-primary source-task" href="${escapeHTML(task.url)}" target="_blank" rel="noopener noreferrer">Read ${escapeHTML(task.label)} <span>↗</span></a>`).join("")}</div>`;
  }

  function completionControl(reading) {
    if (!session) return `<button class="button button-secondary" type="button" data-require-sign-in>Sign in to save progress</button>`;
    return `<label class="complete-toggle"><input type="checkbox" data-reading-progress="${reading.index}" ${completed.has(reading.index) ? "checked" : ""}><i></i><span>Reading complete</span></label>`;
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
            <p class="eyebrow">${escapeHTML(reading.section)} · READING ${reading.number} OF ${plan.readings.length}</p>
            <h2 id="readings-heading">${escapeHTML(reading.reference)}</h2>
            <p>Move at your own pace. Each numbered assignment stays together, while the chapter buttons open only one Bible chapter at a time.</p>
          </div>
          <div class="reading-switcher" aria-label="Reading navigation">
            <button class="icon-button" type="button" data-reading-nav="prev" aria-label="Previous reading" ${currentIndex === 0 ? "disabled" : ""}>‹</button>
            <span class="reading-number"><strong>Reading ${reading.number}</strong><small>${percent}% COMPLETE</small></span>
            <button class="icon-button" type="button" data-reading-nav="next" aria-label="Next reading" ${currentIndex === plan.readings.length - 1 ? "disabled" : ""}>›</button>
          </div>
        </header>

        <div class="readings-grid">
          <article class="reading-card scripture-card">
            <div class="card-kicker"><span>THE BIBLE</span><span class="source-order">SCRIPTURE READING</span></div>
            <h3>${escapeHTML(reading.reference)}</h3>
            <p class="citation">Choose a chapter below. Each link opens only that chapter on Bible Gateway in the King James Version.</p>
            <div class="reading-actions">
              ${sourceTaskLinks(reading)}
              ${completionControl(reading)}
            </div>
            ${reviewFlag(reading)}
            <details class="source-exact dark"><summary>View exact supplied assignment</summary><pre>${escapeHTML(reading.reference)}</pre></details>
          </article>

          <aside class="chapter-side" aria-labelledby="reading-place-heading">
            <p class="eyebrow">YOUR READING PLACE</p>
            <h3 id="reading-place-heading">${session ? "Synced with the app." : "Sign in when you want to save."}</h3>
            <p>${session ? "Your completed readings and current place use the same Google account record as the chronological plan in Try Jesus: The Journey." : "You can explore the entire plan now. Google sign-in is optional and is required only for saved, cross-device progress."}</p>
            <div class="side-progress">
              <div class="progress-track"><i style="width:${percent}%"></i></div>
              <strong>${completed.size} of ${plan.readings.length}</strong>
              <small>READINGS COMPLETE · ${percent}%</small>
            </div>
            ${session ? `<button class="button button-primary" type="button" data-reading-index="${next.index}">Continue with reading ${next.number}</button>` : `<button class="button button-primary" type="button" data-require-sign-in>Sign in with Google to sync</button>`}
            <button class="button button-secondary" type="button" data-view-shortcut="journey">View the full journey</button>
          </aside>
        </div>
      </section>`;
  }

  function renderJourney() {
    const sections = plan.sections.map((section) => {
      const readings = sectionReadings(section.title);
      const completeCount = readings.filter((reading) => completed.has(reading.index)).length;
      const percent = Math.round((completeCount / readings.length) * 100);
      const open = activeSection === section.title;
      return `<article class="book-section">
        <button class="book-summary" type="button" data-section="${escapeHTML(section.title)}" aria-expanded="${open}">
          <span class="book-badge">${String(section.number).padStart(2, "0")}</span>
          <span><h3>${escapeHTML(section.title)}</h3><p>Readings ${readings[0].number}–${readings[readings.length - 1].number} · ${readings.length} ${readings.length === 1 ? "assignment" : "assignments"}</p></span>
          <span class="book-progress"><span class="progress-track"><i style="width:${percent}%"></i></span><small>${completeCount} OF ${readings.length} COMPLETE</small></span>
        </button>
        ${open ? `<div class="reading-list">${readings.map((reading) => `<button class="journey-reading ${completed.has(reading.index) ? "done" : ""}" type="button" data-reading-index="${reading.index}"><span class="reading-check">✓</span><span><strong>Reading ${reading.number}</strong><small>${escapeHTML(reading.reference)}</small></span><em>Open →</em></button>`).join("")}</div>` : ""}
      </article>`;
    }).join("");

    return `<section aria-labelledby="journey-heading"><header class="view-heading"><div><p class="eyebrow">THE COMPLETE SEQUENCE</p><h2 id="journey-heading">The chronological journey</h2><p>All 150 assignments are preserved in their supplied order. Expand a section and choose any numbered reading.</p></div></header><div class="book-grid">${sections}</div>${plan.reviewQueue?.length ? `<details class="review-queue"><summary>${plan.reviewQueue.length} supplied reference marked for review</summary>${plan.reviewQueue.map((item) => `<div class="review-item"><strong>${escapeHTML(item.reference)}</strong><br>${escapeHTML(item.note)}</div>`).join("")}</details>` : ""}</section>`;
  }

  function renderProgress() {
    const percent = percentComplete();
    const next = nextIncomplete();
    const rows = plan.sections.map((section) => {
      const readings = sectionReadings(section.title);
      const count = readings.filter((reading) => completed.has(reading.index)).length;
      const sectionPercent = Math.round((count / readings.length) * 100);
      return `<div class="book-progress-row"><header><span>${escapeHTML(section.title)}</span><span>${count} / ${readings.length}</span></header><div class="progress-track"><i style="width:${sectionPercent}%"></i></div></div>`;
    }).join("");

    return `<section aria-labelledby="progress-heading"><header class="view-heading"><div><p class="eyebrow">YOUR READING PROGRESS</p><h2 id="progress-heading">Continue the story</h2><p>${session ? "This progress is connected to the same signed-in record used by the Try Jesus app." : "Sign in with Google whenever you want this progress saved and synced across the website and app."}</p></div></header>${guestBanner()}<div class="stat-grid"><article class="stat-card"><strong>${completed.size}</strong><span>Readings complete</span></article><article class="stat-card"><strong>${plan.readings.length - completed.size}</strong><span>Readings remaining</span></article><article class="stat-card"><strong>${percent}%</strong><span>Journey complete</span></article><article class="stat-card"><strong>${plan.sections.length}</strong><span>Story sections</span></article></div><div class="progress-layout progress-layout-wide"><article class="progress-panel"><h3>Progress by section</h3>${rows}</article><aside class="next-reading-card"><p class="eyebrow">NEXT UNFINISHED READING</p><h3>Reading ${next.number}</h3><p>${escapeHTML(next.reference)}</p><button class="button button-primary" type="button" data-reading-index="${next.index}">Continue reading</button>${session ? "" : `<button class="button button-secondary" type="button" data-require-sign-in>Sign in to save progress</button>`}</aside></div></section>`;
  }

  function render() {
    if (!plan) return;
    let content;
    if (activeView === "readings") content = renderReadings();
    else if (activeView === "journey") content = renderJourney();
    else content = renderProgress();
    root.innerHTML = `${activeView === "progress" ? "" : guestBanner()}${content}`;
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

  async function toggleReading(index, checked) {
    if (!session) {
      showSignIn();
      return;
    }
    const readingIndex = normalizeIndex(index);
    const previousCompleted = new Set(completed);
    const previousLastIndex = lastIndex;
    if (checked) completed.add(readingIndex);
    else completed.delete(readingIndex);
    currentIndex = readingIndex;
    lastIndex = readingIndex;
    render();
    await persistProgress(previousCompleted, previousLastIndex);
  }

  async function loadMemberData() {
    setSync("Syncing your progress…", "saving");
    const { data, error } = await db.from("reading_plan_progress")
      .select("completed_indices,last_index,updated_at")
      .eq("user_id", session.user.id)
      .eq("plan_id", CONFIG.planId)
      .maybeSingle();
    if (error) throw error;
    completed = new Set((data?.completed_indices ?? []).map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < plan.readings.length));
    lastIndex = normalizeIndex(data?.last_index ?? 0);
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
        await loadMemberData();
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
    if (target.matches("[data-reading-progress]")) toggleReading(target.dataset.readingProgress, target.checked);
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
        await loadMemberData();
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
      if (plan.planId !== CONFIG.planId || !Array.isArray(plan.readings) || plan.readings.length !== 150 || !indicesAreValid) throw new Error("Reading plan validation failed.");
      document.getElementById("hero-reading-count").textContent = plan.readings.length;
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
