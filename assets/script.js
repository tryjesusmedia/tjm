(() => {
  'use strict';

  const menuToggle = document.getElementById('menuToggle');
  const siteNav = document.getElementById('siteNav');
  const progress = document.getElementById('pageProgress');
  const year = document.getElementById('currentYear');

  if (year) year.textContent = String(new Date().getFullYear());

  if (menuToggle && siteNav) {
    menuToggle.addEventListener('click', () => {
      const open = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!open));
      menuToggle.setAttribute('aria-label', open ? 'Open navigation' : 'Close navigation');
      siteNav.classList.toggle('is-open', !open);
    });

    siteNav.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        siteNav.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Open navigation');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && siteNav.classList.contains('is-open')) {
        siteNav.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.focus();
      }
    });
  }

  const updateProgress = () => {
    if (!progress) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const percentage = scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0;
    progress.style.width = `${percentage}%`;
  };

  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  // FEATURED VIDEO EDITING:
  // Change only each data-youtube-url value in index.html.
  // This script extracts the video ID and uses YouTube's lightweight 320x180 thumbnail.
  const getYouTubeId = (value) => {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.href);
      if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
      if (url.hostname.includes('youtube.com')) {
        if (url.searchParams.get('v')) return url.searchParams.get('v');
        const parts = url.pathname.split('/').filter(Boolean);
        const marker = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part));
        if (marker >= 0 && parts[marker + 1]) return parts[marker + 1];
      }
    } catch (_) {
      return '';
    }
    return '';
  };

  document.querySelectorAll('.js-youtube-card[data-youtube-url]').forEach((card) => {
    const url = card.dataset.youtubeUrl.trim();
    const id = getYouTubeId(url);
    if (!url || !id) return;

    card.querySelectorAll('.js-youtube-link').forEach((link) => {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });

    const thumbnail = card.querySelector('.js-youtube-thumbnail');
    if (thumbnail) thumbnail.src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  });

  // Help repeated CTA links move keyboard focus to the embedded form.
  document.querySelectorAll('a[href="#guide-form"]').forEach((link) => {
    link.addEventListener('click', () => {
      window.setTimeout(() => document.getElementById('guide-form')?.focus({ preventScroll: true }), 650);
    });
  });


  // Omnisend injects its form after page load. Some generated wrappers use
  // a tall fixed/minimum height with vertical space distribution. Compact
  // only wrappers that actually contain form controls.
  const omnisendRoot = document.getElementById('omnisend-embedded-v2-69965e87faf307608c8f562a');

  if (omnisendRoot) {
    let compactScheduled = false;

    const compactOmnisendForm = () => {
      compactScheduled = false;

      const layoutNodes = [
        omnisendRoot,
        ...omnisendRoot.querySelectorAll('form, section, article, main, div')
      ];

      layoutNodes.forEach((node) => {
        if (node !== omnisendRoot && !node.querySelector('input, textarea, select, button')) return;

        const computed = window.getComputedStyle(node);
        const renderedHeight = node.getBoundingClientRect().height;
        const minimumHeight = Number.parseFloat(computed.minHeight) || 0;
        const isVerticalFlex =
          computed.display.includes('flex') &&
          (computed.flexDirection === 'column' || computed.flexDirection === 'column-reverse');
        const distributesSpace = ['space-between', 'space-around', 'space-evenly'].includes(computed.justifyContent);

        node.style.setProperty('min-height', '0', 'important');
        node.style.setProperty('max-height', 'none', 'important');

        if (renderedHeight > 520 || minimumHeight > 420) {
          node.style.setProperty('height', 'auto', 'important');
        }

        if (isVerticalFlex && distributesSpace) {
          node.style.setProperty('justify-content', 'flex-start', 'important');
        }
      });

      omnisendRoot.style.setProperty('height', 'auto', 'important');
      omnisendRoot.style.setProperty('min-height', '0', 'important');
    };

    const scheduleCompact = () => {
      if (compactScheduled) return;
      compactScheduled = true;
      window.requestAnimationFrame(compactOmnisendForm);
    };

    const omnisendObserver = new MutationObserver(scheduleCompact);
    omnisendObserver.observe(omnisendRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    scheduleCompact();
    window.addEventListener('load', scheduleCompact, { once: true });
    window.addEventListener('resize', scheduleCompact);
    window.setTimeout(scheduleCompact, 500);
    window.setTimeout(scheduleCompact, 1500);
    window.setTimeout(scheduleCompact, 3000);
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    items.forEach((item) => observer.observe(item));
  }
})();
