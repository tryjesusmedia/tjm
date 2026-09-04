(() => {
  "use strict";

  const CONFIG = window.TJM_CONFIG;
  const CONTENT = window.TJM_CONTENT;
  const STORAGE_KEY = "tjmJourneyStateV1";
  const appMain = document.getElementById("app-main");
  const modalRoot = document.getElementById("modal-root");
  const toastRegion = document.getElementById("toast-region");
  const sidebar = document.getElementById("sidebar");
  const menuButton = document.getElementById("menu-button");
  const drawerBackdrop = document.getElementById("drawer-backdrop");
  const installHeaderButton = document.getElementById("install-header-button");

  let deferredInstallPrompt = null;
  let state = loadState();

  function defaultState() {
    return {
      onboarded: false,
      selectedCompass: null,
      compassResult: "evidence",
      name: "Guest",
      progress: { future: [] },
      reflections: [],
      decisions: {},
      questions: [],
      installed: window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true,
      installDismissed: false,
      firstLessonInstallShown: false,
      createdAt: new Date().toISOString()
    };
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return { ...defaultState(), ...(stored || {}), progress: { future: [], ...((stored || {}).progress || {}) } };
    } catch (error) {
      return defaultState();
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* Storage can be unavailable in private or file contexts. */ }
    updateChrome();
  }

  function escapeHTML(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function routeTo(route) {
    const hash = `#/${route}`;
    if (location.hash === hash) renderRoute();
    else location.hash = hash;
  }

  function getRoute() {
    return location.hash.replace(/^#\/?/, "") || (state.onboarded ? "home" : "welcome");
  }

  function setOnboardingMode(isOnboarding) {
    document.body.classList.toggle("onboarding", isOnboarding);
  }

  function currentJourney() {
    return CONTENT.journeys.find(j => j.id === "future");
  }

  function currentProgress() {
    return state.progress.future || [];
  }

  function completedCount() {
    return currentProgress().length;
  }

  function nextLesson() {
    const journey = currentJourney();
    return journey.lessons.find(lesson => !currentProgress().includes(lesson.id)) || journey.lessons[journey.lessons.length - 1];
  }

  function percentComplete() {
    return Math.round((completedCount() / currentJourney().lessons.length) * 100);
  }

  function updateChrome(route = getRoute()) {
    const mainRoute = route.split("/")[0];
    document.querySelectorAll("[data-route]").forEach(el => {
      el.classList.toggle("active", el.dataset.route === mainRoute || (mainRoute === "lesson" && el.dataset.route === "journeys"));
    });
    document.querySelectorAll("[data-live-link]").forEach(link => link.href = CONFIG.LIVE_DISCUSSION_URL);
    const initial = (state.name || "Guest").trim().charAt(0).toUpperCase() || "G";
    const initialEl = document.getElementById("profile-initial");
    if (initialEl) initialEl.textContent = initial;
    installHeaderButton.hidden = !state.onboarded || state.installed;
  }

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastRegion.appendChild(toast);
    setTimeout(() => toast.remove(), 3800);
  }

  function openModal(html, dark = false) {
    document.body.classList.add("modal-open");
    modalRoot.innerHTML = `<div class="modal ${dark ? "dark" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    modalRoot.querySelector(".modal-close")?.addEventListener("click", closeModal);
    modalRoot.addEventListener("click", modalBackdropClose, { once: true });
  }

  function modalBackdropClose(event) {
    if (event.target === modalRoot) closeModal();
  }

  function closeModal() {
    document.body.classList.remove("modal-open");
    modalRoot.innerHTML = "";
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isSafari() {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  }

  function installCardHTML(light = false, locationLabel = "welcome") {
    if (state.installed) return "";
    return `
      <div class="install-card ${light ? "light" : ""}" data-install-location="${locationLabel}">
        <img src="assets/icon-192.png" alt="Try Jesus app icon" width="58" height="58">
        <div>
          <h3>Take Your Journey With You</h3>
          <p>Install the free app to save your progress, keep private notes, and return to your next Bible guide with one tap.</p>
        </div>
        <button class="button ${light ? "button-dark" : "button-primary"} button-small" type="button" data-install-app>Install App</button>
      </div>`;
  }

  async function promptInstall() {
    if (state.installed) {
      showToast("The app is already installed.");
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === "accepted") {
        state.installed = true;
        state.installDismissed = false;
        saveState();
        showToast("Try Jesus has been added to your device.");
      }
      deferredInstallPrompt = null;
      return;
    }
    if (isIOS()) {
      openModal(`
        <button class="modal-close" aria-label="Close">×</button>
        <img class="modal-logo" src="assets/icon-192.png" alt="">
        <h2>Install on iPhone or iPad</h2>
        <p>Apple places the install command in Safari’s Share menu.</p>
        <ol class="ios-steps">
          <li>Open this page in <strong>Safari</strong>${isSafari() ? "." : " if it is not already open there."}</li>
          <li>Tap the <strong>Share</strong> icon.</li>
          <li>Choose <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>.</li>
        </ol>
        <div class="modal-actions"><button class="button button-dark" data-modal-done>Got It</button></div>
      `);
      modalRoot.querySelector("[data-modal-done]")?.addEventListener("click", closeModal);
      return;
    }
    openModal(`
      <button class="modal-close" aria-label="Close">×</button>
      <img class="modal-logo" src="assets/icon-192.png" alt="">
      <h2>Install Try Jesus</h2>
      <p>Your browser has not exposed the one-tap install button yet. Open the browser menu and choose <strong>Install app</strong>, <strong>Add to Home Screen</strong>, or the install icon in the address bar.</p>
      <div class="modal-actions"><button class="button button-dark" data-modal-done>Got It</button></div>
    `);
    modalRoot.querySelector("[data-modal-done]")?.addEventListener("click", closeModal);
  }

  function openFourthwall() {
    const url = CONFIG.FOURTHWALL_URL || "";
    if (!url || url.includes("YOUR-FOURTHWALL")) {
      openModal(`
        <button class="modal-close" aria-label="Close">×</button>
        <div class="more-icon">◆</div>
        <h2>Connect Your Fourthwall Store</h2>
        <p>The app invitation is ready, but the exact Fourthwall storefront URL has not been supplied. Open <strong>config.js</strong> and replace the FOURTHWALL_URL value once.</p>
        <div class="modal-actions"><button class="button button-dark" data-modal-done>Understood</button></div>
      `);
      modalRoot.querySelector("[data-modal-done]")?.addEventListener("click", closeModal);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function attachGlobalActions() {
    appMain.querySelectorAll("[data-go]").forEach(el => el.addEventListener("click", () => routeTo(el.dataset.go)));
    appMain.querySelectorAll("[data-install-app]").forEach(el => el.addEventListener("click", promptInstall));
    appMain.querySelectorAll("[data-fourthwall]").forEach(el => el.addEventListener("click", openFourthwall));
    appMain.querySelectorAll("[data-live]").forEach(el => {
      if (el.tagName === "A") el.href = CONFIG.LIVE_DISCUSSION_URL;
      else el.addEventListener("click", () => window.open(CONFIG.LIVE_DISCUSSION_URL, "_blank", "noopener,noreferrer"));
    });
  }

  function renderRoute() {
    const route = getRoute();
    const parts = route.split("/");
    const root = parts[0];

    if (!state.onboarded && !["welcome", "install", "intro", "compass", "result"].includes(root)) {
      routeTo("welcome");
      return;
    }

    setOnboardingMode(["welcome", "install", "intro", "compass", "result"].includes(root));
    closeDrawer();

    if (root === "welcome") renderWelcome();
    else if (root === "install") renderInstallLanding();
    else if (root === "intro") renderIntro();
    else if (root === "compass") renderCompass();
    else if (root === "result") renderResult();
    else if (root === "home") renderHome();
    else if (root === "journeys") renderJourneys();
    else if (root === "journey") renderJourney(parts[1] || "future");
    else if (root === "lesson") renderLesson(parts[1] || "day-1");
    else if (root === "journal") renderJournal();
    else if (root === "questions") renderQuestions();
    else if (root === "more") renderMore();
    else renderHome();

    updateChrome(route);
    attachGlobalActions();
    appMain.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function renderWelcome() {
    appMain.innerHTML = `
      <section class="hero-welcome">
        <div class="hero-welcome-inner">
          <div class="hero-welcome-copy">
            <p class="eyebrow gold">A PRIVATE GUIDED BIBLE JOURNEY</p>
            <h1 class="display">Before You Reject Jesus, <em>Meet Him for Yourself.</em></h1>
            <p class="lead">Explore the evidence, ask honest questions, and experience the teachings of Jesus. Decide what you believe for yourself.</p>
            <div class="hero-actions">
              <button class="button button-primary" data-go="intro">Begin My Private Journey <span>→</span></button>
              ${state.progress.future.length ? '<button class="button button-light" data-resume>Continue Where I Left Off</button>' : '<button class="button button-light" data-go="compass">Show Me How It Works</button>'}
            </div>
            <div class="trust-line"><span>No pressure</span><span>No previous Bible knowledge</span><span>Your notes stay private</span></div>
          </div>
          <div class="hero-emblem">
            <img src="assets/logo-768.png" alt="Try Jesus Media lion and lamb emblem">
            <div class="hero-quote"><small>THE INVITATION</small><p>“You do not have to arrive with faith. You only have to arrive with honesty.”</p></div>
          </div>
        </div>
      </section>`;
    appMain.querySelector("[data-resume]")?.addEventListener("click", () => {
      state.onboarded = true;
      saveState();
      routeTo("home");
    });
  }

  function renderInstallLanding() {
    appMain.innerHTML = `
      <section class="intro-screen" style="background:linear-gradient(135deg,#171418,#3a223b);color:var(--ivory)">
        <div class="intro-card" style="background:rgba(255,255,255,.06);border-color:rgba(238,189,74,.25);box-shadow:var(--shadow-dark)">
          <img src="assets/icon-192.png" alt="Try Jesus app icon" style="width:92px;height:92px;border-radius:24px;margin:0 auto 22px;box-shadow:0 18px 42px rgba(0,0,0,.35)">
          <p class="eyebrow gold">WELCOME TO TRY JESUS: THE JOURNEY</p>
          <h1 class="display" style="color:var(--ivory)">Take Your Journey With You.</h1>
          <p class="lead" style="color:rgba(243,232,208,.72)">Install the free app to save your progress, keep private notes, receive a clear next step, and return to Thursday’s live discussion invitation with one tap.</p>
          <div class="intro-points">
            <div class="intro-point" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1)"><strong style="color:var(--gold)">Save Progress</strong><span style="color:rgba(243,232,208,.6)">Return exactly where you stopped.</span></div>
            <div class="intro-point" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1)"><strong style="color:var(--gold)">Private Notes</strong><span style="color:rgba(243,232,208,.6)">Keep reflections on your device.</span></div>
            <div class="intro-point" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1)"><strong style="color:var(--gold)">One Clear Step</strong><span style="color:rgba(243,232,208,.6)">No overwhelming content library.</span></div>
          </div>
          ${state.installed ? '<div class="locked-badge" style="display:inline-block;margin-bottom:15px">APP ALREADY INSTALLED</div>' : '<button class="button button-primary" data-install-app>Install the Free App</button>'}
          <button class="button button-light" data-go="intro" style="margin-left:8px">Begin My Journey →</button>
          <p style="font-size:.7rem;color:rgba(243,232,208,.45);margin-top:17px">No payment. No pressure. Install only when it serves your journey.</p>
        </div>
      </section>`;
  }

  function renderIntro() {
    appMain.innerHTML = `
      <section class="intro-screen">
        <div class="intro-card">
          <div class="intro-icon">◇</div>
          <p class="eyebrow">THIS IS NOT ANOTHER SERMON LIBRARY</p>
          <h1 class="display">A Journey Built Around the Questions That Matter to You.</h1>
          <p class="lead">You will not be handed hundreds of videos and told to figure everything out alone. Your path will move from curiosity to evidence, from evidence to encounter, and from encounter to an honest next step.</p>
          <div class="intro-points">
            <div class="intro-point"><strong>Examine</strong><span>Read the Bible in context and explore credible historical sources.</span></div>
            <div class="intro-point"><strong>Reflect</strong><span>Keep private notes and consider what each discovery means personally.</span></div>
            <div class="intro-point"><strong>Decide</strong><span>Choose your next step without pressure, performance, or manipulation.</span></div>
          </div>
          <button class="button button-dark" data-go="compass">Personalize My Journey →</button>
          <button class="button button-text" data-go="welcome" style="display:block;margin:16px auto 0">Return</button>
        </div>
      </section>`;
  }

  function renderCompass() {
    const options = CONTENT.compassOptions.map(option => `
      <button class="compass-option ${state.selectedCompass === option.id ? "selected" : ""}" type="button" data-compass="${option.id}">
        <span class="symbol">${option.icon}</span>
        <span><strong>${option.title}</strong><small>${option.description}</small></span>
        <span class="check">✓</span>
      </button>`).join("");
    appMain.innerHTML = `
      <div class="page narrow">
        <div class="progress-mini" aria-label="Step 2 of 3"><span class="active"></span><span class="active"></span><span></span></div>
        <header class="compass-header">
          <p class="eyebrow">YOUR SPIRITUAL COMPASS</p>
          <h1 class="display">What Are You Really Searching For?</h1>
          <p>The answer may determine where your journey should begin. Choose the statement that feels most true right now.</p>
        </header>
        <div class="compass-grid">${options}</div>
        <div class="compass-actions"><button class="button button-dark" id="reveal-compass" ${state.selectedCompass ? "" : "disabled"}>Reveal My Starting Point →</button></div>
      </div>`;

    appMain.querySelectorAll("[data-compass]").forEach(button => {
      button.addEventListener("click", () => {
        state.selectedCompass = button.dataset.compass;
        const selected = CONTENT.compassOptions.find(o => o.id === state.selectedCompass);
        state.compassResult = selected?.result || "evidence";
        saveState();
        renderCompass();
      });
    });
    appMain.querySelector("#reveal-compass")?.addEventListener("click", () => routeTo("result"));
  }

  function renderResult() {
    const result = CONTENT.results[state.compassResult] || CONTENT.results.evidence;
    appMain.innerHTML = `
      <section class="result-wrap">
        <div class="result-card">
          <div class="result-symbol">✦</div>
          <p class="eyebrow gold">${result.label}</p>
          <h1 class="display">${result.title}</h1>
          <h2>${result.headline}</h2>
          <p class="result-body">${result.body}</p>
          <div class="result-start">${result.start}</div>
          <button class="button button-primary" id="begin-result">${result.button} →</button>
          ${installCardHTML(false, "welcome-result")}
          <button class="button button-text" data-go="compass" style="display:block;margin:18px auto 0;color:var(--gold-light)">Change my answer</button>
        </div>
      </section>`;
    appMain.querySelector("#begin-result")?.addEventListener("click", () => {
      state.onboarded = true;
      saveState();
      routeTo("home");
    });
  }

  function renderHome() {
    const next = nextLesson();
    const progress = percentComplete();
    const live = CONTENT.liveInvites[completedCount() % CONTENT.liveInvites.length];
    const journeys = CONTENT.journeys.slice(1).map(journeyCardHTML).join("");
    appMain.innerHTML = `
      <div class="page wide">
        <section class="community-banner" aria-label="Join the WhatsApp family chat">
          <div>
            <p class="eyebrow gold">YOU DO NOT HAVE TO STUDY ALONE</p>
            <h2 class="display">Join the WhatsApp Family Chat.</h2>
            <p>Ask questions, share what is on your heart, and connect with the Try Jesus Media family.</p>
          </div>
          <a class="button button-primary" href="${CONFIG.WHATSAPP_URL}" target="_blank" rel="noopener noreferrer">Join the WhatsApp Group</a>
        </section>
        <div class="dashboard-hero">
          <section class="continue-card">
            <span class="journey-label"><span class="pulse-dot"></span> YOUR NEXT REVELATION</span>
            <h1 class="display">${next.title}</h1>
            <p class="summary">${next.teaser}</p>
            <div class="progress-row"><div class="progress-track"><span style="width:${progress}%"></span></div><small>${progress}% complete</small></div>
            <button class="button button-primary" data-go="lesson/${next.id}">${completedCount() ? "Continue the Bible Study" : "Begin the Bible Study"} →</button>
          </section>
          <div class="side-stack">
            <article class="dashboard-side-card dark">
              <div class="card-icon">✦</div>
              <h3>One Question to Carry Today</h3>
              <p>If God truly knows the end from the beginning, what part of your future are you still trying to control alone?</p>
              <button class="button button-light button-small" data-go="journal">Write My Reflection</button>
            </article>
            <article class="dashboard-side-card">
              <div class="card-icon">◆</div>
              <h3>Some breakthroughs need more than information.</h3>
              <p>Explore additional programs and resources designed to help you apply biblical truth to everyday life.</p>
              <button class="button button-ghost button-small" data-fourthwall>Explore More Programs</button>
            </article>
          </div>
        </div>
        ${!state.installed && !state.installDismissed ? installCardHTML(true, "dashboard") : ""}
        <section class="live-banner">
          <div><small>${CONFIG.THURSDAY_TIME.toUpperCase()}</small><h3>${live.headline}</h3><p>${live.copy}</p></div>
          <a class="button button-primary" data-live href="${CONFIG.LIVE_DISCUSSION_URL}" target="_blank" rel="noopener">${live.button}</a>
        </section>
        <div class="section-head"><div><h2>Choose Another Bible Study</h2><p>Choose one clear question and move at your own pace.</p></div><button data-go="journeys">View all Bible studies →</button></div>
        <div class="journey-grid">${journeys}</div>
      </div>`;
  }

  function journeyCardHTML(journey) {
    const available = journey.status === "available";
    return `
      <article class="journey-card accent-${journey.accent || "gold"}">
        <div class="journey-icon">${available ? "◇" : "✦"}</div>
        <p class="journey-eyebrow">${journey.eyebrow}</p>
        <h3>${journey.title}</h3>
        <p>${journey.subtitle}</p>
        <div class="card-bottom"><span>${journey.duration}</span>${available ? `<button class="button button-text" data-go="journey/${journey.id}">Open →</button>` : '<span class="locked-badge">PREVIEW</span>'}</div>
      </article>`;
  }

  function renderJourneys() {
    const all = CONTENT.journeys.map(journey => {
      if (journey.id === "future") {
        return `
          <article class="journey-card accent-gold">
            <div class="journey-icon">◇</div><p class="journey-eyebrow">${journey.eyebrow}</p><h3>${journey.title}</h3><p>${journey.subtitle}</p>
            <div class="card-bottom"><span>${journey.duration}</span><button class="button button-text" data-go="journey/future">Open →</button></div>
          </article>`;
      }
      return journeyCardHTML(journey);
    }).join("");
    appMain.innerHTML = `
      <div class="page">
        <header class="section-head" style="align-items:center;margin-top:0"><div><p class="eyebrow">GUIDED BIBLE STUDIES</p><h2 style="font-size:clamp(3rem,6vw,5rem)">Choose a Bible Question to Explore.</h2><p>Read Scripture, consider the evidence, and move at your own pace.</p></div></header>
        <div class="journey-grid">${all}</div>
        <section class="live-banner"><div><small>THURSDAY LIVE DISCUSSION</small><h3>Bible guides can start the conversation. Zoom can take it deeper.</h3><p>Bring your questions, keep your camera off, or simply listen.</p></div><a class="button button-primary" data-live href="${CONFIG.LIVE_DISCUSSION_URL}" target="_blank" rel="noopener">Join the Zoom Discussion</a></section>
      </div>`;
  }

  function renderJourney(id) {
    const journey = CONTENT.journeys.find(j => j.id === id) || currentJourney();
    if (!journey.lessons) {
      renderJourneys();
      return;
    }
    const rows = journey.lessons.map(lesson => {
      const complete = currentProgress().includes(lesson.id);
      return `
        <button class="lesson-row ${complete ? "complete" : ""}" type="button" data-go="lesson/${lesson.id}">
          <span class="lesson-number">${complete ? "✓" : lesson.day}</span>
          <span><h3>${lesson.title}</h3><p>${lesson.teaser}</p></span>
          <span class="lesson-meta"><strong>${lesson.estimated}</strong><span>${complete ? "Completed" : "Not started"}</span></span>
        </button>`;
    }).join("");
    appMain.innerHTML = `
      <div class="page">
        <section class="journey-detail-hero">
          <div><p class="eyebrow gold">${journey.eyebrow}</p><h1 class="display">${journey.title}</h1><p>${journey.subtitle}</p><div class="progress-row"><div class="progress-track"><span style="width:${percentComplete()}%"></span></div><small>${completedCount()} of ${journey.lessons.length} complete</small></div></div>
          <img class="journey-seal" src="assets/logo-512.png" alt="">
        </section>
        <div class="section-head"><div><h2>Your Seven-Day Bible Study</h2><p>Each day explores one question and prepares the next.</p></div></div>
        <div class="lesson-list">${rows}</div>
      </div>`;
  }

  function lessonById(id) {
    return currentJourney().lessons.find(lesson => lesson.id === id) || currentJourney().lessons[0];
  }

  function renderLesson(id) {
    const lesson = lessonById(id);
    const index = currentJourney().lessons.findIndex(item => item.id === lesson.id);
    const savedReflection = state.reflections.find(entry => entry.lessonId === lesson.id)?.text || "";
    const selectedDecision = state.decisions[lesson.id] || "";
    const evidenceHTML = lesson.evidence?.length ? `
      <section class="content-section">
        <p class="eyebrow">SOURCES AND EVIDENCE</p><h2>See the Sources for Yourself.</h2><p>Explore the historical setting and source material connected to this lesson.</p>
        <div class="evidence-list">${lesson.evidence.map(item => `<article class="evidence-item"><small>${item.source}</small><h3>${item.title}</h3><p>${item.description}</p><a href="${item.url}" target="_blank" rel="noopener">View the source →</a></article>`).join("")}</div>
      </section>` : "";
    const practicesHTML = lesson.practices?.length ? `
      <section class="content-section"><p class="eyebrow">CHOOSE ONE FAITH EXPERIMENT</p><h2>Try What Jesus Taught.</h2><div class="practice-grid">${lesson.practices.map((practice, i) => `<label class="practice-option"><input type="radio" name="practice" value="${escapeHTML(practice)}"><span>${practice}</span></label>`).join("")}</div></section>` : "";
    const resourceHTML = lesson.resourceOffer ? `
      <section class="live-banner" style="margin:30px 0"><div><small>TURN INSIGHT INTO ACTION</small><h3>${lesson.resourceOffer.headline}</h3><p>${lesson.resourceOffer.copy}</p></div><button class="button button-primary" data-fourthwall>${lesson.resourceOffer.button}</button></section>` : "";
    const decisions = lesson.decision.map(option => `<label class="decision-option"><input type="radio" name="decision" value="${escapeHTML(option)}" ${selectedDecision === option ? "checked" : ""}><span>${option}</span></label>`).join("");
    const complete = currentProgress().includes(lesson.id);
    const nextLessonItem = currentJourney().lessons[index + 1];

    appMain.innerHTML = `
      <div class="page lesson-page">
        <div class="lesson-topline"><button class="back-button" data-go="journey/future">← Back to journey</button><div class="lesson-progress"><div class="progress-track"><span style="width:${((index + 1) / 7) * 100}%"></span></div><span>Day ${lesson.day} of 7</span></div></div>
        <section class="lesson-hero"><p class="eyebrow gold">DAY ${lesson.day} • ${lesson.estimated}</p><h1 class="display">${lesson.title}</h1><p class="hook">${lesson.hook}</p><div class="lesson-meta-line"><span>Private reflection</span><span>Scripture-centered</span><span>Questions welcome</span></div></section>
        <div class="lesson-body">
          <div class="reading-block">${lesson.intro.map(p => `<p>${p}</p>`).join("")}</div>
          <section class="content-section scripture-card">
            <div class="scripture-label"><span>READ THE WORDS FOR YOURSELF</span><span>${lesson.scripture.version}</span></div>
            <div class="scripture-text">${lesson.scripture.text}</div>
            <a class="source-link" href="${lesson.scripture.url}" target="_blank" rel="noopener">Read ${lesson.scripture.reference} on Bible Gateway →</a>
          </section>
          <section class="content-section reveal-card"><p class="eyebrow">${lesson.revealTitle}</p><h2>${lesson.revealTitle}</h2><p>${lesson.reveal}</p></section>
          ${evidenceHTML}
          ${practicesHTML}
          ${resourceHTML}
          ${lesson.day === 3 || lesson.day === 6 ? liveInlineHTML() : ""}
          <section class="content-section reflection-card">
            <p class="eyebrow">NOW MAKE IT PERSONAL</p><h2>Pause Before Continuing.</h2><p class="reflection-question">${lesson.reflection}</p>
            <textarea class="textarea" id="lesson-reflection" placeholder="Write privately. Your reflection stays on this device unless you choose to share it.">${escapeHTML(savedReflection)}</textarea>
            <button class="button button-ghost button-small" type="button" id="save-reflection" style="margin-top:10px">Save to My Private Journal</button>
          </section>
          <section class="content-section"><p class="eyebrow">WHERE ARE YOU RIGHT NOW?</p><h2>Choose the Most Honest Answer.</h2><div class="decision-list">${decisions}</div></section>
          ${lesson.final ? finishPanelHTML() : `<section class="next-loop"><small>TOMORROW’S OPEN LOOP</small><p>${lesson.nextLoop}</p><button class="button button-primary" id="complete-lesson">${complete ? "Continue to the Next Lesson" : "Complete Day " + lesson.day} →</button></section>`}
          ${lesson.final ? `<button class="button button-primary button-block" id="complete-final" style="margin-top:14px">Complete My Seven-Day Journey</button>` : ""}
        </div>
      </div>`;

    appMain.querySelector("#save-reflection")?.addEventListener("click", () => saveLessonReflection(lesson));
    appMain.querySelector("#complete-lesson")?.addEventListener("click", () => completeLesson(lesson, nextLessonItem));
    appMain.querySelector("#complete-final")?.addEventListener("click", () => completeLesson(lesson, null));
    appMain.querySelectorAll('input[name="decision"]').forEach(input => input.addEventListener("change", () => {
      state.decisions[lesson.id] = input.value;
      saveState();
    }));
  }

  function liveInlineHTML() {
    return `
      <section class="live-banner" style="margin:30px 0"><div><small>YOU DO NOT HAVE TO STUDY ALONE</small><h3>A question like this deserves a real conversation.</h3><p>Join the live Thursday Bible discussion. Bring your questions, share your perspective, or keep your camera off and simply listen.</p></div><a class="button button-primary" data-live href="${CONFIG.LIVE_DISCUSSION_URL}" target="_blank" rel="noopener">Reserve My Place</a></section>`;
  }

  function finishPanelHTML() {
    return `
      <section class="finish-panel"><p class="eyebrow gold">THE DECISION ROOM</p><h2>What Is Jesus Inviting You to Do Next?</h2><p>A small honest step is more meaningful than a large decision made under pressure. Choose your response above, then complete the journey.</p><div class="finish-actions"><a class="button button-light" data-live href="${CONFIG.LIVE_DISCUSSION_URL}" target="_blank" rel="noopener">Join Thursday’s Discussion</a><button class="button button-light" data-fourthwall>Explore More Programs</button></div></section>`;
  }

  function saveLessonReflection(lesson, silent = false) {
    const textarea = document.getElementById("lesson-reflection");
    const text = textarea?.value.trim() || "";
    const existingIndex = state.reflections.findIndex(entry => entry.lessonId === lesson.id);
    if (!text) {
      if (!silent) showToast("Write a reflection before saving.", "error");
      return;
    }
    const entry = { lessonId: lesson.id, title: lesson.title, text, updatedAt: new Date().toISOString() };
    if (existingIndex >= 0) state.reflections[existingIndex] = entry;
    else state.reflections.unshift(entry);
    saveState();
    if (!silent) showToast("Reflection saved to your private journal.");
  }

  function completeLesson(lesson, nextLessonItem) {
    saveLessonReflection(lesson, true);
    const selected = appMain.querySelector('input[name="decision"]:checked');
    if (selected) state.decisions[lesson.id] = selected.value;
    if (!state.progress.future.includes(lesson.id)) state.progress.future.push(lesson.id);
    const firstCompletion = state.progress.future.length === 1;
    saveState();

    if (firstCompletion && !state.installed && !state.firstLessonInstallShown) {
      state.firstLessonInstallShown = true;
      saveState();
      openInstallAfterLessonModal(nextLessonItem);
      return;
    }

    if (nextLessonItem) routeTo(`lesson/${nextLessonItem.id}`);
    else openJourneyCompleteModal();
  }

  function openInstallAfterLessonModal(nextLessonItem) {
    openModal(`
      <button class="modal-close" aria-label="Close">×</button>
      <img class="modal-logo" src="assets/icon-192.png" alt="">
      <p class="eyebrow">YOUR FIRST MILESTONE</p>
      <h2>Your Journey Has Officially Begun.</h2>
      <p>Install the free app now to protect the momentum you just created, return to your next lesson with one tap, and keep your private notes close.</p>
      <div class="modal-actions"><button class="button button-primary" data-modal-install>Install the Free App</button><button class="button button-ghost" data-modal-continue>Continue Without Installing</button></div>
    `);
    modalRoot.querySelector("[data-modal-install]")?.addEventListener("click", async () => {
      closeModal();
      await promptInstall();
      if (nextLessonItem) routeTo(`lesson/${nextLessonItem.id}`);
      else routeTo("home");
    });
    modalRoot.querySelector("[data-modal-continue]")?.addEventListener("click", () => {
      closeModal();
      if (nextLessonItem) routeTo(`lesson/${nextLessonItem.id}`);
      else routeTo("home");
    });
  }

  function openJourneyCompleteModal() {
    openModal(`
      <button class="modal-close" aria-label="Close">×</button>
      <img class="modal-logo" src="assets/icon-192.png" alt="">
      <p class="eyebrow">JOURNEY COMPLETE</p>
      <h2>This May Be the Beginning.</h2>
      <p>Seven days ago, you began with a question. You have now examined Scripture, history, prophecy, the character of God, and your own response to Jesus.</p>
      <div class="modal-actions"><a class="button button-primary" href="${CONFIG.LIVE_DISCUSSION_URL}" target="_blank" rel="noopener">Join Thursday’s Discussion</a><button class="button button-ghost" data-modal-home>Return Home</button></div>
    `);
    modalRoot.querySelector("[data-modal-home]")?.addEventListener("click", () => { closeModal(); routeTo("home"); });
  }

  function renderJournal() {
    const entries = state.reflections.length ? state.reflections.map(entry => `
      <article class="journal-entry"><small>${new Date(entry.updatedAt).toLocaleDateString()}</small><h3>${escapeHTML(entry.title)}</h3><p>${escapeHTML(entry.text)}</p></article>`).join("") : `
      <div class="empty-state"><div class="empty-icon">✎</div><h2>Some discoveries become clearer when you write them down.</h2><p>Your private reflections will appear here as you move through the journey.</p><button class="button button-dark" data-go="journey/future">Open My Journey</button></div>`;
    appMain.innerHTML = `
      <div class="page">
        <header class="section-head" style="align-items:center;margin-top:0"><div><p class="eyebrow">PRIVATE JOURNAL</p><h2 style="font-size:clamp(3rem,6vw,5rem)">See How Your Thinking Is Changing.</h2><p>Your reflections remain in this browser’s local storage in this first version.</p></div></header>
        <div class="journal-grid"><div class="journal-list">${entries}</div><aside class="form-card"><p class="eyebrow">QUICK REFLECTION</p><h2 class="display" style="font-size:2rem;margin:0 0 10px">What are you carrying today?</h2><textarea class="textarea" id="quick-journal" placeholder="Write a private thought, prayer, or question..."></textarea><button class="button button-dark button-block" id="save-quick-journal" style="margin-top:10px">Save Reflection</button></aside></div>
      </div>`;
    appMain.querySelector("#save-quick-journal")?.addEventListener("click", () => {
      const text = document.getElementById("quick-journal").value.trim();
      if (!text) return showToast("Write something before saving.", "error");
      state.reflections.unshift({ lessonId: `quick-${Date.now()}`, title: "Personal Reflection", text, updatedAt: new Date().toISOString() });
      saveState();
      renderJournal();
      showToast("Reflection saved.");
    });
  }

  function renderQuestions() {
    appMain.innerHTML = `
      <div class="page">
        <div class="ask-layout">
          <section class="ask-hero"><p class="eyebrow">ASK WITHOUT EMBARRASSMENT</p><h1 class="display">Ask the Question You Have Never Felt Comfortable Asking.</h1><p>There are questions people ask in public—and questions they carry privately for years. This is a place to begin exploring both.</p><div class="topic-pills"><span class="topic-pill">God</span><span class="topic-pill">Jesus</span><span class="topic-pill">Prophecy</span><span class="topic-pill">Suffering</span><span class="topic-pill">Death</span><span class="topic-pill">Faith & science</span><span class="topic-pill">Religious hypocrisy</span></div></section>
          <aside class="form-card"><p class="eyebrow">PRIVATE QUESTION</p><div class="field"><label for="question-category">Subject</label><select class="input select" id="question-category"><option>God and His character</option><option>Jesus</option><option>Bible prophecy</option><option>Suffering and loss</option><option>Faith and science</option><option>Forgiveness</option><option>My next spiritual step</option><option>Something else</option></select></div><div class="field"><label for="question-text">Your question</label><textarea class="textarea" id="question-text" placeholder="Type your honest question here..."></textarea></div><button class="button button-dark button-block" id="submit-question">Ask Without Judgment</button><p style="font-size:.67rem;color:var(--muted);margin-bottom:0">This static first version saves submissions on the device. Connect the included form hook to your preferred ministry inbox or database before launch.</p></aside>
        </div>
        ${state.questions.length ? `<div class="section-head"><div><h2>My Submitted Questions</h2><p>Saved privately on this device.</p></div></div><div class="journal-list">${state.questions.map(q => `<article class="journal-entry"><small>${escapeHTML(q.category)} • ${new Date(q.createdAt).toLocaleDateString()}</small><h3>${escapeHTML(q.question)}</h3><p>Awaiting connection to your ministry response workflow.</p></article>`).join("")}</div>` : ""}
        ${liveInlineHTML()}
      </div>`;
    appMain.querySelector("#submit-question")?.addEventListener("click", () => {
      const question = document.getElementById("question-text").value.trim();
      const category = document.getElementById("question-category").value;
      if (!question) return showToast("Type your question before submitting.", "error");
      state.questions.unshift({ question, category, createdAt: new Date().toISOString() });
      saveState();
      renderQuestions();
      showToast("Your question was saved privately on this device.");
    });
  }

  function renderMore() {
    appMain.innerHTML = `
      <div class="page">
        <header class="section-head" style="align-items:center;margin-top:0"><div><p class="eyebrow">YOUR NEXT STEPS</p><h2 style="font-size:clamp(3rem,6vw,5rem)">Continue the Journey Beyond the Screen.</h2></div></header>
        <div class="more-grid">
          <article class="more-card dark"><div class="more-icon">◉</div><p class="eyebrow gold">WHATSAPP FAMILY CHAT</p><h2>Stay connected between Bible discussions.</h2><p>Ask questions, receive updates, and connect with the Try Jesus Media family.</p><a class="button button-primary" href="${CONFIG.WHATSAPP_URL}" target="_blank" rel="noopener noreferrer">Join the WhatsApp Group</a></article>
          <article class="more-card dark"><div class="more-icon">●</div><p class="eyebrow gold">LIVE THURSDAY</p><h2>A real question deserves a real conversation.</h2><p>Join the live online Bible discussion. Participate, listen quietly, or keep your camera off.</p><a class="button button-primary" data-live href="${CONFIG.LIVE_DISCUSSION_URL}" target="_blank" rel="noopener">Join Through the Welcome Page</a></article>
          <article class="more-card"><div class="more-icon">◆</div><p class="eyebrow">PROGRAMS & RESOURCES</p><h2>Knowing what is true is powerful. Living it is transformational.</h2><p>Explore additional Try Jesus Media programs and resources hosted on Fourthwall.</p><button class="button button-dark" data-fourthwall>Explore the Collection</button></article>
          <article class="more-card"><div class="more-icon">⇩</div><p class="eyebrow">INSTALL THE APP</p><h2>Take your journey with you.</h2><p>Save progress, keep private notes, and return with one tap.</p>${state.installed ? '<span class="locked-badge">APP INSTALLED</span>' : '<button class="button button-dark" data-install-app>Install the Free App</button>'}</article>
          <article class="more-card"><div class="more-icon">⚙</div><p class="eyebrow">SETTINGS</p><h2>Your journey, your pace.</h2><div class="settings-list"><div class="settings-row"><span>Completed lessons</span><strong>${completedCount()} / 7</strong></div><div class="settings-row"><span>Saved reflections</span><strong>${state.reflections.length}</strong></div><div class="settings-row"><span>Reset demonstration data</span><button id="reset-app">Reset</button></div></div></article>
        </div>
      </div>`;
    appMain.querySelector("#reset-app")?.addEventListener("click", () => {
      openModal(`<button class="modal-close" aria-label="Close">×</button><h2>Reset This App?</h2><p>This will delete progress, private journal entries, and saved questions from this browser.</p><div class="modal-actions"><button class="button button-dark" id="confirm-reset">Reset Everything</button><button class="button button-ghost" data-modal-done>Cancel</button></div>`);
      modalRoot.querySelector("#confirm-reset")?.addEventListener("click", () => {
        localStorage.removeItem(STORAGE_KEY);
        state = defaultState();
        closeModal();
        routeTo("welcome");
      });
      modalRoot.querySelector("[data-modal-done]")?.addEventListener("click", closeModal);
    });
  }

  function openDrawer() {
    sidebar.classList.add("open");
    drawerBackdrop.hidden = false;
    menuButton.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    sidebar.classList.remove("open");
    drawerBackdrop.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
  }

  menuButton.addEventListener("click", () => sidebar.classList.contains("open") ? closeDrawer() : openDrawer());
  drawerBackdrop.addEventListener("click", closeDrawer);
  document.querySelectorAll("[data-route]").forEach(el => el.addEventListener("click", event => {
    if (el.tagName === "A") event.preventDefault();
    routeTo(el.dataset.route);
  }));
  installHeaderButton.addEventListener("click", promptInstall);
  document.getElementById("profile-chip")?.addEventListener("click", () => routeTo("more"));

  window.addEventListener("hashchange", renderRoute);
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installHeaderButton.hidden = !state.onboarded || state.installed;
  });
  window.addEventListener("appinstalled", () => {
    state.installed = true;
    saveState();
    showToast("Try Jesus has been installed.");
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  if (!location.hash) history.replaceState(null, "", `#/${state.onboarded ? "home" : "welcome"}`);
  renderRoute();
})();
