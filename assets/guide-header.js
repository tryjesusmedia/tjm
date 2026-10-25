(() => {
  const toggle = document.getElementById('guide-menu-toggle');
  const menu = document.getElementById('guide-header-menu');
  if (!toggle || !menu) return;
  const controls = document.querySelector('.guide-text-controls');
  if (controls) {
    controls.insertBefore(controls.querySelector('.guide-text-status'), controls.querySelector('[data-text-size="increase"]'));
    menu.prepend(controls);
  }
  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  toggle.addEventListener('click', () => setOpen(menu.hidden));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) { setOpen(false); toggle.focus(); }
  });
})();
