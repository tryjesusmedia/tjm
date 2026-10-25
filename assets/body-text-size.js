/* Shared body-only reading scale. Keep roots, headings and controls stable. */
window.createBodyTextScaler = function () {
  const originals = new Map();
  const fixed = 'a,h1,h2,h3,h4,h5,h6,button,summary,nav,header,footer,[role="button"],[role="heading"],.button,.brand,.eyebrow,.card-kicker,.section-label,.number,.reading-number,.journey-reading strong,.book-progress-row header,.account-menu,.guide-reader-toolbar,.text-tools,.breadcrumb,.actions,.store-label';
  let scale = 1, queued = false;
  function apply() {
    queued = false;
    for (const [el, old] of originals) {
      if (!el.isConnected) { originals.delete(el); continue; }
      el.style.setProperty('font-size', old.size, old.priority);
      el.style.setProperty('line-height', old.line, old.linePriority);
    }
    const values = [];
    document.body.querySelectorAll('*').forEach(el => {
      if (el.closest('svg,script,style')) return;
      const text = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (!text && !el.matches('input,textarea,select')) return;
      if (!originals.has(el)) originals.set(el, {size:el.style.getPropertyValue('font-size'),priority:el.style.getPropertyPriority('font-size'),line:el.style.getPropertyValue('line-height'),linePriority:el.style.getPropertyPriority('line-height')});
      const css = getComputedStyle(el);
      values.push([el, parseFloat(css.fontSize), parseFloat(css.lineHeight), el.closest(fixed) ? 1 : scale]);
    });
    for (const [el, size, line, factor] of values) {
      el.style.setProperty('font-size', size * factor + 'px', 'important');
      if (Number.isFinite(line)) el.style.setProperty('line-height', line * factor + 'px', 'important');
    }
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(apply); } }
  new MutationObserver(schedule).observe(document.body, {childList:true,subtree:true});
  window.addEventListener('resize', schedule);
  return value => { scale = value; apply(); };
};
