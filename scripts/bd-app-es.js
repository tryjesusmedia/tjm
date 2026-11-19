import { createClient } from "@supabase/supabase-js";
import { Autosave } from "./bd-autosave.js";
import { LESSON_QUIZZES } from "./bd-quizzes-es.js";
import { quizChoiceOrder } from "./bd-quiz-order.js";
import { clearCompletionReveals, revealCompletion } from "./bd-completion-ui.js";
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
const ROOT = "/es/bibledecoded/",
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
const LESSON_ES = Object.freeze({
  foundations:{title:"Fundamentos",description:"Ideas clave y principios interpretativos que te ayudan a acercarte a la Biblia con mayor claridad."},
  "look-for-christ":{title:"Busca a Cristo",description:"Aprende a preguntar: «¿Dónde está Jesús en este pasaje?» y descubre conexiones centradas en Cristo a lo largo de las Escrituras."},
  "pattern-recognition":{title:"Reconocimiento de patrones",description:"Divide los pasajes en pasos, encuentra secuencias repetidas en otras partes de la Escritura y pregunta qué enseña el patrón."},
  "questioning-method":{title:"El método de las preguntas",description:"Usa ¿Quién? ¿Qué? ¿Cuándo? ¿Dónde? ¿Por qué? y ¿Cómo? para convertir la curiosidad en una investigación bíblica más profunda."},
  exegesis:{title:"Exégesis",description:"Aprende a extraer el significado del texto en lugar de introducir en él tus propias suposiciones."},
  "bible-memorization":{title:"Memorización bíblica",description:"Guarda la Escritura en tu mente mediante repetición, énfasis, capítulos, mapas temáticos y canciones de la Escritura."},
  "word-search":{title:"El método de búsqueda de palabras",description:"Método adicional: usa concordancias, léxicos, números de Strong y el uso repetido en la Biblia para investigar palabras y frases importantes."}
});
const localizeLesson = (item) => item ? ({...item,...(LESSON_ES[item.id]||{})}) : item;
const API_ERROR_ES = new Map([
  ["Please try again.","Inténtalo de nuevo."],
  ["Please sign in to continue.","Inicia sesión para continuar."],
  ["Tu sesión ha expirado. Inicia sesión de nuevo.","Tu sesión ha expirado. Inicia sesión de nuevo."],
  ["Please confirm your email address before continuing.","Confirma tu correo electrónico antes de continuar."],
  ["Member access is being prepared. Please try again later.","El acceso para miembros se está preparando. Inténtalo de nuevo más tarde."],
  ["Your account does not have Bible Decoded access yet.","Tu cuenta todavía no tiene acceso a Bible Decoded."],
  ["This workbook is being prepared. Please try again shortly.","Este cuaderno se está preparando. Inténtalo de nuevo en breve."],
  ["Workbook not found.","No se encontró el cuaderno."],
  ["Please wait a minute, then try again.","Espera un minuto y vuelve a intentarlo."],
  ["Please choose one answer for each of the 10 quiz questions.","Elige una respuesta para cada una de las 10 preguntas del cuestionario."],
  ["Score 90% or higher on each of the six lesson quizzes to unlock your Study Lab.","Obtén 90% o más en cada uno de los seis cuestionarios para desbloquear tu Laboratorio de Estudio."]
]);
const localizeError = (message) => API_ERROR_ES.get(String(message||"")) || String(message||"");

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
  const headers = {"X-TJM-Language":"es"};
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
        ? "Todavía no se ha guardado en tu cuenta. Revisa tu conexión y elige Intentar guardar de nuevo."
        : "No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.",
    );
  }
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(localizeError(data.error || "Inténtalo de nuevo."));
    Object.assign(error, data, { status: response.status });
    throw error;
  }
  return data;
}
function readingSize() {
  const scaleBody = window.createBodyTextScaler();
  let n = Number(local.getItem("tjm-body-text-level") ?? 10);
  n = Number.isFinite(n) ? Math.max(0, Math.min(39, n)) : 10;
  const apply = () => {
    scaleBody(.75 + n * .025);
    document.documentElement.dataset.bdTextLevel = String(n);
    try {
      local.setItem("tjm-body-text-level", String(n));
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
  return '<a class="button secondary" href="https://youtube.com/playlist?list=PLDFkxHcqdU19H9hrOex5RSLvlXU9ycyJu&si=nrlaPqe4YZsawYAc" target="_blank" rel="noopener">Abrir lista de reproducción de YouTube ↗</a>';
}
function authForm(message = "") {
  $("#app").innerHTML =
    `<div class="auth-card"><p class="eyebrow">TU ESPACIO PERSONAL DE ESTUDIO</p><h1>Bienvenido a<br>Bible Decoded.</h1><p class="muted">Inicia sesión para abrir tus lecciones y estudios guardados.</p>${message ? `<p class="notice">${esc(message)}</p>` : ""}<button id="google-signin" class="button secondary wide"><span class="google-mark" aria-hidden="true">G</span> Continuar con Google</button><button id="apple-signin" class="button secondary wide apple-sign-in" style="margin-top:12px">Continuar con Apple</button><div class="divider">o usa tu correo electrónico</div><form id="email-signin"><label for="signin-email">Correo electrónico</label><input id="signin-email" class="study-title" type="email" autocomplete="email" required placeholder="you@example.com"><button class="button wide" type="submit">Continuar con correo electrónico</button></form><p class="small muted">Te enviaremos un enlace de inicio de sesión por correo. No necesitas recordar una contraseña.</p><p class="small">Usa el correo electrónico que utilizaste al pagar. Con Apple, elige Compartir mi correo si coincide con el correo de tu compra. <a href="${ROOT}">Ver el programa</a></p><div id="auth-message" class="notice" role="status"></div></div>`;
  for (const provider of ["google", "apple"]) {
    $("#" + provider + "-signin").onclick = async () => {
      const button = $("#" + provider + "-signin");
      button.disabled = true;
      $("#auth-message").textContent = "";
      try {
        const { error } = await auth.auth.signInWithOAuth({
          provider,
          options: { redirectTo: location.origin + ROOT + "welcome/" },
        });
        if (error) throw error;
      } catch {
        $("#auth-message").textContent = "No pudimos iniciar la sesión. Inténtalo de nuevo o continúa con correo electrónico.";
        button.disabled = false;
      }
    };
  }
  $("#email-signin").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    $("#auth-message").textContent = "Enviando tu enlace de inicio de sesión…";
    try {
      const { error } = await auth.auth.signInWithOtp({
        email: $("#signin-email").value.trim(),
        options: { emailRedirectTo: location.origin + ROOT + "welcome/" },
      });
      if (error) throw error;
      $("#auth-message").textContent =
        "Revisa tu correo para encontrar el enlace de inicio de sesión. Si todavía no aparece, revisa la carpeta de correo no deseado. Puedes solicitar otro enlace en un minuto.";
      setTimeout(() => (button.disabled = false), 60000);
    } catch (e) {
      $("#auth-message").textContent =
        "No pudimos enviar el correo de inicio de sesión. Inténtalo de nuevo en breve, usa Google o escribe a info@tryjesusmedia.com para obtener ayuda.";
      button.disabled = false;
    }
  };
}
function memberHeader() {
  const a = $("#account-link");
  a.textContent = "Mi panel";
  a.href = ROOT + "dashboard/";
}
function coachingInvite() {
  return `<section class="coaching-invite no-print" aria-labelledby="coaching-title"><img class="coaching-photo" src="/assets/pastor-kal-coaching.jpg" alt="Pastor Kal" width="900" height="900" loading="lazy"><div class="coaching-copy"><p class="eyebrow">TU SIGUIENTE PASO · ACOMPAÑAMIENTO PERSONAL GRATUITO</p><h2 id="coaching-title">Abramos la Biblia juntos.</h2><p>Trae el pasaje que te confunde y las preguntas que siempre has querido hacer.</p><p><strong>Reserva una conversación bíblica gratuita con el Pastor Kal real. No con una IA.</strong></p><p>Revisaremos tus preguntas juntos, exploraremos conexiones que quizá no hayas notado y te ayudaremos a acercarte a las Escrituras con mayor claridad y confianza.</p><div class="coaching-action"><a class="button gold" href="https://calendly.com/kalroller/tryjesusmedia" target="_blank" rel="noopener">Elegir mi horario con Pastor Kal →</a></div><p class="small coaching-note">Trae tu Biblia. Trae tus preguntas. Elige un horario que funcione para ti.</p></div></section>`;
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
            "Algunas respuestas todavía no se han guardado. Intenta guardarlas de nuevo o imprime tus respuestas antes de cerrar sesión.",
            true,
          );
          return;
        }
        buttons.forEach((item) => (item.disabled = true));
        try {
          await auth.auth.signOut({ scope: "local" });
          location.assign(ROOT + "welcome/");
        } catch {
          buttons.forEach((item) => (item.disabled = false));
          tell(
            "No pudimos cerrar tu sesión. Revisa tu conexión e inténtalo de nuevo.",
            true,
          );
        }
      }),
  );
}
function noAccess() {
  $("#app").innerHTML =
    `<section class="page-top narrow"><p class="eyebrow">SESIÓN INICIADA</p><h1>Tu cuenta de Bible Decoded.</h1><div class="account-row"><p>Has iniciado sesión como <strong>${esc(me.user.email)}</strong>.</p><button class="account-signout" type="button" data-signout>Cerrar sesión y usar otra cuenta</button></div><div class="notice">Actualmente no tienes acceso a Bible Decoded. Si ya compraste el programa, verifica que estés usando el mismo correo electrónico que usaste al pagar.</div><div class="actions"><a class="button" href="https://buy.stripe.com/dRm28sacw6ufdSKfHu57W0b">Obtener Bible Decoded — <span class="purchase-prices"><s>$227</s> $97</span></a><a class="button secondary" href="${ROOT}">Ver el programa Bible Decoded</a><button id="check-access" class="button secondary">Comprobar mi acceso de nuevo</button></div><p class="offer-note">¡Precio especial para los próximos 100 clientes solamente!</p></section>`;
  $("#check-access").onclick = () => location.reload();
  wireSignout();
}
function dashboard() {
  clearCompletionReveals();
  const done = me.progress.filter(
    (p) =>
      hasEarnedCompletion(p) &&
      config.lessons.some((l) => l.id === p.lesson_id && !l.bonus),
  ).length;
  const recent = [...me.progress]
    .filter((p) => !hasEarnedCompletion(p))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const next =
    config.lessons.find((l) => l.id === recent?.lesson_id) ||
    config.lessons.find(
      (l) =>
        !l.bonus && !hasEarnedCompletion(me.progress.find((p) => p.lesson_id === l.id)),
    ) ||
    config.lessons[0];
  const name = me.user.name.split(" ")[0];
  const card = (l) => {
    const progress = me.progress.find((p) => p.lesson_id === l.id);
    const completed = hasEarnedCompletion(progress);
    const quizScore = Number.isInteger(progress?.quiz_score) ? progress.quiz_score : 0;
    return `<details class="lesson-fold"><summary class="lesson-fold-toggle"><span class="lesson-fold-name"><span class="lesson-fold-number">${l.bonus ? "Extra" : `0${l.number}`}</span><span>${esc(l.title)}</span></span><span class="lesson-fold-chevron" aria-hidden="true">⌄</span></summary><article class="card lesson-card ${completed ? "completed" : ""}"><div class="card-status"><div class="number">${l.bonus ? "Extra" : `0${l.number}`}</div><div class="card-status-text"><span class="lesson-status" ${completed ? 'data-completion-reveal="pending"' : ""}>${completed ? "✓ Completada" : progress ? "En progreso" : "Lista cuando tú lo estés"}</span><span class="dashboard-quiz-score" aria-label="Puntuación del cuestionario ${quizScore} por ciento">Cuestionario: ${quizScore}%</span></div></div><h3>${esc(l.title)}</h3><p>${esc(l.description)}</p><div class="actions">${l.bonus ? "" : `<a class="button secondary" href="${lessonLink(l.id, "video")}">Ver video</a>`}<a class="button secondary" href="${lessonLink(l.id, "workbook")}">Abrir cuaderno</a><button class="button secondary" data-printable="${l.id}">Guía imprimible (PDF)</button>${progress ? `<a href="${lessonLink(l.id)}" class="small">Continuar donde lo dejé →</a>` : ""}</div></article></details>`;
  };
  $("#app").innerHTML =
    `<section class="page-top"><p class="eyebrow">BIBLE DECODED · TU PANEL</p><h1>Bienvenido de nuevo${name ? ", " + esc(name) : ""}.</h1><p class="muted">Un poco de tiempo en la Palabra puede convertirse en una parte duradera de tu día.</p></section><section class="progress-panel"><div><h2>Tu progreso</h2><p>${done} de 6 lecciones completadas</p><progress max="6" value="${done}" aria-label="${done} de 6 lecciones completadas"></progress></div><a class="button gold" href="${done === 6 ? ROOT + "complete/" : lessonLink(next.id)}">${done === 6 ? "Celebrar tu progreso" : "Continuar aprendiendo →"}</a></section><div class="actions no-print">${albumLink()}</div><h2 class="section-label">Tus lecciones</h2><p class="small muted">Sigue las lecciones en orden o vuelve a un método cuando lo necesites.</p><div class="cards">${config.lessons
      .filter((l) => !l.bonus)
      .map(card)
      .join(
        "",
      )}</div><div class="bonus card">${card(config.lessons.at(-1))}</div><section class="section"><p class="eyebrow">SIGUE EXPLORANDO LAS ESCRITURAS</p><h2>Laboratorio de Estudio Bible Decoded</h2>${me.labUnlocked ? `<p>¡Felicitaciones por completar Bible Decoded! Ahora tienes herramientas para explorar las Escrituras con confianza.</p><p>Visita tu Laboratorio de Estudio para crear tus propios estudios bíblicos y poner en práctica lo aprendido.</p><a class="button" href="${ROOT}complete/#study-lab">Visitar el Laboratorio de Estudio</a>` : `<p>Obtén 90% o más en cada uno de los seis cuestionarios principales para desbloquear tu Laboratorio de Estudio personal. Podrás nombrar, guardar y volver a tantos estudios como quieras.</p><p class="notice">${6 - done} ${6 - done === 1 ? "lección pendiente" : "lecciones pendientes"}. La lección extra está disponible en cualquier momento.</p><p class="small muted">Cualquier estudio bíblico y nota que ya hayas guardado seguirá aquí cuando obtengas una puntuación aprobatoria en los seis cuestionarios.</p>`}</section>${coachingInvite()}<div class="actions dashboard-program-link no-print"><a class="button secondary" href="${ROOT}">Ver el programa Bible Decoded</a></div>`;
  document.querySelectorAll(".lesson-status[data-completion-reveal]").forEach((label) => revealCompletion(label));
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
    : '<p class="muted">Tus estudios guardados aparecerán aquí. Comienza con un pasaje que quieras comprender más profundamente.</p>';
}
function fieldHTML(field) {
  if (field.type === "check")
    return `<label class="check" for="${field.id}"><input id="${field.id}" type="checkbox" data-field="${field.id}"><span>${esc(field.text)}</span></label><div data-conflict="${field.id}"></div>`;
  return `<div class="field ${field.short ? "short" : ""}"><label for="${field.id}">${esc(field.text)}</label><textarea id="${field.id}" data-field="${field.id}" maxlength="12000" rows="${field.short ? 2 : 4}" placeholder="Escribe tu respuesta aquí…"></textarea><div class="print-answer" data-print="${field.id}"></div><div data-conflict="${field.id}"></div></div>`;
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
  const groups = [{ title: "Antes de comenzar", blocks: [] }];
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
  const choiceOrder = quizChoiceOrder(items);
  return `<details class="lesson-quiz no-print"><summary><span><span class="eyebrow">REPASO DE LA LECCIÓN</span>Haz el cuestionario de 10 preguntas</span><span class="quiz-toggle" aria-hidden="true">+</span></summary><div class="quiz-top"><div><span class="quiz-score-label">Última puntuación</span><strong id="quiz-score">${hasScore ? savedScore : 0}%</strong></div><button id="retake-quiz" class="button quiz-retake" type="button" ${hasScore ? "" : "hidden"}>Repetir cuestionario</button></div><form id="lesson-quiz-form" class="lesson-quiz-body">${items.map((item, questionIndex) => `<fieldset data-quiz-question="${questionIndex}"><legend>${questionIndex + 1}. ${esc(item.question)}</legend>${choiceOrder[questionIndex].map((choiceIndex) => `<label data-choice="${choiceIndex}"><input type="radio" name="quiz-${questionIndex}" value="${choiceIndex}"><span class="choice-copy">${esc(item.choices[choiceIndex])}<small class="choice-feedback" hidden></small></span></label>`).join("")}</fieldset>`).join("")}<button class="button quiz-submit" type="submit">Enviar cuestionario</button><div id="quiz-result" class="quiz-result" role="status" aria-live="polite"></div></form></details>`;
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
    const choiceOrder = quizChoiceOrder(items);
    form.querySelectorAll("fieldset").forEach((fieldset, questionIndex) => {
      fieldset.classList.remove("quiz-correct", "quiz-incorrect");
      choiceOrder[questionIndex].forEach((choiceIndex) => {
        fieldset.append(fieldset.querySelector(`[data-choice="${choiceIndex}"]`));
      });
    });
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
      result.textContent = `Responde las 10 preguntas. Te faltan ${unanswered} left.`;
      result.className = "quiz-result notice";
      return;
    }
    const submit = form.querySelector(".quiz-submit");
    submit.disabled = true;
    $("#retake-quiz").disabled = true;
    form.querySelectorAll("input").forEach((input) => { input.disabled = true; });
    let saved;
    try {
      saved = await api(`progress/${scope}`, "PUT", { quizAnswers: selections.map(Number) });
    } catch (error) {
      result.textContent = `${error.message} Tu puntuación todavía no se ha guardado.`;
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
      selectedFeedback.textContent = selected === item.answer ? "✓ ¡Correcto!" : "Incorrecto";
      if (selected !== item.answer) {
        const correctFeedback = correctLabel.querySelector(".choice-feedback");
        correctFeedback.hidden = false;
        correctFeedback.textContent = "✓ Respuesta correcta";
      }
    });
    const score = saved.quizScore;
    const progress = me.progress.find((entry) => entry.lesson_id === scope);
    const latest = {lesson_id: scope, quiz_score: score, quiz_passed: saved.completed ? 1 : 0, completed: saved.completed ? 1 : 0};
    if (progress) Object.assign(progress, latest);
    else me.progress.push(latest);
    updateLessonCompletion(saved.completed);
    notifyProgressChanged();
    $("#quiz-score").textContent = `${score}%`;
    $("#retake-quiz").hidden = false;
    result.textContent = score >= 90
      ? `${correct} de 10 correctas. ¡Muy bien! Has completado esta lección.`
      : `${correct} out of 10 correct. ${saved.completed ? "Tu lección sigue contando como completada." : "¡Estás avanzando! Una puntuación de 90% completa esta lección."} Review the highlighted answers above, then select Repetir cuestionario to try again.`;
    result.className = `quiz-result notice ${score >= 90 ? "quiz-passed" : ""}`;
    submit.disabled = false;
    $("#retake-quiz").disabled = false;
    form.querySelectorAll("input").forEach((input) => { input.disabled = false; });
  });
}
function hasEarnedCompletion(progress) {
  return Boolean(progress?.quiz_passed || progress?.quiz_score >= 90);
}
let cancelLessonCompletion = () => {};
function updateLessonCompletion(completed) {
  const input = $("#completed"), label = $("#completion-label"), status = $("#lesson-completion");
  if (!input || !label || !status) return;
  input.disabled = true;
  if (status.dataset.earned === String(completed)) return;
  cancelLessonCompletion();
  status.dataset.earned = String(completed);
  delete status.dataset.completionReveal;
  input.checked = false;
  label.textContent = completed
    ? "¡Muy bien! Has completado esta lección."
    : "¡Vas por buen camino! Obtén 90% o más en este cuestionario y marcaremos la lección como completada.";
  $(".workbook-end h2").textContent = completed ? "Ver siguiente lección" : "Pon en práctica lo que aprendiste.";
  if (completed) cancelLessonCompletion = revealCompletion(status, () => {
    input.checked = true;
    label.textContent = "Lección completada";
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
    ? "Una respuesta necesita tu atención abajo."
    : store.error ||
      (dirty ? "Guardando tus respuestas…" : "Tus respuestas están guardadas ✓");
  status.append(text);
  if (dirty && !store.running) {
    const retry = document.createElement("button");
    retry.textContent = "Intentar guardar de nuevo";
    retry.onclick = () => {
      void store.flush();
    };
    status.append(retry);
  }
}
function showConflict(id, current, root = document, store = autosave) {
  const box = root.querySelector(`[data-conflict="${id}"]`);
  box.className = "conflict";
  box.innerHTML = `<strong>Esta respuesta cambió en otro dispositivo.</strong><p class="small">Respuesta guardada en la cuenta:</p><pre>${esc(typeof current.value === "boolean" ? (current.value ? "Marcada" : "No marcada") : current.value)}</pre><div class="actions"><button class="button secondary" data-choice="cloud">Usar respuesta guardada</button><button class="button" data-choice="mine">Conservar mi respuesta aquí</button></div>`;
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
      headers: { Authorization: `Bearer ${data.session.access_token}`, "X-TJM-Language": "es" },
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        "No se pudo descargar el cuaderno imprimible. Inténtalo de nuevo.",
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
  data.lesson = localizeLesson(data.lesson);
  lesson = data.lesson;
  currentBlocks = lesson.blocks;
  const progress = me.progress.find((p) => p.lesson_id === scope);
  const next = config.lessons.find((l) => l.number === lesson.number + 1);
  document.title = `${lesson.title} | Bible Decoded`;
  $("#app").innerHTML =
    `<section class="page-top lesson-heading"><p class="breadcrumb"><a href="${ROOT}dashboard/">Bible Decoded</a> / ${lesson.bonus ? "Extra" : `Lección ${lesson.number}`}</p><p class="eyebrow">${lesson.bonus ? "TU MÉTODO EXTRA" : `LECCIÓN ${lesson.number} DE 6`}</p><h1>${esc(lesson.title)}</h1><p class="muted">${esc(lesson.description)}</p></section><div class="video" id="video"><div class="video-unavailable"><strong>${data.video ? "Cargando tu video…" : "El video de la lección se está preparando."}</strong><p>${data.video ? "" : "Puedes trabajar en los ejercicios de abajo mientras se conecta el video."}</p></div></div><p class="small no-print">Mira el video a tu propio ritmo. Completa el ejercicio de abajo antes de continuar.</p><div class="actions no-print">${albumLink()}</div><details class="lesson-workbook" id="workbook"><summary><span><span class="eyebrow">HOJA DE TRABAJO INTERACTIVA</span>Tu ${lesson.bonus ? "cuaderno extra" : "cuaderno"}</span><span class="workbook-toggle" aria-hidden="true">+</span></summary><div class="lesson-workbook-body"><div class="workbook-head"><h2>Tu cuaderno interactivo</h2><div id="save-status" class="save-status" role="status" aria-live="polite"></div></div><div class="actions no-print"><button id="save-now" class="button secondary">Guardar ahora</button><button id="download-workbook" class="button secondary">Guía imprimible (PDF)</button><button id="print-answers" class="button secondary">Imprimir mis respuestas</button></div><p class="small muted no-print">¿Prefieres papel y lápiz? Descarga la guía imprimible, abre el PDF y elige Imprimir. También puedes escribir abajo; tus respuestas se guardan automáticamente.</p>${renderWorkbook(currentBlocks)}<div class="workbook-end"><h2>Pon en práctica lo que aprendiste.</h2><div class="actions"><button id="finish-lesson" class="button">Guardar y continuar →</button><div class="check lesson-completion" id="lesson-completion" role="status" aria-live="polite"><input id="completed" type="checkbox" disabled aria-labelledby="completion-label"><span id="completion-label">¡Vas por buen camino! Obtén 90% o más en este cuestionario y marcaremos la lección como completada.</span></div></div></div></div></details><div class="help-bar"><div><strong>Herramientas de estudio bíblico</strong><div class="tools"><a href="https://www.biblegateway.com/" target="_blank" rel="noopener">Leer la Escritura ↗</a><a href="https://www.blueletterbible.org/" target="_blank" rel="noopener">Concordancia y léxico ↗</a></div></div></div>${lesson.number === 1 || lesson.number === 6 || lesson.bonus ? coachingInvite() : ""}`;
  if (lesson.bonus) {
    const video = $("#video");
    video.classList.add("bonus-thumbnail");
    video.innerHTML =
      '<img src="/assets/bible-decoded.jpg" alt="Bible Decoded" width="720" height="960">';
  }
  clearCompletionReveals();
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
    `<nav class="lesson-navigation no-print" aria-label="Navegación de lecciones">${previous ? `<a data-lesson-navigation href="${lessonLink(previous.id)}">← Lección anterior</a>` : ""}<a data-lesson-navigation href="${ROOT}dashboard/">Todas las lecciones</a>${next ? `<a data-lesson-navigation href="${lessonLink(next.id)}">Siguiente lección →</a>` : ""}</nav>`);
  workbookEnd.querySelector("h2").insertAdjacentHTML("afterend",
    `<p class="next-lesson-note">${lesson.number === 6 ? (me.labUnlocked ? "Siguiente: Celebra que completaste el curso" : "Siguiente: Tu panel") : next ? `Siguiente: ${esc(next.title)}` : "Siguiente: Tu panel"}</p>`);
  document.querySelectorAll(".lesson-workbook, .lesson-quiz, .workbook-subsection").forEach((panel) => {
    const summary = panel.querySelector(":scope > summary");
    const hint = document.createElement("span");
    hint.className = "panel-hint";
    hint.textContent = "Toca para abrir";
    const title = summary.querySelector(":scope > span:not(.subsection-number)");
    title.append(hint);
    panel.addEventListener("toggle", () => { hint.textContent = panel.open ? "Toca para cerrar" : "Toca para abrir"; });
  });
  connectWorkbook(data);
  document.querySelectorAll("[data-lesson-navigation]").forEach((link) => {
    link.addEventListener("click", async (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (!(await autosave.flush())) {
        tell("Tus respuestas todavía no se han guardado. Revisa tu conexión e inténtalo de nuevo.", true);
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
  updateLessonCompletion(hasEarnedCompletion(progress));
  $("#finish-lesson").onclick = async () => {
    const b = $("#finish-lesson");
    b.disabled = true;
    try {
      if (!(await autosave.flush()))
        throw new Error(
          "Resuelve cualquier respuesta sin guardar antes de continuar.",
        );
      await saveVideoPosition();
      if (lesson.number === 6) me = await api("me");
      location.assign(
        lesson.number === 6
          ? ROOT + (me.labUnlocked ? "complete/" : "dashboard/")
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
            "No se pudo cargar el reproductor de video. Revisa tu conexión.",
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
          "No se pudo cargar el reproductor de video. Revisa tu conexión.",
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
                "No se pudo cargar el reproductor de video. Revisa tu conexión.",
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
            (event.target.getIframe().title = lesson.title + " — video de la lección"),
          onStateChange: () => {
            void saveVideoPosition();
          },
          onError: () =>
            tell(
              "No se pudo reproducir este video. Comunícate con nosotros si sigue sin estar disponible.",
              true,
            ),
        },
      });
    } else {
      const iframe = document.createElement("iframe");
      iframe.src = video.url + `?startTime=${Math.floor(seconds)}s`;
      iframe.title = `${lesson.title} — video de la lección`;
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
      "No se pudo guardar la posición del video. El estado de guardado de tu cuaderno aparece abajo.",
      true,
    );
  }
}
function studyPanel(study) {
  return `<details class="saved-study" data-study-id="${esc(study.id)}"><summary><span>${esc(study.title)}<small>Actualizado ${esc(new Date(study.updated_at).toLocaleDateString("es-US"))}</small></span><span class="study-toggle" aria-hidden="true">+</span></summary><div class="study-editor"></div></details>`;
}
async function openStudyPanel(panel) {
  if (panel.dataset.loaded || panel.dataset.loading) return;
  panel.dataset.loading = "true";
  const editor = panel.querySelector(".study-editor");
  editor.innerHTML = '<p role="status">Abriendo tu estudio…</p>';
  try {
    const id = panel.dataset.studyId;
    const data = await api("study/" + encodeURIComponent(id));
    editor.innerHTML = `<p class="muted">Usa los métodos que te ayuden a explorar este pasaje. Tu trabajo estará aquí cuando regreses.</p><div class="workbook-head"><h3>Tu espacio de estudio</h3><div data-save-status class="save-status" role="status" aria-live="polite"></div></div><div class="actions study-actions no-print"><button data-save-now class="button">Guardar mi estudio</button><button data-print-answers class="button secondary">Imprimir mi estudio</button></div>${renderWorkbook(data.study.blocks)}`;
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
    retry.textContent = "Intentar abrir de nuevo";
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
  container.innerHTML = `<p>Elige un pasaje y dale un nombre a tu estudio. Un espacio en blanco reunirá todos tus métodos.</p><form class="study-form" id="new-study"><div><label for="study-name">Nombre del estudio</label><input class="study-title" id="study-name" maxlength="120" required placeholder="Por ejemplo: Génesis 22 — Abraham e Isaac"></div><button class="button">Comenzar mi estudio →</button></form><h3 class="section-label">Mis estudios bíblicos</h3><div id="saved-studies">${studyList()}</div>`;
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
      status.textContent = "Escribe el nombre que quieres que aparezca en tu certificado.";
      return;
    }
    name.textContent = value;
    try {
      local.setItem(key, value);
      status.textContent = "Nombre del certificado actualizado.";
    } catch {
      status.textContent = "Nombre del certificado actualizado para esta visita.";
    }
  };
}
function bonusCompleted(member) {
  return hasEarnedCompletion(member.progress?.find((p) => p.lesson_id === "word-search"));
}
async function completion() {
  clearCompletionReveals();
  if (!me.labUnlocked) {
    location.replace(ROOT + "dashboard/");
    return;
  }
  $("#app").innerHTML =
    `<section class="page-top narrow"><p class="eyebrow">SEIS LECCIONES. UN NUEVO COMIENZO.</p><h1>Completaste<br>Bible Decoded.</h1><p>Has practicado los métodos. Ahora incorpóralos a tu propio tiempo en las Escrituras.</p><div class="actions"><a class="button" href="#study-lab">Abrir mi Laboratorio de Estudio →</a><a class="button secondary" href="${lessonLink("word-search", "workbook")}">Explorar la lección extra</a></div></section><section class="certificate" id="certificate" aria-label="Certificado de Finalización de Bible Decoded"><span class="certificate-corner corner-tl" aria-hidden="true"></span><span class="certificate-corner corner-tr" aria-hidden="true"></span><span class="certificate-corner corner-bl" aria-hidden="true"></span><span class="certificate-corner corner-br" aria-hidden="true"></span><div class="certificate-content"><div class="certificate-awards"><div class="certificate-bonus" ${bonusCompleted(me) ? "" : "hidden"}><span aria-hidden="true">❧</span><p>Lección extra completada</p><span aria-hidden="true">❧</span></div><img class="certificate-faith-seal" src="/assets/bible-decoded-completion-seal.svg" width="140" height="140" alt="Sello dorado con una Biblia abierta y ramas de laurel: Bible Decoded — Curso completado"><div class="certificate-brand-mark"><img class="certificate-logo" src="/assets/logo.png" width="88" height="88" alt="Try Jesus Media"><p class="certificate-brand">TRY JESUS MEDIA</p></div></div><div class="certificate-flourish" aria-hidden="true">◆</div><h2 class="certificate-title">Certificado <em>de finalización</em></h2><p class="certificate-presented">PRESENTADO CON ALEGRÍA A</p><p class="person" id="certificate-name">${esc(me.user.name || me.user.email)}</p><p class="certificate-recognition">En reconocimiento por completar las seis lecciones guiadas de</p><h3 class="certificate-course">Bible Decoded</h3><p class="certificate-dedication">Una base para comprender las Escrituras,<br>compartir su verdad y guiar a otros hacia Jesús.</p><div class="certificate-footer"><div class="certificate-motto"><p>Sigue descubriendo.<br>Sigue creciendo.</p><span>TRYJESUSMEDIA.COM</span></div><div class="certificate-host"><img class="certificate-signature" src="/assets/pastor-kal-signature-transparent.svg" alt="Firma de Pastor Kal Roller" width="180" height="64"><p>Pastor Kal Roller</p><span>PRESENTADOR DEL CURSO</span></div></div><p class="certificate-methods">Fundamentos · Busca a Cristo · Reconocimiento de patrones<br>El método de las preguntas · Exégesis · Memorización bíblica</p></div></section><details class="certificate-name-editor no-print"><summary>Cambiar nombre del certificado</summary><form id="certificate-name-form"><label for="certificate-display-name">Nombre que aparecerá en tu certificado</label><div class="actions"><input id="certificate-display-name" name="certificateName" type="text" maxlength="80" required autocomplete="name" value="${esc(me.user.name || me.user.email)}"><button class="button secondary" type="submit">Actualizar nombre</button></div><p class="small muted">Esto cambia solo el nombre del certificado y se guarda en este dispositivo.</p><p id="certificate-name-status" class="small" role="status"></p></form></details><div class="actions no-print"><button id="print-certificate" class="button secondary">Imprimir mi certificado</button><a href="/es/welcome/#live-discussion" class="button secondary">Unirse a la conversación bíblica semanal</a><a href="${ROOT}dashboard/">Volver a mi panel</a></div>${coachingInvite()}<section class="section completion-study-lab" id="study-lab" aria-labelledby="study-lab-title"><p class="eyebrow">UN NUEVO DESCUBRIMIENTO COMIENZA CON UN PASAJE</p><h2 id="study-lab-title">Laboratorio de Estudio Bible Decoded</h2><div id="study-lab-content"></div></section>`;
  if (bonusCompleted(me)) revealCompletion($(".certificate-bonus"));
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
  if (!me?.member || !["dashboard", "complete", "lesson"].includes(page)) return;
  try {
    const fresh = await api("me");
    if (!fresh.member || (page === "complete" && (fresh.labUnlocked !== me.labUnlocked || bonusCompleted(fresh) !== bonusCompleted(me)))) {
      location.reload();
    } else {
      const changed = fresh.labUnlocked !== me.labUnlocked || JSON.stringify(fresh.progress) !== JSON.stringify(me.progress);
      me = fresh;
      if (page === "dashboard" && changed) dashboard();
      if (page === "lesson" && changed) {
        const progress = me.progress.find((entry) => entry.lesson_id === scope);
        updateLessonCompletion(hasEarnedCompletion(progress));
        if ($("#quiz-score")) $("#quiz-score").textContent = `${progress?.quiz_score ?? 0}%`;
        if ($("#retake-quiz")) $("#retake-quiz").hidden = !Number.isInteger(progress?.quiz_score);
      }
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
function updateDecodedAccountLink(session) {
  const link = $("#bd-auth-link");
  if (!link) return;
  link.textContent = session ? "Cerrar sesión" : "Iniciar sesión";
  link.href = ROOT + "welcome/" + (session ? "?signout=1" : "");
  link.hidden = false;
}
async function boot() {
  readingSize();
  if (params.get("checkout") === "cancelled") {
    try {
      sessionStorage.removeItem("bd-checkout-attempt");
    } catch {}
    tell("La compra fue cancelada. Puedes volver cuando estés listo.");
  }
  storeCarousel();
  config = await api("config");
  config.lessons = config.lessons.map(localizeLesson);
  // Implicit email links can be opened on a different device; Supabase consumes and removes the URL fragment.
  auth = createClient(config.authUrl, config.authKey, {
    auth: {
      storageKey: "bibledecoded-auth-v1",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "implicit",
    },
  });
  // This menu observes only Bible Decoded's isolated session.
  auth.auth.onAuthStateChange((_event, session) => updateDecodedAccountLink(session));
  const initial = await auth.auth.getSession();
  updateDecodedAccountLink(initial.data.session);
  if (page === "sales") return;
  if (params.get("signout") === "1") {
    await auth.auth.signOut({ scope: "local" });
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
      "No se pudo usar ese enlace de inicio de sesión. Solicita uno nuevo.",
      true,
    );
  if (!data.session) {
    authForm(
      sessionId
        ? "Inicia sesión con el correo electrónico usado al pagar para comprobar tu compra y abrir tu programa."
        : "",
    );
    return;
  }
  try {
    me = await api("me");
  } catch (e) {
    if (e.status !== 401) throw e;
    await auth.auth.signOut({ scope: "local" });
    authForm("Tu sesión ha expirado. Inicia sesión de nuevo.");
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
      `<div class="notice error"><h2>Todavía no pudimos abrir tu estudio.</h2><p>${esc(error.message)}</p><div class="actions"><button class="button" id="retry-page">Intentar de nuevo</button><a href="${ROOT}welcome/">Volver a iniciar sesión</a></div></div>`;
  if ($("#retry-page")) $("#retry-page").onclick = () => location.reload();
});
