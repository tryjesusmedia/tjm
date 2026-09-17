import { createClient } from "@supabase/supabase-js";
import { Autosave } from "./bd-autosave.js";
import { LESSON_QUIZZES } from "./bd-quizzes.js";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const ROOT = "/bibledecoded/",
  API = "/api/bibledecoded/",
  page = document.body.dataset.page;
let config,
  auth,
  me,
  autosave,
  scope,
  lesson,
  currentBlocks,
  player,
  videoTimer,
  lastVideoPosition = -1;
const params = new URLSearchParams(location.search);
const local = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
};
const tell = (text, error = false) => {
  const node = $("#global-message");
  if (node) {
    node.textContent = text;
    node.className = "notice" + (error ? " error" : "");
  }
};
const lessonLink = (id, view = "resume") =>
  `${ROOT}lesson/?lesson=${encodeURIComponent(id)}&view=${view}`;
const studyStores = new Map();
const fieldList = (blocks) =>
  blocks.flatMap((b) =>
    b.type === "grid"
      ? b.rows.flatMap((r) => r.cells)
      : ["field", "check"].includes(b.type)
        ? [b]
        : [],
  );
async function api(path, method = "GET", body) {
  const headers = {};
  if (auth) {
    const { data, error } = await auth.auth.getSession();
    if (error) throw error;
    if (data.session)
      headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(API + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(18000),
      keepalive: method === "PUT",
    });
  } catch {
    throw new Error(
      method === "PUT"
        ? "Not saved to your account yet. Check your connection and choose Try saving again."
        : "We could not connect. Please check your connection and try again.",
    );
  }
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Please try again.");
    Object.assign(error, data, { status: response.status });
    throw error;
  }
  return data;
}
function readingSize() {
  let n = Number(local.getItem("bd-reading-size") || 8);
  n = Number.isFinite(n) ? Math.max(0, Math.min(39, n)) : 8;
  const apply = () => {
    document.documentElement.style.fontSize = `${16 + n * 0.5}px`;
    try {
      local.setItem("bd-reading-size", String(n));
    } catch {}
    $("#smaller").disabled = n === 0;
    $("#larger").disabled = n === 39;
  };
  $("#smaller").onclick = () => {
    n = Math.max(0, n - 1);
    apply();
  };
  $("#larger").onclick = () => {
    n = Math.min(39, n + 1);
    apply();
  };
  apply();
}
function storeCarousel() {
  const track = $("#store-track");
  if (!track) return;
  const previous = $("#store-previous"),
    next = $("#store-next");
  previous.hidden = false;
  next.hidden = false;
  const update = () => {
    previous.disabled = track.scrollLeft <= 6;
    next.disabled =
      track.scrollLeft + track.clientWidth >= track.scrollWidth - 6;
  };
  const move = (direction) =>
    track.scrollBy({
      left:
        direction *
        (track.querySelector(".store-card").getBoundingClientRect().width + 22),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  previous.onclick = () => move(-1);
  next.onclick = () => move(1);
  track.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}
function albumLink() {
  return '<a class="button secondary" href="https://youtube.com/playlist?list=PLDFkxHcqdU19H9hrOex5RSLvlXU9ycyJu&si=nrlaPqe4YZsawYAc" target="_blank" rel="noopener">Open YouTube playlist ↗</a>';
}
function authForm(message = "") {
  $("#app").innerHTML =
    `<div class="auth-card"><p class="eyebrow">YOUR PERSONAL STUDY SPACE</p><h1>Welcome to<br>Bible Decoded.</h1><p class="muted">Sign in to open your lessons and saved studies.</p>${message ? `<p class="notice">${esc(message)}</p>` : ""}<button id="google-signin" class="button secondary wide"><span class="google-mark" aria-hidden="true">G</span> Continue with Google</button><div class="divider">or use your email</div><form id="email-signin"><label for="signin-email">Email address</label><input id="signin-email" class="study-title" type="email" autocomplete="email" required placeholder="you@example.com"><button class="button wide" type="submit">Continue with Email</button></form><p class="small muted">We’ll email you a sign-in link. No password to remember.</p><p class="small">Use the email address you used at checkout. <a href="${ROOT}">View the program</a></p><div id="auth-message" class="notice" role="status"></div></div>`;
  $("#google-signin").onclick = async () => {
    const b = $("#google-signin");
    b.disabled = true;
    try {
      const { error } = await auth.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + ROOT + "welcome/" },
      });
      if (error) throw error;
    } catch (e) {
      $("#auth-message").textContent =
        "Google sign-in could not start. Please try again or continue with email.";
      b.disabled = false;
    }
  };
  $("#email-signin").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    $("#auth-message").textContent = "Sending your sign-in link…";
    try {
      const { error } = await auth.auth.signInWithOtp({
        email: $("#signin-email").value.trim(),
        options: { emailRedirectTo: location.origin + ROOT + "welcome/" },
      });
      if (error) throw error;
      $("#auth-message").textContent =
        "Check your email for a sign-in link. If it is not there yet, look in your spam folder. You can request another link in one minute.";
      setTimeout(() => (button.disabled = false), 60000);
    } catch (e) {
      $("#auth-message").textContent =
        "We could not send the sign-in email. Please try again shortly, use Google, or contact info@tryjesusmedia.com for help.";
      button.disabled = false;
    }
  };
}
function memberHeader() {
  const a = $("#account-link");
  a.textContent = "My dashboard";
  a.href = ROOT + "dashboard/";
}
function coachingInvite() {
  return `<section class="coaching-invite no-print" aria-labelledby="coaching-title"><img class="coaching-photo" src="/assets/pastor-kal-coaching.jpg" alt="Pastor Kal" width="900" height="900" loading="lazy"><div class="coaching-copy"><p class="eyebrow">YOUR NEXT STEP · FREE PERSONAL COACHING</p><h2 id="coaching-title">Let’s open the Bible together.</h2><p>Bring the passage that puzzles you—and the questions you have always wanted to ask.</p><p><strong>Book a free Bible discussion coaching call with the real, human Pastor Kal. Not AI.</strong></p><p>We’ll look at your questions together, explore connections you may have missed, and help you approach Scripture with fresh clarity and confidence.</p><div class="coaching-action"><a class="button gold" href="https://calendly.com/kalroller/kal" target="_blank" rel="noopener">Choose my time with Pastor Kal →</a></div><p class="small coaching-note">Bring your Bible. Bring your questions. Choose a time that works for you.</p></div></section>`;
}
function wireSignout() {
  const buttons = document.querySelectorAll("#signout,[data-signout]");
  if (buttons.length && $("#footer-account"))
    $("#footer-account").hidden = false;
  buttons.forEach(
    (button) =>
      (button.onclick = async () => {
        const stores = [...studyStores.values(), ...(autosave ? [autosave] : [])];
        if ((await Promise.all(stores.map((store) => store.flush()))).includes(false)) {
          tell(
            "Some answers have not saved yet. Try saving again or print your answers before signing out.",
            true,
          );
          return;
        }
        buttons.forEach((item) => (item.disabled = true));
        try {
          await auth.auth.signOut();
          location.assign(ROOT + "welcome/");
        } catch {
          buttons.forEach((item) => (item.disabled = false));
          tell(
            "We could not sign you out. Please check your connection and try again.",
            true,
          );
        }
      }),
  );
}
function noAccess() {
  $("#app").innerHTML =
    `<section class="page-top narrow"><p class="eyebrow">SIGNED IN</p><h1>Your Bible Decoded account.</h1><div class="account-row"><p>You’re signed in as <strong>${esc(me.user.email)}</strong>.</p><button class="account-signout" type="button" data-signout>Sign out and use a different account</button></div><div class="notice">You don’t currently have access to Bible Decoded. If you already purchased, check that you’re using the same email address you used at checkout.</div><div class="actions"><a class="button" href="https://buy.stripe.com/dRm28sacw6ufdSKfHu57W0b">Get Bible Decoded — <span class="purchase-prices"><s>$97</s> $37</span></a><a class="button secondary" href="${ROOT}">View the Bible Decoded program</a><button id="check-access" class="button secondary">Check my access again</button></div><p class="offer-note">Discounted for the next 100 customers only!</p></section>`;
  $("#check-access").onclick = () => location.reload();
  wireSignout();
}
function dashboard() {
  const done = me.progress.filter(
    (p) =>
      p.completed &&
      config.lessons.some((l) => l.id === p.lesson_id && !l.bonus),
  ).length;
  const recent = [...me.progress]
    .filter((p) => !p.completed)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const next =
    config.lessons.find((l) => l.id === recent?.lesson_id) ||
    config.lessons.find(
      (l) =>
        !l.bonus && !me.progress.find((p) => p.lesson_id === l.id)?.completed,
    ) ||
    config.lessons[0];
  const name = me.user.name.split(" ")[0];
  const card = (l) => {
    const progress = me.progress.find((p) => p.lesson_id === l.id);
    const quizScore = Number.isInteger(progress?.quiz_score) ? progress.quiz_score : 0;
    return `<article class="card lesson-card ${progress?.completed ? "completed" : ""}"><div class="card-status"><div class="number">${l.bonus ? "Bonus" : `0${l.number}`}</div><div class="card-status-text"><span class="lesson-status">${progress?.completed ? "✓ Completed" : progress ? "In progress" : "Ready when you are"}</span><span class="dashboard-quiz-score" aria-label="Quiz score ${quizScore} percent">Quiz: ${quizScore}%</span></div></div><h3>${esc(l.title)}</h3><p>${esc(l.description)}</p><div class="actions">${l.bonus ? "" : `<a class="button secondary" href="${lessonLink(l.id, "video")}">Watch Video</a>`}<a class="button secondary" href="${lessonLink(l.id, "workbook")}">Open Workbook</a><button class="button secondary" data-printable="${l.id}">Printable guide (PDF)</button>${progress ? `<a href="${lessonLink(l.id)}" class="small">Continue Where I Left Off →</a>` : ""}</div></article>`;
  };
  $("#app").innerHTML =
    `<section class="page-top"><p class="eyebrow">BIBLE DECODED · YOUR DASHBOARD</p><h1>Welcome back${name ? ", " + esc(name) : ""}.</h1><p class="muted">A little time in the Word can become a lasting part of your day.</p></section><section class="progress-panel"><div><h2>Your progress</h2><p>${done} of 6 lessons completed</p><progress max="6" value="${done}" aria-label="${done} of 6 lessons completed"></progress></div><a class="button gold" href="${done === 6 ? ROOT + "complete/" : lessonLink(next.id)}">${done === 6 ? "Celebrate your progress" : "Continue learning →"}</a></section><div class="actions no-print">${albumLink()}</div><h2 class="section-label">Your lessons</h2><p class="small muted">Follow the lessons in order, or revisit a method whenever you need it.</p><div class="cards">${config.lessons
      .filter((l) => !l.bonus)
      .map(card)
      .join(
        "",
      )}</div><div class="bonus card">${card(config.lessons.at(-1))}</div><section class="section"><p class="eyebrow">KEEP EXPLORING SCRIPTURE</p><h2>Bible Decoded Study Lab</h2>${me.labUnlocked ? `<p>Congratulations on completing Bible Decoded! You now have tools to explore Scripture with confidence.</p><p>Visit your Study Lab to create your own Bible studies and put what you’ve learned into practice.</p><a class="button" href="${ROOT}complete/#study-lab">Visit Study Lab</a>` : `<p>Complete the six main lessons to unlock your personal Study Lab. You’ll be able to name, save, and return to as many studies as you like.</p><p class="notice">${6 - done} lesson${6 - done === 1 ? "" : "s"} to go. The bonus is yours to explore at any time.</p><p class="small muted">Any Bible studies and notes you’ve already saved will be here when all six lessons are marked complete again.</p>`}</section>${coachingInvite()}<div class="actions dashboard-program-link no-print"><a class="button secondary" href="${ROOT}">View the Bible Decoded program</a></div>`;
  wireSignout();
  document.querySelectorAll("[data-printable]").forEach(
    (button) =>
      (button.onclick = () => {
        void printDownload(button.dataset.printable, button);
      }),
  );
}
function studyList() {
  return me.studies.length
    ? `<div class="study-list">${me.studies.map(studyPanel).join("")}</div>`
    : '<p class="muted">Your saved studies will appear here. Start with a passage you’d like to understand more deeply.</p>';
}
function fieldHTML(field) {
  if (field.type === "check")
    return `<label class="check" for="${field.id}"><input id="${field.id}" type="checkbox" data-field="${field.id}"><span>${esc(field.text)}</span></label><div data-conflict="${field.id}"></div>`;
  return `<div class="field ${field.short ? "short" : ""}"><label for="${field.id}">${esc(field.text)}</label><textarea id="${field.id}" data-field="${field.id}" maxlength="12000" rows="${field.short ? 2 : 4}" placeholder="Write your answer here…"></textarea><div class="print-answer" data-print="${field.id}"></div><div data-conflict="${field.id}"></div></div>`;
}
function blockHTML(b) {
  if (["field", "check"].includes(b.type)) return fieldHTML(b);
  if (b.type === "callout")
    return `<aside class="callout"><strong>${esc(b.text)}</strong><p>${esc(b.body)}</p></aside>`;
  if (b.type === "grid")
    return `<div class="exercise-grid">${b.rows.map((row) => `<div class="exercise-row"><h3>${esc(row.label)}</h3>${row.cells.map((c, i) => fieldHTML({ ...c, text: b.columns[i + 1] })).join("")}</div>`).join("")}</div>`;
  return `<p>${esc(b.text)}</p>`;
}
function renderWorkbook(blocks) {
  const groups = [{ title: "Before you begin", blocks: [] }];
  for (const b of blocks) {
    if (b.type === "heading") groups.push({ title: b.text, blocks: [] });
    else groups.at(-1).blocks.push(b);
  }
  const nonempty = groups.filter((g) => g.blocks.length);
  return `<div class="workbook-layout"><div class="workbook">${nonempty.map((g, i) => `<details class="workbook-subsection" id="section-${i}"><summary><span class="subsection-number">${String(i + 1).padStart(2, "0")}</span><span>${esc(g.title)}</span><span class="subsection-toggle" aria-hidden="true">+</span></summary><section class="workbook-section">${g.blocks.map(blockHTML).join("")}</section></details>`).join("")}</div></div>`;
}
function wireWorkbookSubsections(root = document) {
  root.querySelectorAll(".workbook-subsection").forEach((panel) => {
    const toggle = panel.querySelector(".subsection-toggle");
    panel.addEventListener("toggle", () => {
      toggle.textContent = panel.open ? "−" : "+";
    });
  });
}
function lessonQuizHTML(items, savedScore) {
  const hasScore = Number.isInteger(savedScore);
  return `<details class="lesson-quiz no-print"><summary><span><span class="eyebrow">LESSON REVIEW</span>Take the 10-question quiz</span><span class="quiz-toggle" aria-hidden="true">+</span></summary><div class="quiz-top"><div><span class="quiz-score-label">Last score</span><strong id="quiz-score">${hasScore ? savedScore : 0}%</strong></div><button id="retake-quiz" class="button quiz-retake" type="button" ${hasScore ? "" : "hidden"}>Retake quiz</button></div><form id="lesson-quiz-form" class="lesson-quiz-body">${items.map((item, questionIndex) => `<fieldset data-quiz-question="${questionIndex}"><legend>${questionIndex + 1}. ${esc(item.question)}</legend>${item.choices.map((choice, choiceIndex) => `<label data-choice="${choiceIndex}"><input type="radio" name="quiz-${questionIndex}" value="${choiceIndex}"><span class="choice-copy">${esc(choice)}<small class="choice-feedback" hidden></small></span></label>`).join("")}</fieldset>`).join("")}<button class="button quiz-submit" type="submit">Submit quiz</button><div id="quiz-result" class="quiz-result" role="status" aria-live="polite"></div></form></details>`;
}
function wireLessonQuiz(items) {
  const quiz = $(".lesson-quiz");
  if (!quiz) return;
  const toggle = quiz.querySelector(".quiz-toggle");
  quiz.addEventListener("toggle", () => {
    toggle.textContent = quiz.open ? "−" : "+";
  });
  const form = $("#lesson-quiz-form");
  const resetAnswers = () => {
    form.reset();
    form.querySelectorAll("fieldset").forEach((fieldset) => fieldset.classList.remove("quiz-correct", "quiz-incorrect"));
    form.querySelectorAll("[data-choice]").forEach((label) => label.classList.remove("selected-correct", "selected-incorrect", "correct-choice"));
    form.querySelectorAll(".choice-feedback").forEach((feedback) => { feedback.hidden = true; feedback.textContent = ""; });
    const result = $("#quiz-result");
    result.textContent = "";
    result.className = "quiz-result";
    quiz.open = true;
    form.querySelector("input")?.focus();
  };
  $("#retake-quiz").addEventListener("click", resetAnswers);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selections = items.map((_, index) => form.elements[`quiz-${index}`].value);
    let correct = 0;
    let unanswered = 0;
    items.forEach((item, index) => {
      const selected = selections[index];
      if (selected === "") unanswered += 1;
      else if (Number(selected) === item.answer) correct += 1;
    });
    const result = $("#quiz-result");
    if (unanswered) {
      result.textContent = `Please answer all 10 questions. You have ${unanswered} left.`;
      result.className = "quiz-result notice";
      return;
    }
    const submit = form.querySelector(".quiz-submit");
    submit.disabled = true;
    $("#retake-quiz").disabled = true;
    form.querySelectorAll("input").forEach((input) => { input.disabled = true; });
    const score = correct * 10;
    try {
      await api(`progress/${scope}`, "PUT", { quizScore: score });
    } catch (error) {
      result.textContent = `${error.message} Your quiz score has not saved yet.`;
      result.className = "quiz-result notice error";
      submit.disabled = false;
      $("#retake-quiz").disabled = false;
      form.querySelectorAll("input").forEach((input) => { input.disabled = false; });
      return;
    }
    form.querySelectorAll("[data-choice]").forEach((label) => label.classList.remove("selected-correct", "selected-incorrect", "correct-choice"));
    form.querySelectorAll(".choice-feedback").forEach((feedback) => { feedback.hidden = true; feedback.textContent = ""; });
    items.forEach((item, index) => {
      const fieldset = form.querySelector(`[data-quiz-question="${index}"]`);
      const selected = Number(selections[index]);
      fieldset.classList.toggle("quiz-correct", selected === item.answer);
      fieldset.classList.toggle("quiz-incorrect", selected !== item.answer);
      const selectedLabel = fieldset.querySelector(`[data-choice="${selected}"]`);
      const correctLabel = fieldset.querySelector(`[data-choice="${item.answer}"]`);
      correctLabel.classList.add("correct-choice");
      selectedLabel.classList.add(selected === item.answer ? "selected-correct" : "selected-incorrect");
      const selectedFeedback = selectedLabel.querySelector(".choice-feedback");
      selectedFeedback.hidden = false;
      selectedFeedback.textContent = selected === item.answer ? "✓ Correct!" : "Incorrect";
      if (selected !== item.answer) {
        const correctFeedback = correctLabel.querySelector(".choice-feedback");
        correctFeedback.hidden = false;
        correctFeedback.textContent = "✓ Correct answer";
      }
    });
    $("#quiz-score").textContent = `${score}%`;
    $("#retake-quiz").hidden = false;
    result.textContent = correct >= 8
      ? `${correct} out of 10 correct. Excellent work—you understand this lesson well!`
      : `${correct} out of 10 correct. Review the highlighted answers above, then select Retake quiz to try again.`;
    result.className = `quiz-result notice ${correct >= 8 ? "quiz-passed" : ""}`;
    submit.disabled = false;
    $("#retake-quiz").disabled = false;
    form.querySelectorAll("input").forEach((input) => { input.disabled = false; });
  });
}
function showSaveState(store, root = document) {
  const status = root.querySelector("[data-save-status], #save-status");
  if (!status) return;
  const dirty = store.pending.size > 0;
  status.className = "save-status" + (dirty ? " unsaved" : "");
  status.replaceChildren();
  const text = document.createElement("span");
  text.textContent = store.conflicts.size
    ? "An answer needs your attention below."
    : store.error ||
      (dirty ? "Saving your answers…" : "Your answers are saved ✓");
  status.append(text);
  if (dirty && !store.running) {
    const retry = document.createElement("button");
    retry.textContent = "Try saving again";
    retry.onclick = () => {
      void store.flush();
    };
    status.append(retry);
  }
}
function showConflict(id, current, root = document, store = autosave) {
  const box = root.querySelector(`[data-conflict="${id}"]`);
  box.className = "conflict";
  box.innerHTML = `<strong>This answer changed on another device.</strong><p class="small">The account’s saved answer:</p><pre>${esc(typeof current.value === "boolean" ? (current.value ? "Checked" : "Not checked") : current.value)}</pre><div class="actions"><button class="button secondary" data-choice="cloud">Use saved answer</button><button class="button" data-choice="mine">Keep my answer here</button></div>`;
  box.querySelectorAll("button").forEach(
    (button) =>
      (button.onclick = () => {
        const mine = button.dataset.choice === "mine";
        store.resolve(id, mine);
        const input = root.querySelector(`[data-field="${id}"]`);
        if (!mine) {
          if (input.type === "checkbox") input.checked = !!current.value;
          else input.value = current.value;
        }
        box.className = "";
        box.replaceChildren();
      }),
  );
}
function connectWorkbook(data, root = document, workbookScope = scope, blocks = currentBlocks) {
  wireWorkbookSubsections(root);
  const store = new Autosave({
    rows: data.answers,
    storage: local,
    key: `bd-draft:${me.user.id}:${workbookScope}`,
    save: (fieldId, value, revision) =>
      api(`answer/${workbookScope}`, "PUT", { fieldId, value, revision }),
    onState: (state) => showSaveState(state, root),
    onConflict: (id, current) => showConflict(id, current, root, store),
  });
  if (root === document) autosave = store;
  else studyStores.set(workbookScope, store);
  for (const field of fieldList(blocks)) {
    const input = root.querySelector(`[data-field="${field.id}"]`);
    const value = store.get(field.id, field.type === "check" ? false : "");
    if (field.type === "check") input.checked = !!value;
    else input.value = value;
    input.addEventListener("input", () =>
      store.change(
        field.id,
        field.type === "check" ? input.checked : input.value,
      ),
    );
    input.addEventListener("blur", () => {
      void store.flush();
      if (lesson)
        void api(`progress/${workbookScope}`, "PUT", { lastField: field.id }).catch(
          () => {},
        );
    });
  }
  showSaveState(store, root);
  if (store.pending.size) void store.flush();
  root.querySelector("[data-save-now], #save-now").onclick = () => {
    void store.flush();
  };
  root.querySelector("[data-print-answers], #print-answers").onclick = () => {
    root
      .querySelectorAll("[data-print]")
      .forEach(
        (p) => (p.textContent = root.querySelector(`[data-field="${p.dataset.print}"]`).value),
      );
    const panels = root === document ? [] : [...root.querySelectorAll(".workbook-subsection")];
    const states = panels.map((panel) => panel.open);
    panels.forEach((panel) => { panel.open = true; });
    const studyPanel = root === document ? null : root.closest(".saved-study");
    studyPanel?.classList.add("printing-study");
    if (page === "complete") document.body.classList.add("study-only");
    try {
      window.print();
    } finally {
      document.body.classList.remove("study-only");
      studyPanel?.classList.remove("printing-study");
      panels.forEach((panel, index) => { panel.open = states[index]; });
    }
  };
  window.addEventListener("online", () => {
    void store.flush();
  });
  window.addEventListener("beforeunload", (event) => {
    if (store.pending.size) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      void store.flush();
      void saveVideoPosition();
    }
  });
  wireSignout();
}
async function printDownload(id = scope, button = $("#download-workbook")) {
  button.disabled = true;
  try {
    const { data } = await auth.auth.getSession();
    const response = await fetch(API + `printable/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        "The printable workbook could not be downloaded. Please try again.",
      );
    const blob = await response.blob(),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `Bible-Decoded-${id}-Workbook.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    tell(e.message, true);
  } finally {
    button.disabled = false;
  }
}
async function loadLesson() {
  scope = params.get("lesson") || config.lessons[0].id;
  const data = await api("lesson/" + encodeURIComponent(scope));
  lesson = data.lesson;
  currentBlocks = lesson.blocks;
  const progress = me.progress.find((p) => p.lesson_id === scope);
  const next = config.lessons.find((l) => l.number === lesson.number + 1);
  document.title = `${lesson.title} | Bible Decoded`;
  $("#app").innerHTML =
    `<section class="page-top lesson-heading"><p class="breadcrumb"><a href="${ROOT}dashboard/">Bible Decoded</a> / ${lesson.bonus ? "Bonus" : `Lesson ${lesson.number}`}</p><p class="eyebrow">${lesson.bonus ? "YOUR BONUS METHOD" : `LESSON ${lesson.number} OF 6`}</p><h1>${esc(lesson.title)}</h1><p class="muted">${esc(lesson.description)}</p></section><div class="video" id="video"><div class="video-unavailable"><strong>${data.video ? "Loading your video…" : "Your lesson video is being prepared."}</strong><p>${data.video ? "" : "You can work through the exercises below while the video is being connected."}</p></div></div><p class="small no-print">Watch at your own pace. Complete the exercise below before continuing.</p><div class="actions no-print">${albumLink()}</div><details class="lesson-workbook" id="workbook"><summary><span><span class="eyebrow">INTERACTIVE WORKSHEET</span>Your ${lesson.bonus ? "bonus " : ""}workbook</span><span class="workbook-toggle" aria-hidden="true">+</span></summary><div class="lesson-workbook-body"><div class="workbook-head"><h2>Your interactive workbook</h2><div id="save-status" class="save-status" role="status" aria-live="polite"></div></div><div class="actions no-print"><button id="save-now" class="button secondary">Save now</button><button id="download-workbook" class="button secondary">Printable guide (PDF)</button><button id="print-answers" class="button secondary">Print my answers</button></div><p class="small muted no-print">Prefer pen and paper? Download the printable guide above, open the PDF, and choose Print. You can also type below; your answers save automatically.</p>${renderWorkbook(currentBlocks)}<div class="workbook-end"><h2>${progress?.completed ? "View next lesson" : "Put what you learned into practice."}</h2><div class="actions"><button id="finish-lesson" class="button">Save & Continue →</button><label class="check"><input id="completed" type="checkbox" ${progress?.completed ? "checked" : ""}> Lesson completed</label></div></div></div></details><div class="help-bar"><div><strong>Bible-study tools</strong><div class="tools"><a href="https://www.biblegateway.com/" target="_blank" rel="noopener">Read Scripture ↗</a><a href="https://www.blueletterbible.org/" target="_blank" rel="noopener">Concordance & lexicon ↗</a></div></div></div>${lesson.number === 1 || lesson.number === 6 || lesson.bonus ? coachingInvite() : ""}`;
  if (lesson.bonus) {
    const video = $("#video");
    video.classList.add("bonus-thumbnail");
    video.innerHTML =
      '<img src="/assets/bible-decoded.jpg" alt="Bible Decoded" width="720" height="960">';
  }
  const workbookPanel = $("#workbook");
  const workbookEnd = workbookPanel.querySelector(".workbook-end");
  workbookPanel.after(workbookEnd);
  const quizItems = LESSON_QUIZZES[lesson.id];
  if (quizItems) {
    const savedQuizScore = Number.isInteger(progress?.quiz_score) ? progress.quiz_score : null;
    workbookPanel.insertAdjacentHTML("afterend", lessonQuizHTML(quizItems, savedQuizScore));
    wireLessonQuiz(quizItems);
  }
  const previous = config.lessons.find((item) => item.number === lesson.number - 1);
  $(".lesson-heading").insertAdjacentHTML("beforeend",
    `<nav class="lesson-navigation no-print" aria-label="Lesson navigation">${previous ? `<a data-lesson-navigation href="${lessonLink(previous.id)}">← Previous lesson</a>` : ""}<a data-lesson-navigation href="${ROOT}dashboard/">All lessons</a>${next ? `<a data-lesson-navigation href="${lessonLink(next.id)}">Next lesson →</a>` : ""}</nav>`);
  workbookEnd.querySelector("h2").insertAdjacentHTML("afterend",
    `<p class="next-lesson-note">${lesson.number === 6 ? "Next: Celebrate your course completion" : next ? `Next: ${esc(next.title)}` : "Next: Your dashboard"}</p>`);
  document.querySelectorAll(".lesson-workbook, .lesson-quiz, .workbook-subsection").forEach((panel) => {
    const summary = panel.querySelector(":scope > summary");
    const hint = document.createElement("span");
    hint.className = "panel-hint";
    hint.textContent = "Tap to open";
    const title = summary.querySelector(":scope > span:not(.subsection-number)");
    title.append(hint);
    panel.addEventListener("toggle", () => { hint.textContent = panel.open ? "Tap to close" : "Tap to open"; });
  });
  connectWorkbook(data);
  document.querySelectorAll("[data-lesson-navigation]").forEach((link) => {
    link.addEventListener("click", async (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (!(await autosave.flush())) {
        tell("Your answers are not saved yet. Please check your connection and try again.", true);
        return;
      }
      await saveVideoPosition();
      location.assign(link.href);
    });
  });
  $("#download-workbook").onclick = () => {
    void printDownload();
  };
  workbookPanel.addEventListener(
    "toggle",
    () =>
      (workbookPanel.querySelector(".workbook-toggle").textContent =
        workbookPanel.open ? "−" : "+"),
  );
  $("#completed").onchange = async (event) => {
    const input = event.target;
    input.disabled = true;
    try {
      if (!(await autosave.flush()))
        throw new Error(
          "Please save the remaining answers before changing completion.",
        );
      await api(`progress/${scope}`, "PUT", { completed: input.checked });
      notifyProgressChanged();
      $(".workbook-end h2").textContent = input.checked
        ? "View next lesson"
        : "Put what you learned into practice.";
      tell(
        input.checked ? "Lesson completed ✓" : "Lesson marked as in progress.",
      );
    } catch (e) {
      input.checked = !input.checked;
      tell(e.message, true);
    } finally {
      input.disabled = false;
    }
  };
  $("#finish-lesson").onclick = async () => {
    const b = $("#finish-lesson");
    b.disabled = true;
    try {
      if (!(await autosave.flush()))
        throw new Error(
          "Please resolve any unsaved answers before continuing.",
        );
      await api(`progress/${scope}`, "PUT", { completed: $("#completed").checked });
      notifyProgressChanged();
      await saveVideoPosition();
      location.assign(
        lesson.number === 6
          ? ROOT + "complete/"
          : next
            ? lessonLink(next.id, "video")
            : ROOT + "dashboard/",
      );
    } catch (e) {
      tell(e.message, true);
      b.disabled = false;
    }
  };
  if (data.video) await mountVideo(data.video, progress?.seconds || 0);
  if (params.get("view") === "workbook") $("#workbook").scrollIntoView();
  else if (params.get("view") !== "video" && progress?.last_field)
    document
      .getElementById(progress.last_field)
      ?.scrollIntoView({ block: "center" });
}
async function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "The video player could not load. Please check your connection.",
          ),
        ),
      12000,
    );
    s.src = url;
    s.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(
        new Error(
          "The video player could not load. Please check your connection.",
        ),
      );
    };
    document.head.append(s);
  });
}
async function mountVideo(video, seconds) {
  try {
    if (video.provider === "youtube") {
      await new Promise((resolve, reject) => {
        if (window.YT?.Player) return resolve();
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                "The video player could not load. Please check your connection.",
              ),
            ),
          15000,
        );
        window.onYouTubeIframeAPIReady = () => {
          clearTimeout(timer);
          resolve();
        };
        loadScript("https://www.youtube.com/iframe_api").catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
      });
      $("#video").innerHTML = '<div id="video-player"></div>';
      player = new window.YT.Player("video-player", {
        host: "https://www.youtube-nocookie.com",
        videoId: video.id,
        playerVars: {
          start: Math.floor(seconds),
          rel: 0,
          origin: location.origin,
        },
        events: {
          onReady: (event) =>
            (event.target.getIframe().title = lesson.title + " lesson video"),
          onStateChange: () => {
            void saveVideoPosition();
          },
          onError: () =>
            tell(
              "This video could not be played. Please contact us if it remains unavailable.",
              true,
            ),
        },
      });
    } else {
      const iframe = document.createElement("iframe");
      iframe.src = video.url + `?startTime=${Math.floor(seconds)}s`;
      iframe.title = `${lesson.title} lesson video`;
      iframe.allow =
        "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;";
      iframe.allowFullscreen = true;
      $("#video").replaceChildren(iframe);
      await loadScript(
        "https://embed.cloudflarestream.com/embed/sdk.latest.js",
      );
      player = window.Stream(iframe);
      player.addEventListener("pause", () => {
        void saveVideoPosition();
      });
    }
    videoTimer = setInterval(() => {
      void saveVideoPosition();
    }, 15000);
  } catch (e) {
    tell(e.message, true);
  }
}
async function saveVideoPosition() {
  if (!player || !lesson) return;
  const seconds = Number(
    player.getCurrentTime ? player.getCurrentTime() : player.currentTime,
  );
  if (
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    Math.abs(seconds - lastVideoPosition) < 2
  )
    return;
  try {
    await api(`progress/${scope}`, "PUT", { seconds });
    lastVideoPosition = seconds;
  } catch {
    tell(
      "Your video position could not save. Your workbook’s save status is shown below.",
      true,
    );
  }
}
function studyPanel(study) {
  return `<details class="saved-study" data-study-id="${esc(study.id)}"><summary><span>${esc(study.title)}<small>Updated ${esc(new Date(study.updated_at).toLocaleDateString())}</small></span><span class="study-toggle" aria-hidden="true">+</span></summary><div class="study-editor"></div></details>`;
}
async function openStudyPanel(panel) {
  if (panel.dataset.loaded || panel.dataset.loading) return;
  panel.dataset.loading = "true";
  const editor = panel.querySelector(".study-editor");
  editor.innerHTML = '<p role="status">Opening your study…</p>';
  try {
    const id = panel.dataset.studyId;
    const data = await api("study/" + encodeURIComponent(id));
    editor.innerHTML = `<p class="muted">Use the methods that help you explore this passage. Your work will be here when you return.</p><div class="workbook-head"><h3>Your study workspace</h3><div data-save-status class="save-status" role="status" aria-live="polite"></div></div><div class="actions study-actions no-print"><button data-save-now class="button">Save my study</button><button data-print-answers class="button secondary">Print my study</button></div>${renderWorkbook(data.study.blocks)}`;
    // Keep labels unique while preserving the account's original answer identifiers.
    editor.querySelectorAll("[id]").forEach((node) => { node.id = `study-${id}-${node.id}`; });
    editor.querySelectorAll("[for]").forEach((node) => { node.htmlFor = `study-${id}-${node.htmlFor}`; });
    connectWorkbook(data, editor, id, data.study.blocks);
    panel.dataset.loaded = "true";
  } catch (error) {
    editor.replaceChildren();
    const message = document.createElement("p");
    message.className = "notice error";
    message.textContent = error.message;
    const retry = document.createElement("button");
    retry.className = "button secondary";
    retry.textContent = "Try opening again";
    retry.onclick = () => { void openStudyPanel(panel); };
    editor.append(message, retry);
  } finally {
    delete panel.dataset.loading;
  }
}
function wireStudyPanel(panel) {
  panel.addEventListener("toggle", () => {
    panel.querySelector(".study-toggle").textContent = panel.open ? "−" : "+";
    if (panel.open) void openStudyPanel(panel);
  });
}
async function studyLab() {
  const container = $("#study-lab-content");
  if (!me.labUnlocked || !container) return;
  container.innerHTML = `<p>Choose a passage and give your study a name. A blank workspace will bring all your methods together.</p><form class="study-form" id="new-study"><div><label for="study-name">Study name</label><input class="study-title" id="study-name" maxlength="120" required placeholder="For example: Genesis 22 — Abraham & Isaac"></div><button class="button">Start my study →</button></form><h3 class="section-label">My Bible Studies</h3><div id="saved-studies">${studyList()}</div>`;
  container.querySelectorAll(".saved-study").forEach(wireStudyPanel);
  let newStudyId = crypto.randomUUID();
  $("#new-study").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      const title = $("#study-name").value;
      const study = await api("studies", "POST", { id: newStudyId, title });
      let list = container.querySelector(".study-list");
      if (!list) {
        $("#saved-studies").innerHTML = '<div class="study-list"></div>';
        list = container.querySelector(".study-list");
      }
      list.insertAdjacentHTML("beforeend", studyPanel({id: study.id, title, updated_at: Date.now()}));
      const panel = list.lastElementChild;
      wireStudyPanel(panel);
      panel.open = true;
      await openStudyPanel(panel);
      $("#study-name").value = "";
      newStudyId = crypto.randomUUID();
    } catch (error) {
      tell(error.message, true);
    } finally {
      button.disabled = false;
    }
  };
  // Previously bookmarked study URLs still open their matching window.
  const requested = params.get("study");
  if (requested) {
    const panel = [...container.querySelectorAll(".saved-study")].find((item) => item.dataset.studyId === requested);
    if (panel) {
      panel.open = true;
      await openStudyPanel(panel);
    }
  }
}
function wireCertificateName() {
  const input = $("#certificate-display-name");
  const name = $("#certificate-name");
  const status = $("#certificate-name-status");
  const key = `bd-certificate-name:${me.user.id}`;
  try {
    const saved = local.getItem(key);
    if (saved && saved.trim()) name.textContent = input.value = saved.slice(0, 80);
  } catch {}
  $("#certificate-name-form").onsubmit = (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      status.textContent = "Please enter the name you would like on your certificate.";
      return;
    }
    name.textContent = value;
    try {
      local.setItem(key, value);
      status.textContent = "Certificate name updated.";
    } catch {
      status.textContent = "Certificate name updated for this visit.";
    }
  };
}
function bonusCompleted(member) {
  return Boolean(member.progress?.find((p) => p.lesson_id === "word-search")?.completed);
}
async function completion() {
  if (!me.labUnlocked) {
    location.replace(ROOT + "dashboard/");
    return;
  }
  $("#app").innerHTML =
    `<section class="page-top narrow"><p class="eyebrow">SIX LESSONS. A NEW BEGINNING.</p><h1>You completed<br>Bible Decoded.</h1><p>You’ve practiced the methods. Now make them part of your own time in Scripture.</p><div class="actions"><a class="button" href="#study-lab">Open my Study Lab →</a><a class="button secondary" href="${lessonLink("word-search", "workbook")}">Explore the bonus lesson</a></div></section><section class="certificate" id="certificate" aria-label="Bible Decoded Certificate of Completion"><span class="certificate-corner corner-tl" aria-hidden="true"></span><span class="certificate-corner corner-tr" aria-hidden="true"></span><span class="certificate-corner corner-bl" aria-hidden="true"></span><span class="certificate-corner corner-br" aria-hidden="true"></span><div class="certificate-content"><div class="certificate-bonus" ${bonusCompleted(me) ? "" : "hidden"}><span aria-hidden="true">❧</span><p>Bonus lesson completed</p><span aria-hidden="true">❧</span></div><img class="certificate-faith-seal" src="/assets/bible-decoded-completion-seal.svg" width="140" height="140" alt="Gold seal with an open Bible and laurel branches: Bible Decoded — Course Completed"><img class="certificate-logo" src="/assets/logo.png" width="88" height="88" alt="Try Jesus Media"><p class="certificate-brand">TRY JESUS MEDIA</p><div class="certificate-flourish" aria-hidden="true">◆</div><h2 class="certificate-title">Certificate <em>of Completion</em></h2><p class="certificate-presented">PRESENTED WITH JOY TO</p><p class="person" id="certificate-name">${esc(me.user.name || me.user.email)}</p><p class="certificate-recognition">In recognition of completing the six guided lessons of</p><h3 class="certificate-course">Bible Decoded</h3><p class="certificate-dedication">A foundation for understanding Scripture,<br>sharing its truth, and pointing others to Jesus.</p><div class="certificate-footer"><div class="certificate-motto"><p>Keep discovering.<br>Keep growing.</p><span>TRYJESUSMEDIA.COM</span></div><div class="certificate-host"><img class="certificate-signature" src="/assets/pastor-kal-signature-transparent.svg" alt="Pastor Kal Roller’s signature" width="180" height="64"><p>Pastor Kal Roller</p><span>COURSE PRESENTER</span></div></div><p class="certificate-methods">Foundations · Look for Christ · Pattern Recognition<br>The Questioning Method · Exegesis · Bible Memorization</p></div></section><details class="certificate-name-editor no-print"><summary>Change certificate name</summary><form id="certificate-name-form"><label for="certificate-display-name">Name to show on your certificate</label><div class="actions"><input id="certificate-display-name" name="certificateName" type="text" maxlength="80" required autocomplete="name" value="${esc(me.user.name || me.user.email)}"><button class="button secondary" type="submit">Update name</button></div><p class="small muted">This changes only your certificate name and is saved on this device.</p><p id="certificate-name-status" class="small" role="status"></p></form></details><div class="actions no-print"><button id="print-certificate" class="button secondary">Print my certificate</button><a href="/welcome/#live-discussion" class="button secondary">Join the weekly Bible discussion</a><a href="${ROOT}dashboard/">Return to my dashboard</a></div>${coachingInvite()}<section class="section completion-study-lab" id="study-lab" aria-labelledby="study-lab-title"><p class="eyebrow">A NEW DISCOVERY BEGINS WITH A PASSAGE</p><h2 id="study-lab-title">Bible Decoded Study Lab</h2><div id="study-lab-content"></div></section>`;
  wireSignout();
  $("#print-certificate").onclick = () => {
    const copy = $("#certificate").cloneNode(true);
    copy.id = "certificate-print";
    document.body.append(copy);
    document.body.classList.add("certificate-only");
    window.print();
    document.body.classList.remove("certificate-only");
    copy.remove();
  };
  wireCertificateName();
  await studyLab();
  if (location.hash === "#study-lab") {
    $("#study-lab").scrollIntoView({ block: "start" });
  }
}
function notifyProgressChanged() {
  try { local.setItem("bd-progress-changed", String(Date.now())); } catch {}
}
async function refreshLabAccess() {
  if (!me?.member || !["dashboard", "complete"].includes(page)) return;
  try {
    const fresh = await api("me");
    if (fresh.labUnlocked !== me.labUnlocked || !fresh.member || (page === "complete" && bonusCompleted(fresh) !== bonusCompleted(me))) {
      location.reload();
    } else if (page === "dashboard" && !fresh.labUnlocked) {
      me = fresh;
      dashboard();
    }
  } catch {
    // Saved drafts remain on this device if the connection is unavailable.
  }
}
window.addEventListener("pageshow", (event) => {
  if (event.persisted) void refreshLabAccess();
});
window.addEventListener("storage", (event) => {
  if (event.key === "bd-progress-changed") void refreshLabAccess();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refreshLabAccess();
});
async function boot() {
  readingSize();
  if (params.get("checkout") === "cancelled") {
    try {
      sessionStorage.removeItem("bd-checkout-attempt");
    } catch {}
    tell("Checkout was cancelled. You can return when you are ready.");
  }
  storeCarousel();
  if (page === "sales") return;
  config = await api("config");
  // Implicit email links can be opened on a different device; Supabase consumes and removes the URL fragment.
  auth = createClient(config.authUrl, config.authKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "implicit",
    },
  });
  if (params.get("signout") === "1") {
    await auth.auth.signOut();
    location.replace(ROOT + "welcome/");
    return;
  }
  const sessionId = params.get("session_id");
  if (sessionId) {
    try {
      sessionStorage.setItem("bd-purchase-session", sessionId);
    } catch {}
    history.replaceState(null, "", location.pathname);
  }
  const { data, error } = await auth.auth.getSession();
  if (error)
    tell(
      "That sign-in link could not be used. Please request a new link.",
      true,
    );
  if (!data.session) {
    authForm(
      sessionId
        ? "Sign in with your checkout email to check your purchase and open your program."
        : "",
    );
    return;
  }
  try {
    me = await api("me");
  } catch (e) {
    if (e.status !== 401) throw e;
    await auth.auth.signOut({ scope: "local" });
    authForm("Your sign-in has expired. Please sign in again.");
    return;
  }
  memberHeader();
  const purchase = sessionStorage.getItem("bd-purchase-session");
  if (purchase && !me.member) {
    try {
      me = await api("claim", "POST", { sessionId: purchase });
      if (me.member) sessionStorage.removeItem("bd-purchase-session");
    } catch (e) {
      tell(e.message, true);
    }
  }
  if (!me.member) {
    noAccess();
    return;
  }
  if (page === "welcome") {
    location.replace(ROOT + "dashboard/");
    return;
  }
  if (page === "dashboard") dashboard();
  else if (page === "lesson") await loadLesson();
  else if (page === "complete") await completion();
}
boot().catch((error) => {
  tell(error.message, true);
  if ($("#app"))
    $("#app").innerHTML =
      `<div class="notice error"><h2>We couldn’t open your study yet.</h2><p>${esc(error.message)}</p><div class="actions"><button class="button" id="retry-page">Try again</button><a href="${ROOT}welcome/">Return to sign in</a></div></div>`;
  if ($("#retry-page")) $("#retry-page").onclick = () => location.reload();
});
