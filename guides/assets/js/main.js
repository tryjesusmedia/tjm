(() => {
  "use strict";

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

  const revealItems = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  $$('.accordion details').forEach((detail) => {
    detail.addEventListener('toggle', () => {
      if (!detail.open) return;
      $$('.accordion details').forEach((other) => {
        if (other !== detail) other.open = false;
      });
    });
  });

  const loadOmnisend = () => {
    const config = window.TJM_CONFIG || {};
    const shell = $('[data-omnisend-shell]');
    const mount = $('[data-omnisend-mount]');
    const loading = $('[data-omnisend-loading]');
    const brandId = String(config.omnisendBrandId || '').trim();
    const formId = String(config.omnisendFormId || '').trim();

    if (!shell || !mount) return;

    if (!brandId || !formId) {
      shell.classList.add('is-unconfigured');
      if (loading) {
        loading.innerHTML = '<p><strong>The request form needs its Omnisend IDs.</strong><br>Check <code>assets/js/config.js</code>.</p>';
      }
      return;
    }

    mount.id = `omnisend-embedded-v2-${formId}`;
    window.omnisend = window.omnisend || [];
    window.omnisend.push(['brandID', brandId]);
    window.omnisend.push(['track', '$pageViewed']);

    if (!document.querySelector('script[data-omnisend-launcher]')) {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.src = 'https://omnisnippet1.com/inshop/launcher-v2.js';
      script.dataset.omnisendLauncher = 'true';
      script.onerror = () => {
        shell.classList.add('is-blocked');
        if (loading) {
          loading.innerHTML = '<p><strong>The secure form could not load.</strong><br>Please disable content blocking for this page, then refresh.</p>';
        }
      };
      document.head.appendChild(script);
    }

    const started = Date.now();
    const watch = window.setInterval(() => {
      const hasRenderedContent = mount.children.length > 0 || mount.innerHTML.trim().length > 50;
      if (hasRenderedContent) {
        shell.classList.add('is-ready');
        window.clearInterval(watch);
      } else if (Date.now() - started > 12000) {
        shell.classList.add('is-blocked');
        if (loading) {
          loading.innerHTML = '<p><strong>The form is taking longer than expected.</strong><br>Refresh the page or confirm that the embedded form is published in Omnisend.</p>';
        }
        window.clearInterval(watch);
      }
    }, 300);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadOmnisend, { once: true });
  } else {
    loadOmnisend();
  }
})();
