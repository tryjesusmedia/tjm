/* Site text has a 14-point floor. Stored reading scales no longer apply. */
(() => {
  'use strict';
  if (window.tjmMinimumTextLoaded) return;
  window.tjmMinimumTextLoaded = true;
  const minimum = 14 * 96 / 72;
  const excluded = 'svg,script,style,noscript,[id^="omnisend-"],[data-omnisend-shell]';
  const originals = new Map();
  let queued = false;
  // Keep old page initializers compatible without applying saved font scales.
  window.createBodyTextScaler = () => schedule;
  const style = document.createElement('style');
  style.textContent = 'html body .text-size-controls,html body .guide-text-controls,html body .text-tools {display:none!important}';
  document.head.append(style);
  function apply() {
    queued = false;
    if (!document.body) return;
    for (const [el, old] of originals) {
      if (!el.isConnected) { originals.delete(el); continue; }
      el.style.setProperty('font-size', old.size, old.priority);
    }
    // Snapshot first so enlarging a parent cannot enlarge an already-large child.
    const values = [];
    document.body.querySelectorAll('*').forEach(el => {
      if (el.closest(excluded)) return;
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (!hasText && !el.matches('input,textarea,select,option')) return;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (Number.isFinite(size)) values.push([el, Math.max(minimum, size)]);
    });
    for (const [el, size] of values) {
      if (Math.abs(parseFloat(getComputedStyle(el).fontSize) - size) < .001) continue;
      if (!originals.has(el)) originals.set(el, {
        size:el.style.getPropertyValue('font-size'), priority:el.style.getPropertyPriority('font-size')
      });
      el.style.setProperty('font-size', size + 'px', 'important');
    }
  }
  function schedule() {
    if (!queued) { queued = true; requestAnimationFrame(apply); }
  }
  function start() {
    apply();
    new MutationObserver(records => {
      if (records.some(r => !r.target.parentElement?.closest(excluded))) schedule();
    }).observe(document.body, { childList:true, characterData:true, subtree:true });
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    document.fonts?.ready.then(schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
