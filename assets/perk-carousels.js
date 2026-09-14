(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-perk-carousel]').forEach(carousel => {
    const slides = [...carousel.querySelectorAll('.perk-slide')];
    const pauseButton = carousel.querySelector('[data-pause]');
    let index = 0;
    let paused = reducedMotion.matches;
    let timer;
    let hovered = false;
    const show = next => {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, i) => { slide.hidden = i !== index; });
      carousel.querySelector('[data-slide-count]').textContent = `${index + 1} / ${slides.length}`;
    };
    const schedule = () => {
      clearInterval(timer);
      pauseButton.textContent = paused ? 'Play' : 'Pause';
      pauseButton.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} ${carousel.dataset.perkCarousel} carousel`);
      if (!paused && !hovered && !document.hidden && !carousel.contains(document.activeElement)) {
        timer = setInterval(() => show(index + 1), 3000);
      }
    };
    carousel.querySelector('[data-next]').addEventListener('click', () => { show(index + 1); schedule(); });
    carousel.querySelector('[data-previous]').addEventListener('click', () => { show(index - 1); schedule(); });
    pauseButton.addEventListener('click', () => { paused = !paused; schedule(); });
    carousel.addEventListener('mouseenter', () => { hovered = true; schedule(); });
    carousel.addEventListener('mouseleave', () => { hovered = false; schedule(); });
    carousel.addEventListener('focusin', schedule);
    carousel.addEventListener('focusout', () => setTimeout(schedule, 0));
    document.addEventListener('visibilitychange', schedule);
    reducedMotion.addEventListener('change', event => { paused = event.matches; schedule(); });
    schedule();

    const isStore = carousel.dataset.perkCarousel === 'store';
    fetch(isStore ? '/assets/perks/catalog.json' : '/api/latest-episodes')
      .then(response => { if (!response.ok) throw new Error('Previews unavailable'); return response.json(); })
      .then(data => {
        if (!Array.isArray(data) || data.length < 3) return;
        if (isStore) {
          // Select three distinct products for this visit, without changing signup links.
          for (let i = data.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [data[i], data[j]] = [data[j], data[i]];
          }
        }
        data.slice(0, 3).forEach((item, i) => {
          const src = isStore ? item.image : (/^[\w-]{11}$/.test(item.id) ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` : '');
          if (!src || (isStore && !src.startsWith('https://imgproxy.fourthwall.dev/'))) return;
          const img = slides[i].querySelector('img');
          img.src = src;
          img.alt = item.title || (isStore ? 'Try Jesus Media product' : 'Try Jesus Media episode');
        });
      })
      .catch(() => { /* Keep the verified previews already present in the HTML. */ });
  });
})();
