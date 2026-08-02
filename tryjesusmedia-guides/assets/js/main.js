(() => {
  const header = document.querySelector('[data-header]');
  const year = document.querySelector('[data-year]');
  const revealItems = document.querySelectorAll('.reveal');
  const accordion = document.querySelector('[data-accordion]');

  if (year) year.textContent = new Date().getFullYear();

  const syncHeader = () => {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  };
  syncHeader();
  window.addEventListener('scroll', syncHeader, { passive: true });

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

  if (accordion) {
    accordion.addEventListener('click', (event) => {
      const trigger = event.target.closest('.accordion-trigger');
      if (!trigger) return;

      const item = trigger.closest('.accordion-item');
      const panel = item.querySelector('.accordion-panel');
      const icon = trigger.querySelector('.accordion-icon');
      const expanded = trigger.getAttribute('aria-expanded') === 'true';

      accordion.querySelectorAll('.accordion-trigger').forEach((otherTrigger) => {
        if (otherTrigger === trigger) return;
        const otherItem = otherTrigger.closest('.accordion-item');
        const otherPanel = otherItem.querySelector('.accordion-panel');
        const otherIcon = otherTrigger.querySelector('.accordion-icon');
        otherTrigger.setAttribute('aria-expanded', 'false');
        otherPanel.hidden = true;
        if (otherIcon) otherIcon.textContent = '+';
      });

      trigger.setAttribute('aria-expanded', String(!expanded));
      panel.hidden = expanded;
      if (icon) icon.textContent = expanded ? '+' : '−';
    });
  }
})();
