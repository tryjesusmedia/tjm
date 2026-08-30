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
  let principles = [];
  let posts = [];
  let replies = [];
  let selectedMembersPrincipleId = "";
  let principleSearch = "";
  let refreshTimer = null;
  const principleManager = window.TJMPrinciples.createController({
    planId: CONFIG.planId,
    exportFilename: "chronological-bible",
    getDb: () => db,
    getSession: () => session,
    getPrinciples: () => principles,
    setPrinciples: (nextPrinciples) => { principles = nextPrinciples; },
    getReadings: () => plan?.readings || [],
    escapeHTML,
    toast,
    setSync,
    showSignIn,
    rerender: render,
    showPrinciples: () => showView("principles", true),
    goToReadingById: (readingId) => {
      const index = plan.readings.findIndex((reading) => reading.id === readingId);
      if (index >= 0) goToReading(index, "readings");
    },
    readingLabel: (reading) => `${reading.title} · ${reading.reference}`,
  });

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

  function chaptersForTaskIndices(indices) {
    return indices.flatMap((taskIndex) => plan.taskChapterMigration?.[String(taskIndex)] ?? []);
  }

  function migrateV2Progress(data) {
    return {
      completed: Array.from(new Set(chaptersForTaskIndices((data?.completed_indices ?? []).map(Number)))).sort((left, right) => left - right),
      lastIndex: normalizeIndex(data?.last_index ?? 0),
    };
  }

  function migrateV1Progress(data) {
    const completedLegacy = new Set((data?.completed_indices ?? []).map(Number));
    const completedTasks = Array.from(completedLegacy).flatMap((legacyIndex) => plan.legacyMigration?.[String(legacyIndex)] ?? []);
    const lastLegacyIndex = Number(data?.last_index ?? 0);
    const lastChildren = plan.legacyMigration?.[String(lastLegacyIndex)] ?? [0];
    return {
      completed: Array.from(new Set(chaptersForTaskIndices(completedTasks))).sort((left, right) => left - right),
      lastIndex: completedLegacy.has(lastLegacyIndex) ? lastChildren.at(-1) : lastChildren[0],
    };
  }

  function nextPrincipleNumber() {
    return principleManager.nextNumber();
  }

  function showSignIn() {
    authError.textContent = "";
    authGate.hidden = false;
  }

  function guestBanner() {
    if (session || !guestBrowsing) return "";
    return `<aside class="save-banner" aria-label="Saving requires sign-in"><div><strong>Viewing without an account</strong><span>You can explore every reading task, but chapter progress, numbered principles, cross-references, and principle groups are saved only after you sign in.</span></div><button class="button button-primary" type="button" data-require-sign-in>Sign in to save</button></aside>`;
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
    return `<div class="chapter-task-list" aria-label="Scripture chapter choices">${reading.bibleTasks.map((task) => `<div class="chapter-task-row"><input class="chapter-checkbox" type="checkbox" data-chapter-progress="${task.progressIndex}" data-reading-index="${reading.index}" aria-label="Mark ${escapeHTML(task.label)} complete" ${completed.has(task.progressIndex) ? "checked" : ""}><a class="button button-primary source-task" href="${escapeHTML(task.url)}" target="_blank" rel="noopener noreferrer">Read ${escapeHTML(task.label)} <span>↗</span></a></div>`).join("")}</div>`;
  }

  function reviewFlag(reading) {
    if (!reading.reviewNote) return "";
    return `<p class="source-flag"><span aria-hidden="true">△</span><span><strong>Source reference needs review.</strong><br>${escapeHTML(reading.reviewNote)}</span></p>`;
  }

  function principleMini(principle, shareButton = false) {
    const references = (principle.cross_reference_numbers ?? []).map((number) => `<button type="button" class="reference-chip" data-find-principle="${number}">#${number}</button>`).join("");
    return `<article class="principle-mini"><b>PRINCIPLE #${principle.principle_number}</b><p>${escapeHTML(principle.body)}</p>${references ? `<div class="reference-chips">${references}</div>` : ""}${shareButton ? `<button class="button button-secondary" type="button" data-share-principle="${principle.id}">Share my principle</button>` : ""}</article>`;
  }

  function renderPrinciplePanel(reading) {
    const readingPrinciples = principles.filter((principle) => principle.reading_id === reading.id);
    if (!session) return `<section class="chron-principle-panel" aria-labelledby="principle-heading"><p class="eyebrow">YOUR PRIVATE DISCOVERY</p><h3 id="principle-heading">Write numbered principles and connect your notes</h3><p>After you read, record the principles you discover in your own words. Sign in with Google to number them, cross-reference related notes, organize them into groups, and sync them across devices.</p><button class="button button-primary" type="button" data-require-sign-in>Sign in to save principles</button></section>`;
    return `<section class="chron-principle-panel" aria-labelledby="principle-heading"><div><p class="eyebrow">YOUR PRIVATE DISCOVERY</p><h3 id="principle-heading">What principles do you see in this reading?</h3><p>Write one principle at a time. Choose any unused number so you can organize and connect related discoveries anywhere in the journey.</p><form id="principle-form">${principleManager.renderCreateNumberField()}<div class="field"><label for="principle-body">The principle I see</label><textarea id="principle-body" maxlength="2000" required placeholder="In my own words…"></textarea></div><div class="field"><label for="cross-references">Related principle numbers</label><input id="cross-references" inputmode="numeric" maxlength="120" placeholder="12, 19, 42"><small>Separate numbers with commas. Existing principle numbers become connected references.</small></div><button class="button button-primary" type="submit">Save principle</button></form></div><div class="principles-for-reading"><strong>${readingPrinciples.length ? `${readingPrinciples.length} saved for this reading` : "No principles saved for this reading yet"}</strong>${readingPrinciples.map((principle) => principleManager.renderReadingPrinciple(principle)).join("")}</div></section>`;
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
            <p>${escapeHTML(reading.reference)}. Move at your own pace; every task contains no more than ten chapters, and each button opens only one Bible chapter at a time.</p>
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
            <p class="citation">${reading.partCount > 1 ? `Part ${reading.partNumber} of ${reading.partCount} from the original assignment “${escapeHTML(reading.sourceReference)}.” ` : ""}Choose a chapter below. Each link opens only that chapter on Bible Gateway in the King James Version.</p>
            <div class="reading-actions">
              ${sourceTaskLinks(reading)}
            </div>
            ${reviewFlag(reading)}
          </article>

          <aside class="chapter-side" aria-labelledby="reading-place-heading">
            <p class="eyebrow">YOUR READING PLACE</p>
            <h3 id="reading-place-heading">${session ? "Synced with the app." : "Sign in when you want to save."}</h3>
            <p>${session ? "Your completed readings and current place use the same Google account record as the chronological plan in Try Jesus: The Journey." : "You can explore the entire plan now. Google sign-in is optional and is required only for saved, cross-device progress."}</p>
            <div class="side-progress">
              <div class="progress-track"><i style="width:${percent}%"></i></div>
              <strong>${completedTaskCount()} of ${plan.readings.length} tasks</strong>
              <small>${completed.size} OF ${plan.chapterCount} CHAPTERS COMPLETE · ${percent}%</small>
            </div>
            ${session ? `<button class="button button-primary" type="button" data-reading-index="${next.index}">Continue next task</button>` : `<button class="button button-primary" type="button" data-require-sign-in>Sign in with Google to sync</button>`}
            <button class="button button-secondary" type="button" data-view-shortcut="journey">View the full journey</button>
          </aside>
        </div>
        ${renderPrinciplePanel(reading)}
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

    return `<section aria-labelledby="journey-heading"><header class="view-heading"><div><p class="eyebrow">THE COMPLETE SEQUENCE</p><h2 id="journey-heading">The chronological journey</h2><p>All ${plan.originalReadingCount} supplied assignments remain in their exact order and are now organized into ${plan.readings.length} manageable, named reading tasks.</p></div></header><div class="book-grid">${sections}</div>${plan.reviewQueue?.length ? `<details class="review-queue"><summary>${plan.reviewQueue.length} supplied reference marked for review</summary>${plan.reviewQueue.map((item) => `<div class="review-item"><strong>${escapeHTML(item.reference)}</strong><br>${escapeHTML(item.note)}</div>`).join("")}</details>` : ""}</section>`;
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
    return `<section aria-labelledby="progress-heading"><header class="view-heading"><div><p class="eyebrow">YOUR READING PROGRESS</p><h2 id="progress-heading">Continue the story</h2><p>${session ? "Your chapter progress is synced across your signed-in devices." : "Sign in with Google whenever you want progress and principles saved across devices."}</p></div></header>${guestBanner()}<div class="stat-grid"><article class="stat-card"><strong>${tasksComplete}</strong><span>Tasks complete</span></article><article class="stat-card"><strong>${completed.size}</strong><span>Chapters complete</span></article><article class="stat-card"><strong>${percent}%</strong><span>Journey complete</span></article><article class="stat-card"><strong>${principles.length}</strong><span>Personal principles</span></article></div><div class="progress-layout progress-layout-wide"><article class="progress-panel"><h3>Progress by section</h3>${rows}</article><aside class="next-reading-card"><p class="eyebrow">NEXT UNFINISHED READING TASK</p><h3>${escapeHTML(next.title)}</h3><p>${escapeHTML(next.reference)}</p><button class="button button-primary" type="button" data-reading-index="${next.index}">Continue reading</button>${session ? "" : `<button class="button button-secondary" type="button" data-require-sign-in>Sign in to save progress</button>`}<button class="button button-secondary" type="button" data-view-shortcut="principles">Open Principles</button></aside></div></section>`;
  }

  function renderMembers() {
    if (!session) return `<section aria-labelledby="members-heading"><header class="view-heading"><div><p class="eyebrow">LEARN FROM ONE ANOTHER</p><h2 id="members-heading">Members discussion</h2><p>Your private notes remain private unless you deliberately choose one to share.</p></div></header><div class="empty-card"><strong>Sign in to join Members.</strong><p>Google sign-in is required only when you want to share a principle, ask a question, or reply.</p><button class="button button-primary" type="button" data-require-sign-in>Sign in to join</button></div></section>`;
    const selected = principles.find((principle) => principle.id === selectedMembersPrincipleId);
    const feed = posts.map((post) => {
      const postReplies = replies.filter((reply) => reply.post_id === post.id);
      const reading = plan.readings.find((item) => item.id === post.reading_id);
      const author = post.author_name || "Try Jesus member";
      return `<article class="member-post"><div class="post-author">${post.author_avatar_url ? `<img class="avatar" src="${escapeHTML(post.author_avatar_url)}" alt="">` : `<span class="avatar">${escapeHTML(initials(author))}</span>`}<span><strong>${escapeHTML(author)}</strong><small>${reading ? `${escapeHTML(reading.title)} · ` : ""}${escapeHTML(new Date(post.created_at).toLocaleDateString())}</small></span></div>${post.principle_number ? `<blockquote class="post-principle"><b>PRINCIPLE #${post.principle_number}</b><br>${escapeHTML(post.principle_body || "")}</blockquote>` : ""}<p class="post-body">${escapeHTML(post.body)}</p><div class="reply-list">${postReplies.map((reply) => `<div class="reply"><b>${escapeHTML(reply.author_name || "Member")}</b> · ${escapeHTML(reply.body)}</div>`).join("")}</div><form class="reply-form" data-post-id="${post.id}"><input name="reply" maxlength="1000" required aria-label="Reply to ${escapeHTML(author)}" placeholder="Add to the discussion…"><button type="submit">Reply</button></form></article>`;
    }).join("");
    return `<section aria-labelledby="members-heading"><header class="view-heading"><div><p class="eyebrow">LEARN FROM ONE ANOTHER</p><h2 id="members-heading">Members discussion</h2><p>Share a principle or a sincere question. Your notes stay private until you deliberately post one here.</p></div></header><div class="members-layout"><aside class="share-panel"><p class="eyebrow">SHARE DELIBERATELY</p><h3>Share a principle</h3><p>Choose one of your numbered principles, add an observation or question, and share it with signed-in members.</p><form id="post-form"><div class="field"><label for="post-principle">Principle (optional)</label><select id="post-principle"><option value="">Share without a principle</option>${principles.map((principle) => `<option value="${principle.id}" ${selected?.id === principle.id ? "selected" : ""}>#${principle.principle_number} — ${escapeHTML(principle.body.slice(0, 72))}</option>`).join("")}</select></div><div class="field"><label for="post-body">Observation or question</label><textarea id="post-body" minlength="3" maxlength="2000" required placeholder="What did you notice, and what would you like other members to consider?"></textarea><small>This will be visible to signed-in members.</small></div><button class="button button-primary" type="submit">Post to Members</button></form></aside><div class="member-feed">${feed || `<div class="empty-card">No chronological-plan principles have been shared yet. You can begin the conversation.</div>`}</div></div></section>`;
  }

  function render() {
    if (!plan) return;
    let content;
    if (activeView === "readings") content = renderReadings();
    else if (activeView === "journey") content = renderJourney();
    else if (activeView === "progress") content = renderProgress();
    else content = principleManager.renderTab();
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

  function parseCrossReferences(value) {
    return Array.from(new Set(String(value).split(/[^0-9]+/).filter(Boolean).map(Number).filter((number) => Number.isInteger(number) && number > 0))).sort((a, b) => a - b);
  }

  async function createPrinciple(form) {
    await principleManager.createFromForm(form, currentReading().id);
  }

  async function deletePrinciple(id) {
    if (!window.confirm("Delete this private principle? Existing member posts will keep the shared snapshot.")) return;
    const { error } = await db.from("conflict_principles").delete().eq("id", id).eq("user_id", session.user.id);
    if (error) { toast(error.message, "error"); return; }
    principles = principles.filter((principle) => principle.id !== id);
    render();
  }

  async function createPost(form) {
    const principleId = form.querySelector("#post-principle").value;
    const principle = principles.find((item) => item.id === principleId);
    const body = form.querySelector("#post-body").value.trim();
    if (!body) return;
    const { data, error } = await db.from("conflict_discussion_posts").insert({ user_id: session.user.id, plan_id: CONFIG.planId, reading_id: principle?.reading_id || currentReading().id, principle_id: principle?.id || null, principle_number: principle?.principle_number || null, principle_body: principle?.body || null, body, author_name: displayName(), author_avatar_url: avatarUrl() || null }).select().single();
    if (error) { toast(error.message, "error"); return; }
    posts.unshift(data);
    selectedMembersPrincipleId = "";
    render();
    toast("Your principle is now visible to members.");
  }

  async function createReply(form) {
    const body = new FormData(form).get("reply")?.toString().trim();
    if (!body) return;
    const { data, error } = await db.from("conflict_discussion_replies").insert({ post_id: form.dataset.postId, user_id: session.user.id, body, author_name: displayName(), author_avatar_url: avatarUrl() || null }).select().single();
    if (error) { toast(error.message, "error"); return; }
    replies.push(data);
    render();
  }

  async function loadMemberData() {
    setSync("Syncing your progress…", "saving");
    const userId = session.user.id;
    const [progressResult, principlesResult] = await Promise.all([
      db.from("reading_plan_progress").select("completed_indices,last_index,updated_at").eq("user_id", userId).eq("plan_id", CONFIG.planId).maybeSingle(),
      db.from("conflict_principles").select("*").eq("user_id", userId).eq("plan_id", CONFIG.planId).order("principle_number"),
    ]);
    const firstError = [progressResult, principlesResult].find((result) => result.error)?.error;
    if (firstError) throw firstError;
    let memberData = progressResult.data;
    if (!memberData && plan.legacyPlanId) {
      const { data: legacyData, error: legacyError } = await db.from("reading_plan_progress")
        .select("completed_indices,last_index,updated_at")
        .eq("user_id", userId)
        .eq("plan_id", plan.legacyPlanId)
        .maybeSingle();
      if (legacyError) throw legacyError;
      if (legacyData) {
        const migrated = migrateV2Progress(legacyData);
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
    principles = principlesResult.data ?? [];
    posts = [];
    replies = [];
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
      principles = [];
      posts = [];
      replies = [];
      principleManager.resetForSession();
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
    if (principleManager.handleClick(target)) return;
    if (target.hasAttribute("data-require-sign-in")) showSignIn();
    else if (target.dataset.readingNav) goToReading(currentIndex + (target.dataset.readingNav === "next" ? 1 : -1));
    else if (target.dataset.readingIndex !== undefined) goToReading(Number(target.dataset.readingIndex));
    else if (target.dataset.section !== undefined) {
      activeSection = activeSection === target.dataset.section ? "" : target.dataset.section;
      render();
    } else if (target.dataset.viewShortcut) showView(target.dataset.viewShortcut, true);
    else if (target.dataset.sharePrinciple) { selectedMembersPrincipleId = target.dataset.sharePrinciple; showView("members", true); }
    else if (target.dataset.findPrinciple) { principleSearch = String(target.dataset.findPrinciple); showView("progress", true); setTimeout(() => document.getElementById(`principle-${target.dataset.findPrinciple}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); }
    else if (target.dataset.deletePrinciple) deletePrinciple(target.dataset.deletePrinciple);
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (principleManager.handleChange(target)) return;
    if (target.matches("[data-chapter-progress]")) {
      if (!session) target.checked = false;
      toggleChapter(target.dataset.chapterProgress, target.dataset.readingIndex, target.checked);
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
      const chapterIndices = plan.readings.flatMap((reading) => reading.bibleTasks.map((task) => task.progressIndex));
      const chaptersAreValid = chapterIndices.length === plan.chapterCount && chapterIndices.every((index, position) => index === position);
      if (plan.planId !== CONFIG.planId || !Array.isArray(plan.readings) || plan.readings.length !== plan.readingCount || plan.readings.length !== 309 || !indicesAreValid || !chaptersAreValid) throw new Error("Reading plan validation failed.");
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
