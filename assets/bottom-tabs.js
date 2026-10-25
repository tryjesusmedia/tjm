/* One bottom bar, deliberately restricted to these three top-level pages. */
(() => {
  'use strict';
  const path = location.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '').toLowerCase();
  const allowed = ['/chronbible', '/bibledecoded', '/welcome'];
  if (!allowed.includes(path)) return;
  let bar = document.querySelector('.chron-bottom-tabs');
  if (!bar) {
    const template = document.createElement('template');
    template.innerHTML = "<nav class=\"chron-bottom-tabs\" aria-label=\"Main app navigation\">\n    <a href=\"/chronbible/\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 5v15M3 4c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2Z\"/></svg><span>ChronBible</span></a>\n    <a href=\"/bibledecoded/\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"m10 8 6 4-6 4Z\"/></svg><span>Bible Decoded</span></a>\n    <a href=\"/welcome/\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"2\"/></svg><span>Other Resources</span></a>\n  </nav>";
    bar = template.content.firstElementChild;
    document.body.append(bar);
  }
  bar.id = 'tjm-bottom-tabs';
  document.body.classList.add('tjm-tabbed-page');
  bar.querySelectorAll('a').forEach(link => {
    if (new URL(link.href).pathname.replace(/\/+$/, '') === path) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  function measure() {
    document.documentElement.style.setProperty('--tjm-bottom-bar-height', bar.getBoundingClientRect().height + 'px');
  }
  new ResizeObserver(measure).observe(bar);
  measure();
})();
