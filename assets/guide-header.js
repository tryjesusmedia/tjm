(() => {
  const toggle = document.getElementById('guide-menu-toggle');
  const menu = document.getElementById('guide-header-menu');
  if (!toggle || !menu) return;
  const controls = document.querySelector('.guide-text-controls');
  if (controls) {
    controls.insertBefore(controls.querySelector('.guide-text-status'), controls.querySelector('[data-text-size="increase"]'));
    menu.prepend(controls);
  }
  const spanish = document.documentElement.lang.toLowerCase().startsWith('es') || /^\/es(?:\/|$)/.test(location.pathname);
  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', spanish ? (open ? 'Cerrar menú' : 'Abrir menú') : (open ? 'Close menu' : 'Open menu'));
  }
  toggle.addEventListener('click', () => setOpen(menu.hidden));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) { setOpen(false); toggle.focus(); }
  });
})();
