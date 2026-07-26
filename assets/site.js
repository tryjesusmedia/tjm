(() => {
  "use strict";

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

  const header = $("[data-header]");
  const progress = $("[data-progress]");
  const menuButton = $("[data-menu-button]");
  const menu = $("[data-menu]");
  const mobileCta = $("[data-mobile-cta]");
  const hero = $(".hero");

  const updateScrollUI = () => {
    const y = window.scrollY || document.documentElement.scrollTop;
    header?.classList.toggle("is-scrolled", y > 24);

    if (progress) {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = `${scrollable > 0 ? Math.min(100, (y / scrollable) * 100) : 0}%`;
    }

    if (mobileCta && hero) {
      mobileCta.classList.toggle("is-visible", y > hero.offsetHeight * 0.62);
    }
  };

  updateScrollUI();
  window.addEventListener("scroll", updateScrollUI, { passive: true });
  window.addEventListener("resize", updateScrollUI, { passive: true });

  menuButton?.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!open));
    menu?.classList.toggle("is-open", !open);
  });

  $$(".primary-nav a").forEach((link) => {
    link.addEventListener("click", () => {
      menuButton?.setAttribute("aria-expanded", "false");
      menu?.classList.remove("is-open");
    });
  });

  document.addEventListener("click", (event) => {
    if (!menu?.classList.contains("is-open")) return;
    if (menu.contains(event.target) || menuButton?.contains(event.target)) return;
    menu.classList.remove("is-open");
    menuButton?.setAttribute("aria-expanded", "false");
  });

  const revealItems = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -35px" });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  $$("details").forEach((detail) => {
    detail.addEventListener("toggle", () => {
      if (!detail.open) return;
      $$("details").forEach((other) => {
        if (other !== detail) other.open = false;
      });
    });
  });

  $$('[data-year]').forEach((node) => { node.textContent = String(new Date().getFullYear()); });

  const loadOmnisend = () => {
    const config = window.TJM_CONFIG || {};
    const shell = $("[data-omnisend-shell]");
    const mount = $("[data-omnisend-mount]");
    const loading = $("[data-omnisend-loading]");
    const brandId = String(config.omnisendBrandId || "").trim();
    const formId = String(config.omnisendFormId || "").trim();

    if (!shell || !mount) return;

    if (!brandId || !formId) {
      shell.classList.add("is-unconfigured");
      if (loading) loading.innerHTML = "<p><strong>The access form needs its Omnisend IDs.</strong><br>Open <code>assets/config.js</code> and add the brand and embedded form IDs.</p>";
      return;
    }

    mount.id = `omnisend-embedded-v2-${formId}`;
    window.omnisend = window.omnisend || [];
    window.omnisend.push(["brandID", brandId]);
    window.omnisend.push(["track", "$pageViewed"]);

    if (!document.querySelector('script[data-omnisend-launcher]')) {
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.async = true;
      script.src = "https://omnisnippet1.com/inshop/launcher-v2.js";
      script.dataset.omnisendLauncher = "true";
      script.onerror = () => {
        shell.classList.add("is-blocked");
        if (loading) loading.innerHTML = "<p><strong>The secure form could not load.</strong><br>Please disable content blocking for this page, then refresh.</p>";
      };
      document.head.appendChild(script);
    }

    const started = Date.now();
    const watch = window.setInterval(() => {
      const hasRenderedContent = mount.children.length > 0 || mount.innerHTML.trim().length > 50;
      if (hasRenderedContent) {
        shell.classList.add("is-ready");
        window.clearInterval(watch);
      } else if (Date.now() - started > 12000) {
        shell.classList.add("is-blocked");
        if (loading) loading.innerHTML = "<p><strong>The form is taking longer than expected.</strong><br>Refresh the page or check that the embedded form is published in Omnisend.</p>";
        window.clearInterval(watch);
      }
    }, 300);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadOmnisend, { once: true });
  } else {
    loadOmnisend();
  }
})();
