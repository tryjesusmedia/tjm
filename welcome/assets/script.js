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
    progress.style.width = `${scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0}%`;
  };
  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  // Change only each data-youtube-url value in index.html.
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
    } catch (_) { return ''; }
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


  const journeySets = document.querySelectorAll('.journey-card');
  journeySets.forEach((journey) => {
    journey.addEventListener('toggle', () => {
      if (!journey.open) return;
      journeySets.forEach((other) => {
        if (other !== journey) other.open = false;
      });
    });
  });

  const items = document.querySelectorAll('.reveal');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    items.forEach((item) => observer.observe(item));
  }
})();
