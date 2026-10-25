/* Match the shared menu and body-only reading controls without altering progress. */
(() => {
  'use strict';
  const menu = document.getElementById('account-menu');
  const toggle = document.getElementById('profile-button');
  const header = document.querySelector('.site-header');
  const smaller = document.getElementById('text-smaller');
  const larger = document.getElementById('text-larger');
  const status = document.getElementById('text-size-status');
  const key = 'tjm-body-text-level';
  let level = 10;
  try {
    const saved = localStorage.getItem(key);
    const value = Number(saved);
    if (saved !== null && Number.isInteger(value)) level = Math.max(0, Math.min(39, value));
  } catch { /* Keep reading available if storage is blocked. */ }
  const scaleBody = window.createBodyTextScaler();
  function apply() {
    scaleBody(.75 + level * .025);
    smaller.disabled = level === 0;
    larger.disabled = level === 39;
    status.textContent = `${level + 1} / 40`;
  }
  function change(delta) {
    level = Math.max(0, Math.min(39, level + delta));
    try { localStorage.setItem(key, String(level)); } catch { /* Optional preference. */ }
    apply();
  }
  smaller.addEventListener('click', () => change(-1));
  larger.addEventListener('click', () => change(1));
  function syncMenu() {
    toggle.setAttribute('aria-expanded', String(!menu.hidden));
    toggle.setAttribute('aria-label', menu.hidden ? 'Open menu' : 'Close menu');
  }
  function closeMenu() { menu.hidden = true; syncMenu(); }
  // The app owns the toggle. Resizing body text must never close the menu.
  new MutationObserver(syncMenu).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  menu.addEventListener('click', event => {
    if (event.target.closest('#sign-out, #header-sign-in')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) { closeMenu(); toggle.focus(); }
  });
  function measureHeader() {
    document.documentElement.style.setProperty('--conflict-header-height', `${header.getBoundingClientRect().height}px`);
  }
  new ResizeObserver(measureHeader).observe(header);
  measureHeader();
  syncMenu();
  apply();
})();
