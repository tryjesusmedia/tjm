(() => {
  const invite = document.querySelector('.conflict-app-invite');
  if (!invite) return;
  const measure = () => document.documentElement.style.setProperty('--app-invite-height', `${invite.getBoundingClientRect().height}px`);
  measure();
  new ResizeObserver(measure).observe(invite);
})();
