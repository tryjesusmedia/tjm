(() => {
  'use strict';
  const art = window.TJMReadingBadges;
  const dialog = document.getElementById('reading-badge-viewer');
  const image = document.getElementById('expanded-reading-badge');
  const shrinkButton = document.getElementById('shrink-reading-badge');
  const closeButton = document.getElementById('close-reading-badge');
  let selectedId = null;
  let opener = null;
  let closing = false;
  let closeTimer = null;

  function finishClose() {
    const id = selectedId;
    clearTimeout(closeTimer);
    closeTimer = null;
    dialog.close();
    dialog.classList.remove('is-closing');
    document.body.classList.remove('badge-viewer-open');
    selectedId = null;
    closing = false;
    const target = opener?.isConnected ? opener : document.querySelector(`[data-reading-badge="${id}"]`);
    target?.focus({ preventScroll: true });
    opener = null;
  }

  function close(immediate = false) {
    if (!dialog.open) return;
    if (closing && !immediate) return;
    if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finishClose(); return; }
    closing = true;
    dialog.classList.add('is-closing');
    closeTimer = setTimeout(finishClose, 180);
  }

  function open(readingId, trigger) {
    const badge = art.getBadge(readingId);
    const reading = window.TJM_CHRONBIBLE_PLAN?.readings?.find(item => item.id === readingId);
    if (!badge || !dialog || closing) return;
    selectedId = readingId;
    opener = trigger;
    image.src = art.badgeDataUri(badge);
    image.alt = reading?.title || `Insignia de la lectura ${badge.day}`;
    shrinkButton.setAttribute('aria-label', `Reducir insignia de la lectura ${badge.day}`);
    document.getElementById('badge-viewer-reading').textContent = `LECTURA ${badge.day} · ${reading?.section || badge.book}`;
    document.getElementById('badge-viewer-source').textContent = reading?.title || badge.title;
    document.getElementById('badge-viewer-reference').textContent = reading?.reference || badge.reference;
    dialog.classList.remove('is-closing');
    document.body.classList.add('badge-viewer-open');
    dialog.showModal();
    shrinkButton.focus({ preventScroll: true });
  }

  shrinkButton.addEventListener('click', () => close());
  closeButton.addEventListener('click', () => close());
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  window.TJMReadingBadgeViewer = { open, close, selectedId: () => selectedId };
})();
