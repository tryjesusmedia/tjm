(() => {
  "use strict";

  const header = document.querySelector("[data-header]");
  const menuButton = document.querySelector("[data-menu-button]");
  const menu = document.querySelector("[data-menu]");
  const progress = document.querySelector("[data-progress]");
  const mobileCta = document.querySelector("[data-mobile-cta]");

  const updateScrollUI = () => {
    const y = window.scrollY || 0;
    header?.classList.toggle("is-scrolled", y > 20);
    mobileCta?.classList.toggle("is-visible", y > 520);

    if (progress) {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - doc.clientHeight);
      progress.style.width = `${Math.min(100, (y / max) * 100)}%`;
    }
  };

  updateScrollUI();
  window.addEventListener("scroll", updateScrollUI, { passive: true });

  if (menuButton && menu) {
    menuButton.addEventListener("click", () => {
      const open = menu.classList.toggle("is-open");
      menuButton.setAttribute("aria-expanded", String(open));
    });

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        menu.classList.remove("is-open");
        menuButton.setAttribute("aria-expanded", "false");
      });
    });
  }

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  const initOmnisend = () => {
    const config = window.TJM_CONFIG || {};
    const shell = document.querySelector("[data-omnisend-shell]");
    const mount = document.querySelector("[data-omnisend-form]");
    const loading = document.querySelector("[data-omnisend-loading]");

    if (!shell || !mount) return;

    const brandId = String(config.omnisendBrandId || "").trim();
    const formId = String(config.omnisendFormId || "").trim();

    if (!brandId || !formId || brandId.includes("YOUR_") || formId.includes("YOUR_")) {
      shell.classList.add("is-unconfigured");
      if (loading) {
        loading.innerHTML = "<p><strong>Signup form setup required.</strong><br>Open <code>assets/config.js</code> and add your Omnisend brand and form IDs.</p>";
      }
      return;
    }

    const embedded = document.createElement("div");
    embedded.id = `omnisend-embedded-v2-${formId}`;
    mount.appendChild(embedded);

    const markReady = () => shell.classList.add("is-ready");
    const mutationObserver = new MutationObserver(() => {
      if (embedded.children.length || embedded.textContent.trim()) {
        markReady();
        mutationObserver.disconnect();
      }
    });
    mutationObserver.observe(embedded, { childList: true, subtree: true, characterData: true });

    window.omnisend = window.omnisend || [];
    window.omnisend.push(["brandID", brandId]);
    window.omnisend.push(["track", "$pageViewed"]);

    if (!document.querySelector('script[src*="omnisnippet1.com/inshop/launcher-v2.js"]')) {
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.async = true;
      script.src = "https://omnisnippet1.com/inshop/launcher-v2.js";
      script.onload = () => setTimeout(() => {
        if (embedded.children.length || embedded.textContent.trim()) markReady();
      }, 600);
      script.onerror = () => {
        shell.classList.add("is-unconfigured");
        if (loading) {
          loading.innerHTML = "<p>The secure signup form could not load. Please disable content blockers and refresh the page.</p>";
        }
      };
      document.head.appendChild(script);
    }

    setTimeout(() => {
      if (!shell.classList.contains("is-ready")) {
        if (loading) loading.querySelector("p").textContent = "The signup form is taking longer than expected. Please refresh or disable content blockers.";
      }
    }, 8000);
  };

  initOmnisend();
})();
