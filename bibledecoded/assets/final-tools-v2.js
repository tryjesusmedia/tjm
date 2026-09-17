(() => {
  const MASTER_DOC =
    "https://docs.google.com/document/d/1JGfqybS1iCU-Ax3AeawkRCu_GX4rJ1oB/edit?usp=drivesdk&ouid=100641858966171682566&rtpof=true&sd=true";
  const DISCUSSION_DOC =
    "https://docs.google.com/document/d/1okBzI9uMWAfyu1j8kQ-p4xmxhkEufSJX/edit?usp=drivesdk&ouid=100641858966171682566&rtpof=true&sd=true";
  const MASTER_PDF =
    "https://docs.google.com/document/d/1JGfqybS1iCU-Ax3AeawkRCu_GX4rJ1oB/export?format=pdf";
  const DISCUSSION_PDF =
    "https://docs.google.com/document/d/1okBzI9uMWAfyu1j8kQ-p4xmxhkEufSJX/export?format=pdf";
  const esc = (v) =>
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
  const f = (id, label, rows = 4, help = "") =>
    `<div class="final-field"><label for="${id}">${label}</label>${help ? `<p class="small muted">${help}</p>` : ""}<textarea id="${id}" data-final-field="${id}" rows="${rows}" placeholder="Write your answer here…"></textarea></div>`;
  const s = (id, label, help = "") => f(id, label, 2, help);
  const sectionize = (html) =>
    html
      .replace(
        /<section class="final-form-section"><h3>(.*?)<\/h3>/g,
        '<details class="final-form-section"><summary><span>$1</span><span class="final-section-open" aria-hidden="true">+</span></summary><div class="final-form-section-body">',
      )
      .replace(/<\/section>/g, "</div></details>");
  function readingSize() {
    const a = document.querySelector("#smaller"),
      b = document.querySelector("#larger");
    if (!a || !b) return;
    let n = Number(localStorage.getItem("bd-reading-size") || 8);
    n = Number.isFinite(n) ? Math.max(0, Math.min(39, n)) : 8;
    const apply = () => {
      document.documentElement.style.fontSize = `${16 + n * 0.5}px`;
      localStorage.setItem("bd-reading-size", String(n));
      a.disabled = n === 0;
      b.disabled = n === 39;
    };
    a.onclick = () => {
      n = Math.max(0, n - 1);
      apply();
    };
    b.onclick = () => {
      n = Math.min(39, n + 1);
      apply();
    };
    apply();
  }
  function congratulations() {
    const lessonId = new URLSearchParams(location.search).get("lesson");
    if (
      document.body.dataset.page !== "lesson" ||
      !["bible-memorization", "word-search"].includes(lessonId)
    )
      return;
    const add = () => {
      const end = document.querySelector(".workbook-end");
      if (!end || document.querySelector("#bd-congratulations")) return false;
      const panel = document.createElement("details");
      panel.id = "bd-congratulations";
      panel.className = "bd-congratulations";
      panel.innerHTML = `<summary><span>Congratulations!</span><span class="congrats-open" aria-hidden="true">+</span></summary><div class="congrats-body"><p class="eyebrow">YOU FINISHED BIBLE DECODED</p><h2>You did it. Keep opening the Bible with confidence.</h2><p>Congratulations on finishing the six Bible Decoded lessons! You now have a practical set of tools to help you slow down, ask better questions, study the context, recognize patterns, look for Christ, and keep Scripture in your heart.</p><p>These tools are not only for your own quiet time. With prayer, humility, and practice, you can use what you have learned to create thoughtful Bible discussions, sermons, Bible-study lessons, small-group conversations, and church presentations that help people understand Scripture and point them to Jesus.</p><p>Keep learning. Keep checking your conclusions against Scripture. And keep sharing what you discover with warmth and grace.</p><div class="final-resource-grid"><article><p class="eyebrow">START HERE</p><h3>Bible Decoded Master Study Sheet</h3><p>A reusable 6-part study method for almost any Bible passage. Use it to test, understand, and apply what you read without forcing a symbol, pattern, or meaning the text does not support.</p><div class="actions"><a class="button gold" href="/bibledecoded/final-tools/#master">Fill it out online →</a><a class="button secondary" href="${MASTER_PDF}" target="_blank" rel="noopener">Download PDF ↗</a></div></article><article><p class="eyebrow">BUILD SOMETHING TO SHARE</p><h3>Bible Decoded Discussion Builder</h3><p>Turn one passage into a clear, Christ-centered Bible discussion you can keep, share, and lead, complete with context, important words, patterns, application, and five discussion questions.</p><div class="actions"><a class="button gold" href="/bibledecoded/final-tools/#discussion">Fill it out online →</a><a class="button secondary" href="${DISCUSSION_PDF}" target="_blank" rel="noopener">Download PDF ↗</a></div></article></div><p class="small congrats-note">Both worksheets are reusable. Fill them out online and print your finished work, or download a blank copy to use by hand.</p></div>`;
      end.insertAdjacentElement("afterend", panel);
      panel.addEventListener(
        "toggle",
        () =>
          (panel.querySelector(".congrats-open").textContent = panel.open
            ? "−"
            : "+"),
      );
      return true;
    };
    if (add()) return;
    const o = new MutationObserver(() => {
      if (add()) o.disconnect();
    });
    o.observe(document.body, { childList: true, subtree: true });
  }
  const masterFields = () =>
    `<section class="final-form-section"><h3>Passage</h3>${s("m-passage", "Passage")}${s("m-date", "Date")}${s("m-theme", "Theme")}</section><section class="final-form-section"><h3>1. Foundations</h3><p>Pray. Read slowly. Begin with God’s character and redemption.</p>${f("m-god", "What does this reveal about God’s character?", 4, "Character / glory / name")}${f("m-redemptive", "How is this passage redemptive?", 4, "How is God saving, healing, restoring, or leading?")}${f("m-life", "What does this mean in my life?", 4, "What response, trust, change, or action?")}${f("m-unclear", "What do I not understand yet?", 3, "Write it down instead of forcing an answer.")}</section><section class="final-form-section"><h3>2. Look for Christ</h3>${f("m-christ", "Where do I see Christ, His character, His work, His mission, or a truth that points me toward Him?", 5, "If the connection is symbolic, note why the passage or wider Bible supports it.")}</section><section class="final-form-section"><h3>3. Pattern Recognition</h3>${f("m-steps", "Steps in this passage", 5)}${f("m-patterns", "Where else do I see this?", 4)}${f("m-pattern-meaning", "What might the pattern teach?", 4)}</section><section class="final-form-section"><h3>4. The Questioning Method</h3><div class="final-two-col">${f("m-who", "WHO?", 3, "People, groups, speaker, audience")}${f("m-what", "WHAT?", 3, "What happens? What is said?")}${f("m-when", "WHEN?", 3, "Time, sequence, before / after")}${f("m-where", "WHERE?", 3, "Places and why they matter")}${f("m-why", "WHY?", 3, "Motives, purpose, cause")}${f("m-how", "HOW?", 3, "Method, response, outcome")}</div></section><section class="final-form-section"><h3>5. Exegesis</h3>${f("m-historical", "Historical context", 4, "Who wrote it? To whom? When? What was happening?")}${f("m-literary", "Literary context & genre", 4, "What comes before/after? History, poetry, prophecy, parable, apocalyptic, etc.?")}${f("m-words", "Words & cross-references", 4, "Which words need study? What other passages clarify this one?")}${f("m-intent", "Author’s intended message", 4, "What was the writer communicating to the original audience?")}<div class="callout"><strong>Interpretation Safety Check</strong><p>☐ Context supports it &nbsp; ☐ Wider Bible supports it &nbsp; ☐ Meaning ≠ application/illustration &nbsp; ☐ I can say “I don’t know yet”</p></div></section><section class="final-form-section"><h3>6. Memorization</h3>${s("m-memory", "Verse or short passage to memorize")}${f("m-memory-why", "Why this truth matters to me", 3)}<div class="callout"><p>Repeat it aloud: ☐ Morning ☐ Midday ☐ Evening</p><p>Say it from memory: ☐ Today ☐ Tomorrow ☐ One week</p></div>${f("m-one-sentence", "One-Sentence Discovery: What is the main truth of this passage?", 3)}</section><section class="final-form-section"><h3>Bonus Method — Word Search</h3>${s("m-key-word", "Key word")}${f("m-word-meaning", "Bible-defined meaning / related passages", 4, "Use a concordance or lexicon when helpful; let Scripture clarify Scripture rather than importing a definition too quickly.")}</section>`;
  const discussionFields = () =>
    `<section class="final-form-section"><h3>Final Project</h3><p>Choose one Bible passage and use the Bible Decoded methods to build one clear, Christ-centered discussion.</p>${s("d-passage", "Choose your passage", "Book, chapter, and verses.")}${s("d-title", "Working title", "A short title that captures the main idea.")}${f("d-summary", "Passage summary", 4, "Retell what happens in your own words.")}</section><section class="final-form-section"><h3>Step 1 — Understand the Passage</h3>${f("d-historical", "Historical context", 4, "Who wrote it? To whom? When? What was happening?")}${f("d-literary", "Literary context", 4, "What comes before and after? What genre is this?")}${f("d-biblical", "Biblical context", 4, "What other Scriptures help clarify this passage?")}</section><section class="final-form-section"><h3>Step 2A — Investigate Important Words</h3>${f("d-words", "Important words / phrases", 6, "Note the word or phrase, where else it appears, meaning or insight, and why it matters. Let Scripture and context guide the meaning; use a concordance or Hebrew/Greek lexicon when helpful.")}</section><section class="final-form-section"><h3>Step 2B — Ask the Investigative Questions</h3><div class="final-two-col">${f("d-who", "WHO?", 3, "People, groups, speakers, listeners.")}${f("d-what", "WHAT?", 3, "Events, claims, commands, choices, conflicts.")}${f("d-when", "WHEN?", 3, "Timing, sequence, what comes before and after.")}${f("d-where", "WHERE?", 3, "Place, geography, history, significance.")}${f("d-why", "WHY?", 3, "Motives, reasons, purpose of the detail.")}${f("d-how", "HOW?", 3, "How the problem develops or resolves; how God acts.")}</div></section><section class="final-form-section"><h3>Step 3 — Look for Patterns and Christ</h3>${f("d-steps", "Break the passage into steps", 5, "Write the main events or movements in order.")}${f("d-patterns", "Where else do you see a similar pattern?", 5, "List passages with a similar sequence, image, theme, or experience.")}${f("d-pattern-meaning", "What might the pattern teach?", 4, "What becomes clearer when the passages are compared?")}${f("d-christ", "Where is Christ?", 5, "How does this point to Jesus, His character, His mission, His saving work, or our need for Him?")}${f("d-me", "Where am I?", 4, "Where is your own condition, choice, struggle, calling, or response reflected?")}${f("d-god", "What does this reveal about God’s character?", 4, "How is God acting redemptively?")}</section><section class="final-form-section"><h3>Step 4 — Find the Central Truth</h3>${f("d-central", "Central truth", 4, "Finish: “The main truth this passage teaches is...”")}${f("d-application", "Personal application", 4, "What should change in the way you think, trust, choose, relate, worship, or live?")}${s("d-memory", "Memory verse", "Choose one verse that captures the central truth.")}${f("d-memory-why", "Why this verse?", 3, "Why do you want this line hidden in your heart?")}<div class="callout"><strong>Interpretation Safety Check</strong><p>☐ I considered the immediate context.<br>☐ I considered the author’s intended message before personal application.<br>☐ My cross-references support the connection I am making.<br>☐ I can distinguish what the text says from an illustration or possibility.<br>☐ My conclusion is consistent with the larger message of Scripture.<br>☐ I asked what the passage reveals about God’s character and how it is redemptive.</p></div></section><section class="final-form-section"><h3>Step 5 — Write Five Discussion Questions</h3>${f("d-q1", "Discussion Question 1", 2, "Make it open-ended. Aim for observation, meaning, or application — not a yes/no quiz.")}${f("d-q2", "Discussion Question 2", 2)}${f("d-q3", "Discussion Question 3", 2)}${f("d-q4", "Discussion Question 4", 2)}${f("d-q5", "Discussion Question 5", 2)}</section><section class="final-form-section"><h3>Step 6 — Prepare to Lead</h3>${f("d-hook", "Opening hook", 4, "How will you make people curious about the passage?")}${f("d-bridge", "Bridge into the Bible", 4, "How will you move naturally from the opening into the passage?")}${f("d-appeal", "Closing appeal", 4, "What do you want people to understand, believe, decide, or do?")}${f("d-one-sentence", "One sentence to remember", 3, "If they remember only one sentence, what should it be?")}</section><section class="final-form-section"><h3>Finished Project — My Bible Decoded Discussion</h3>${s("d-final-title", "TITLE")}${s("d-final-passage", "PASSAGE")}${f("d-final-central", "CENTRAL TRUTH", 3)}${f("d-final-christ", "CHRIST CONNECTION", 3)}${s("d-final-memory", "MEMORY VERSE")}</section>`;
  function formCard(id, title, description, fields, doc, pdf) {
    return `<details class="final-tool-card" id="${id}"><summary><div class="final-tool-intro"><p class="eyebrow">REUSABLE WORKSHEET</p><h2>${title}</h2><p>${description}</p></div><span class="final-tool-open" aria-hidden="true">+</span></summary><div class="final-tool-body"><div class="actions no-print final-tool-actions"><button class="button gold" data-print-form="${id}" type="button">Print this worksheet</button><button class="button secondary" data-clear-form="${id}" type="button">Start a new blank copy</button><a class="button secondary" href="${pdf}" target="_blank" rel="noopener">Download PDF ↗</a><a href="${doc}" target="_blank" rel="noopener">Open original document ↗</a></div><p class="small saved-note final-tool-actions" data-save-note="${id}">Your typing is saved on this device as you work.</p><div class="final-form" data-form="${id}">${sectionize(fields)}</div></div></details>`;
  }
  function toolsPage() {
    if (document.body.dataset.page !== "final-tools") return;
    readingSize();
    const app = document.querySelector("#final-tools-app");
    if (!app) return;
    document.title = "Bible Decoded Study Lab | Try Jesus Media";
    app.innerHTML = `<section class="page-top final-tools-heading"><p class="breadcrumb"><a href="/bibledecoded/dashboard/">Bible Decoded</a> / Study Lab</p><p class="eyebrow">KEEP USING WHAT YOU LEARNED</p><h1>Bible Decoded<br>Study Lab</h1><p>These two worksheets are designed to be used again and again. Start with the Master Study Sheet when you are exploring a passage for yourself. Then use the Discussion Builder when you are ready to turn what you discovered into something you can share.</p></section><details class="bd-congratulations"><summary><span>Congratulations!</span><span class="congrats-open" aria-hidden="true">+</span></summary><div class="congrats-body"><p class="eyebrow">YOU FINISHED BIBLE DECODED</p><h2>You now have tools you can keep using.</h2><p>You have learned how to slow down, ask better questions, study context, recognize patterns, look for Christ, and keep Scripture in your heart.</p><p>Use these reusable worksheets to create Bible discussions, sermons, lessons, small-group conversations, and church presentations that help people understand Scripture and bring them to Jesus.</p><p>Keep opening the Bible. Keep testing your conclusions. And keep sharing what you discover with warmth and grace.</p></div></details>${formCard("master", "Bible Decoded Master Study Sheet", "A reusable 6-part method for studying any Bible passage: Foundations, Look for Christ, Pattern Recognition, the Questioning Method, Exegesis, Memorization, plus the Bonus Word Search method.", masterFields(), MASTER_DOC, MASTER_PDF)}${formCard("discussion", "Bible Decoded Discussion Builder", "Your final assignment: create a Bible discussion you can actually keep, share, and lead. Your finished project gathers your context, word study, questions, patterns, Christ connection, central truth, application, memory verse, and five discussion questions.", discussionFields(), DISCUSSION_DOC, DISCUSSION_PDF)}<section class="final-tools-footer no-print"><h2>Use them as often as you want.</h2><p>Print a completed copy for your notes, then choose “Start a new blank copy” when you are ready for another passage. Your current draft is kept on this device until you clear it.</p><a class="button" href="/bibledecoded/dashboard/">Return to my Bible Decoded dashboard →</a></section>`;
    document
      .querySelectorAll(".bd-congratulations,.final-tool-card,.final-form-section")
      .forEach((panel) =>
        panel.addEventListener("toggle", () => {
          const icon = panel.querySelector(
            ":scope > summary .congrats-open,:scope > summary .final-tool-open,:scope > summary .final-section-open",
          );
          if (icon) icon.textContent = panel.open ? "−" : "+";
        }),
      );
    app.querySelector(".final-tools-footer").insertAdjacentHTML("afterend",
      `<section class="coaching-invite no-print" aria-labelledby="study-lab-coaching-title"><img class="coaching-photo" src="/assets/pastor-kal-coaching.jpg" alt="Pastor Kal" width="900" height="900" loading="lazy"><div class="coaching-copy"><p class="eyebrow">YOUR NEXT STEP · FREE PERSONAL COACHING</p><h2 id="study-lab-coaching-title">Let’s open the Bible together.</h2><p>Bring your Master Study Sheet, your Discussion Builder, or a passage you would like help understanding.</p><p><strong>Book a free Bible discussion coaching call with the real, human Pastor Kal. Not AI.</strong></p><p>We’ll explore your questions together and help you take the next step with confidence.</p><div class="coaching-action"><a class="button gold" href="https://calendly.com/kalroller/kal" target="_blank" rel="noopener">Choose my time with Pastor Kal →</a></div><p class="small coaching-note">Bring your Bible. Bring your questions. Choose a time that works for you.</p></div></section>`);
    const dashboardButton = app.querySelector(".final-tools-footer > .button");
    const dashboardActions = document.createElement("div");
    dashboardActions.className = "actions no-print";
    dashboardButton.classList.add("gold");
    dashboardActions.append(dashboardButton);
    app.querySelector(".coaching-invite").after(dashboardActions);
    const inputs = [...document.querySelectorAll("[data-final-field]")];
    for (const input of inputs) {
      const key = `bd-final-tools:${input.id}`;
      try {
        input.value = localStorage.getItem(key) || "";
      } catch {}
      input.addEventListener("input", () => {
        try {
          localStorage.setItem(key, input.value);
        } catch {}
        const id = input.closest("[data-form]")?.dataset.form,
          n = document.querySelector(`[data-save-note="${id}"]`);
        if (n) {
          n.textContent = "Saved on this device ✓";
          clearTimeout(n._timer);
          n._timer = setTimeout(
            () =>
              (n.textContent =
                "Your typing is saved on this device as you work."),
            1800,
          );
        }
      });
    }
    document.querySelectorAll("[data-print-form]").forEach(
      (b) =>
      (b.onclick = () => {
        document.querySelector(`#${b.dataset.printForm}`).open = true;
        document
          .querySelectorAll(`#${b.dataset.printForm} .final-form-section`)
          .forEach((section) => (section.open = true));
        document.body.dataset.printFinal = b.dataset.printForm;
          window.print();
          delete document.body.dataset.printFinal;
        }),
    );
    document.querySelectorAll("[data-clear-form]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.clearForm;
          if (
            !confirm(
              "Start a new blank copy? This clears the saved answers in this worksheet on this device.",
            )
          )
            return;
          document
            .querySelectorAll(`#${id} [data-final-field]`)
            .forEach((i) => {
              i.value = "";
              try {
                localStorage.removeItem(`bd-final-tools:${i.id}`);
              } catch {}
            });
          document
            .querySelector(`#${id}`)
            .scrollIntoView({ behavior: "smooth", block: "start" });
        }),
    );
    if (location.hash)
      setTimeout(
        () =>
          document
            .querySelector(location.hash)
            ?.scrollIntoView({ block: "start" }),
        50,
      );
  }
  congratulations();
  toolsPage();
})();
