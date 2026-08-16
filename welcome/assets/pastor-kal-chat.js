(() => {
  const ALLOWED_PATHS = new Set(["/welcome", "/welcome/"]);
  if (!ALLOWED_PATHS.has(window.location.pathname)) return;

  const API_URL = "/api/chat";
  const STORAGE_KEY = "pastorKalCurrentConversation";
  const MAX_LOCAL_MESSAGES = 14;

  const state = { busy: false, history: readHistory() };

  function readHistory() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value.slice(-MAX_LOCAL_MESSAGES) : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.history.slice(-MAX_LOCAL_MESSAGES)));
    } catch {}
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  const launcher = el("button", "pk-launcher");
  launcher.type = "button";
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = '<span class="pk-launcher-dot" aria-hidden="true"><img src="/welcome/assets/pastor-kal-avatar.jpg" alt=""></span><span>Ask Pastor Kal</span>';

  const panel = el("section", "pk-panel");
  panel.setAttribute("aria-label", "Pastor Kal AI Bible Guide");

  const header = el("header", "pk-header");
  const avatar = el("div", "pk-avatar");
  avatar.innerHTML = '<img src="/welcome/assets/pastor-kal-avatar.jpg" alt="Pastor Kal">';
  const title = el("div", "pk-title");
  title.innerHTML = '<strong>Pastor Kal</strong><span>AI Bible Guide</span>';
  const close = el("button", "pk-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close Pastor Kal");
  header.append(avatar, title, close);

  const body = el("div", "pk-body");
  const footer = el("footer", "pk-footer");
  const form = el("form", "pk-form");
  const input = el("textarea", "pk-input");
  input.placeholder = "Ask a Bible or life question…";
  input.rows = 1;
  input.maxLength = 6000;
  const send = el("button", "pk-send", "↑");
  send.type = "submit";
  send.setAttribute("aria-label", "Send question");
  form.append(input, send);
  footer.append(
    form,
    el(
      "div",
      "pk-disclaimer",
      "Pastor Kal is an AI Bible guide based on Pastor Kal Roller’s teachings, not the human pastor speaking live."
    )
  );

  panel.append(header, body, footer);
  document.body.append(launcher, panel);

  function addMessage(role, text, { save = false, sources = [] } = {}) {
    body.append(el("div", `pk-message ${role}`, text));
    if (sources.length) body.append(el("div", "pk-sources", `Knowledge used: ${sources.join(", ")}`));
    if (save) {
      state.history.push({ role, content: text });
      state.history = state.history.slice(-MAX_LOCAL_MESSAGES);
      saveHistory();
    }
    body.scrollTop = body.scrollHeight;
  }

  function showWelcome() {
    if (state.history.length) {
      state.history.forEach((m) => addMessage(m.role, m.content));
      return;
    }
    addMessage(
      "assistant",
      "Hi, I’m Pastor Kal, an AI Bible guide. Bring me your Bible questions, doubts, or something you’re wrestling with. What’s on your mind?"
    );
    const suggestions = el("div", "pk-suggestions");
    [
      "Why does God allow suffering?",
      "What happens when we die?",
      "How can I know God forgives me?",
      "Explain Daniel 2 to me.",
    ].forEach((label) => {
      const button = el("button", "pk-suggestion", label);
      button.type = "button";
      button.addEventListener("click", () => submitMessage(label));
      suggestions.append(button);
    });
    body.append(suggestions);
  }

  async function submitMessage(forcedText) {
    if (state.busy) return;
    const message = String(forcedText || input.value || "").trim();
    if (!message) return;

    const priorHistory = state.history.slice(-MAX_LOCAL_MESSAGES);
    input.value = "";
    addMessage("user", message, { save: true });

    state.busy = true;
    send.disabled = true;
    const typing = el("div", "pk-message assistant pk-typing", "Pastor Kal is looking through Scripture and the teaching library…");
    body.append(typing);
    body.scrollTop = body.scrollHeight;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history: priorHistory }),
      });
      const data = await response.json();
      typing.remove();
      if (!response.ok) throw new Error(data?.error || "Could not get an answer.");
      addMessage("assistant", data.answer, { save: true, sources: data.sources || [] });
    } catch (error) {
      typing.remove();
      addMessage("assistant", error?.message || "I couldn’t answer that right now. Please try again.");
    } finally {
      state.busy = false;
      send.disabled = false;
      input.focus();
    }
  }

  function toggle(open) {
    const next = typeof open === "boolean" ? open : !panel.classList.contains("pk-open");
    panel.classList.toggle("pk-open", next);
    launcher.setAttribute("aria-expanded", String(next));
    if (next) setTimeout(() => input.focus(), 0);
  }

  launcher.addEventListener("click", () => toggle());
  close.addEventListener("click", () => toggle(false));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMessage();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  });

  showWelcome();
})();
